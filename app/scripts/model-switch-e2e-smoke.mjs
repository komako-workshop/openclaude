import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import os from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { _electron as electron } from 'playwright'

const __dirname = dirname(fileURLToPath(import.meta.url))

function getAppDataPath() {
  if (process.platform === 'darwin') {
    return join(os.homedir(), 'Library', 'Application Support')
  }

  if (process.platform === 'win32') {
    return process.env.APPDATA ?? join(os.homedir(), 'AppData', 'Roaming')
  }

  return process.env.XDG_CONFIG_HOME ?? join(os.homedir(), '.config')
}

function getUserDataPath(root = getAppDataPath()) {
  return join(root, 'OpenClaude')
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function shortModelName(model) {
  return model.split('/').pop() ?? model
}

function chooseModels(baseURL) {
  if (baseURL.includes('openrouter.ai')) {
    return {
      initial: { value: 'anthropic/claude-sonnet-4.6', label: 'Claude Sonnet 4.6' },
      target: { value: 'anthropic/claude-opus-4.6', label: 'Claude Opus 4.6' },
    }
  }

  return {
    initial: { value: 'claude-sonnet-4-6-20260217', label: 'Claude Sonnet 4.6' },
    target: { value: 'claude-opus-4-6-20260204', label: 'Claude Opus 4.6' },
  }
}

async function waitForLastAssistantText(page, predicate, description, timeoutMs = 120000) {
  const startedAt = Date.now()
  let lastSeen = ''

  while (Date.now() - startedAt < timeoutMs) {
    const blocks = page.locator('.markdown-body')
    const count = await blocks.count()
    if (count > 0) {
      const text = (await blocks.nth(count - 1).innerText()).trim()
      lastSeen = text
      if (predicate(text)) {
        return text
      }
    }

    await page.waitForTimeout(500)
  }

  throw new Error(`等待 assistant ${description} 超时，最后看到：${lastSeen || '(empty)'}`)
}

async function main() {
  const sourceSettingsPath = join(getUserDataPath(), 'settings.json')
  if (!existsSync(sourceSettingsPath)) {
    throw new Error(`找不到设置文件：${sourceSettingsPath}`)
  }

  const sourceSettings = JSON.parse(readFileSync(sourceSettingsPath, 'utf8'))
  assert.ok(sourceSettings.apiKey, '当前本机 OpenClaude 未配置 API key，无法执行真实 E2E 回归')
  assert.ok(sourceSettings.baseURL, '当前本机 OpenClaude 未配置 baseURL，无法执行真实 E2E 回归')

  const models = chooseModels(sourceSettings.baseURL)
  const isolatedRoot = mkdtempSync(join(os.tmpdir(), 'openclaude-model-switch-e2e-'))
  const isolatedUserData = getUserDataPath(isolatedRoot)
  mkdirSync(isolatedUserData, { recursive: true })

  const testSettings = {
    ...sourceSettings,
    model: models.initial.value,
  }
  writeFileSync(join(isolatedUserData, 'settings.json'), JSON.stringify(testSettings, null, 2))

  const electronApp = await electron.launch({
    args: [join(__dirname, '..', 'dist-electron', 'main', 'index.js')],
    cwd: join(__dirname, '..'),
    env: {
      ...process.env,
      OPENCLAUDE_APPDATA_DIR: isolatedRoot,
    },
  })

  let page
  try {
    page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    const input = page.getByPlaceholder(/Message OpenClaude/)
    await input.waitFor({ timeout: 30000 })

    const initialShortModel = shortModelName(models.initial.value)
    const targetShortModel = shortModelName(models.target.value)

    await page.getByRole('button', { name: new RegExp(escapeRegex(initialShortModel), 'i') }).first().waitFor({ timeout: 30000 })

    const marker = `model-switch-regression-${Date.now()}`
    await input.fill(`Remember this exact phrase for a model switch regression test: ${marker}. Reply with only READY.`)
    await input.press('Enter')

    const firstReply = await waitForLastAssistantText(
      page,
      (text) => /^ready\b/i.test(text),
      '返回 READY',
    )

    await page.waitForTimeout(1500)

    await page.getByRole('button', { name: new RegExp(escapeRegex(initialShortModel), 'i') }).first().click()
    const searchInput = page.getByPlaceholder('Search models…')
    await searchInput.waitFor({ timeout: 10000 })
    await searchInput.fill(models.target.label)
    await page.getByRole('button', { name: new RegExp(`^${escapeRegex(models.target.label)}$`) }).click()
    await page.getByRole('button', { name: new RegExp(escapeRegex(targetShortModel), 'i') }).first().waitFor({ timeout: 15000 })

    await input.fill('What exact phrase did I ask you to remember earlier? Reply with only the exact phrase.')
    await input.press('Enter')

    const secondReply = await waitForLastAssistantText(
      page,
      (text) => text !== firstReply && text.includes(marker),
      '回忆出第一条消息里的 marker',
    )

    await page.waitForTimeout(1500)
    await electronApp.close()

    const sessionDir = join(isolatedUserData, 'agent-sessions')
    const sessionFiles = existsSync(sessionDir)
      ? readdirSync(sessionDir).filter((file) => file.endsWith('.json'))
      : []

    assert.ok(sessionFiles.length > 0, '未发现持久化 agent session 文件')

    const persisted = JSON.parse(readFileSync(join(sessionDir, sessionFiles[0]), 'utf8'))
    assert.equal(typeof persisted.fingerprint, 'string', 'session fingerprint 缺失')
    assert.ok(persisted.fingerprint.startsWith('2|'), `期望新 fingerprint 以 2| 开头，实际为：${persisted.fingerprint}`)

    console.log('[smoke:model-switch-e2e] PASS')
    console.log(JSON.stringify({
      baseURL: testSettings.baseURL,
      initialModel: models.initial.value,
      switchedModel: models.target.value,
      rememberedMarker: marker,
      firstReply,
      secondReply,
      sessionFileCount: sessionFiles.length,
      fingerprint: persisted.fingerprint,
    }, null, 2))
  } finally {
    try {
      await electronApp.close()
    } catch {}

    rmSync(isolatedRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error('[smoke:model-switch-e2e] FAIL')
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exit(1)
})
