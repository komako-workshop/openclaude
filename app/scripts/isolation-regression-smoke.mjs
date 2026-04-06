import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import electronBinary from 'electron'
import { _electron as electron } from 'playwright'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const appDir = path.resolve(__dirname, '..')
const realUserDataDir = path.join(os.homedir(), 'Library', 'Application Support', 'OpenClaude')
const realSettingsPath = path.join(realUserDataDir, 'settings.json')
const tempAppDataDir = path.join(os.tmpdir(), `openclaude-isolation-appdata-${Date.now()}`)
const tempUserDataDir = path.join(tempAppDataDir, 'OpenClaude')

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2))
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function assert(condition, message, extra = {}) {
  if (!condition) {
    const error = new Error(message)
    error.extra = extra
    throw error
  }
}

function buildCleanChatState() {
  const now = Date.now()
  return {
    conversations: [
      {
        id: 'smoke-seed-0',
        title: 'New chat',
        messages: [],
        createdAt: now,
        updatedAt: now,
      },
    ],
    activeId: 'smoke-seed-0',
  }
}

async function waitForCondition(label, timeoutMs, intervalMs, fn) {
  const startedAt = Date.now()
  let lastExtra = null

  while (Date.now() - startedAt < timeoutMs) {
    const result = await fn()
    if (result.ok) return result.value
    lastExtra = result.extra ?? null
    await sleep(intervalMs)
  }

  const error = new Error(`Timed out waiting for ${label}`)
  error.extra = lastExtra ?? {}
  throw error
}

async function getBodyText(page) {
  return page.evaluate(() => document.body.innerText)
}

async function installProbe(page) {
  await page.evaluate(() => {
    const probe = {
      events: [],
      done: [],
      errors: [],
      firstConversationIds: [],
    }

    const rememberConversation = (conversationId) => {
      if (!conversationId || probe.firstConversationIds.includes(conversationId)) return
      probe.firstConversationIds.push(conversationId)
    }

    const offEvent = window.openclaude.on('agent:event', (payload) => {
      const conversationId = payload?.conversationId ?? null
      rememberConversation(conversationId)
      probe.events.push({
        conversationId,
        type: payload?.event?.type ?? null,
        subtype: payload?.event?.subtype ?? null,
        nestedType: payload?.event?.event?.type ?? null,
        at: Date.now(),
      })
    })

    const offDone = window.openclaude.on('agent:done', (payload) => {
      const conversationId = payload?.conversationId ?? null
      rememberConversation(conversationId)
      probe.done.push({ conversationId, at: Date.now() })
    })

    const offError = window.openclaude.on('agent:error', (payload) => {
      const conversationId = payload?.conversationId ?? null
      rememberConversation(conversationId)
      probe.errors.push({ conversationId, error: payload?.error ?? null, at: Date.now() })
    })

    window.__isolationProbe = probe
    window.__disposeIsolationProbe = () => {
      offEvent()
      offDone()
      offError()
    }
  })
}

async function getProbe(page) {
  return page.evaluate(() => window.__isolationProbe)
}

async function clickNewChat(page) {
  await page.locator('button').filter({ hasText: 'New Chat' }).first().click()
  await page.waitForTimeout(180)
}

async function sendPrompt(page, prompt) {
  const textarea = page.locator('textarea').first()
  await textarea.fill(prompt)
  await textarea.press('Enter')
  await page.waitForTimeout(180)
}

async function clickConversation(page, label) {
  await page.locator('aside').getByText(label, { exact: false }).first().click()
  await page.waitForTimeout(240)
}

function findConversation(chatState, conversationId) {
  return chatState.conversations.find((conversation) => conversation.id === conversationId)
}

function assistantText(conversation) {
  return conversation.messages
    .filter((message) => message.role === 'assistant')
    .map((message) => message.content || '')
    .join('\n')
}

async function main() {
  assert(fs.existsSync(realSettingsPath), 'Missing OpenClaude settings file; cannot run live isolation smoke test.')

  const realSettings = readJson(realSettingsPath)
  assert(realSettings.apiKey, 'Missing API key in OpenClaude settings; cannot run live isolation smoke test.')

  const smokeSettings = {
    ...realSettings,
    model: realSettings.baseURL?.includes('openrouter.ai')
      ? 'anthropic/claude-sonnet-4.6'
      : 'claude-sonnet-4-6-20260217',
  }

  fs.rmSync(tempAppDataDir, { recursive: true, force: true })
  fs.mkdirSync(tempUserDataDir, { recursive: true })
  writeJson(path.join(tempUserDataDir, 'settings.json'), smokeSettings)
  writeJson(path.join(tempUserDataDir, 'chat-state.json'), buildCleanChatState())

  const app = await electron.launch({
    executablePath: electronBinary,
    args: ['.'],
    cwd: appDir,
    env: {
      ...process.env,
      OPENCLAUDE_APPDATA_DIR: tempAppDataDir,
      VITE_DEV_SERVER_URL: 'http://localhost:5173',
    },
  })

  const report = {
    appPaths: null,
    overlap: null,
    domChecks: null,
    persistedChecks: null,
  }

  try {
    report.appPaths = await app.evaluate(async ({ app }) => ({
      appData: app.getPath('appData'),
      userData: app.getPath('userData'),
    }))

    assert(report.appPaths.appData === tempAppDataDir, 'Electron appData override did not take effect.', report.appPaths)
    assert(report.appPaths.userData.startsWith(tempAppDataDir), 'Electron userData path is not isolated.', report.appPaths)

    const page = await app.firstWindow()
    await page.waitForSelector('textarea', { timeout: 15000 })
    await page.waitForTimeout(1200)

    const initialBody = await getBodyText(page)
    assert(!initialBody.includes('大概一两年前'), 'Clean smoke instance still shows real chat history.', {
      preview: initialBody.slice(0, 300),
      appPaths: report.appPaths,
    })

    await installProbe(page)

    const promptA = [
      'A-ISOLATION prompt.',
      'Reply with exactly 12 short lines.',
      'Each line must start with A-ISOLATION- and then a two-digit number from 01 to 12.',
      'No markdown.',
    ].join(' ')
    const promptB = [
      'B-ISOLATION prompt.',
      'Reply with exactly 12 short lines.',
      'Each line must start with B-ISOLATION- and then a two-digit number from 01 to 12.',
      'No markdown.',
    ].join(' ')
    const promptC = 'C-ISOLATION prompt. Reply with exactly one short line containing only C-ISOLATION-OK.'

    await sendPrompt(page, promptA)
    await clickNewChat(page)
    await sendPrompt(page, promptB)

    const conversationA = 'smoke-seed-0'

    const overlap = await waitForCondition(
      'both conversation event streams',
      120000,
      400,
      async () => {
        const probe = await getProbe(page)
        if (probe.errors.length > 0) {
          return { ok: false, extra: { errors: probe.errors } }
        }

        const conversationB = probe.firstConversationIds.find((conversationId) => conversationId && conversationId !== conversationA)
        if (!conversationB) {
          return { ok: false, extra: { probe } }
        }

        const firstEventA = probe.events.find((entry) => entry.conversationId === conversationA)
        const firstEventB = probe.events.find((entry) => entry.conversationId === conversationB)
        const firstDoneA = probe.done.find((entry) => entry.conversationId === conversationA)
        const firstDoneB = probe.done.find((entry) => entry.conversationId === conversationB)

        const overlapped =
          (firstEventA && firstEventB && (!firstDoneA || firstEventB.at < firstDoneA.at))
          || (firstEventA && firstEventB && (!firstDoneB || firstEventA.at < firstDoneB.at))

        if (overlapped) {
          return {
            ok: true,
            value: {
              conversationA,
              conversationB,
              firstEventA,
              firstEventB,
              firstDoneA: firstDoneA ?? null,
              firstDoneB: firstDoneB ?? null,
            },
          }
        }

        return { ok: false, extra: { probe } }
      },
    )

    report.overlap = overlap

    const completedAB = await waitForCondition(
      'A/B completion',
      180000,
      750,
      async () => {
        const probe = await getProbe(page)
        if (probe.errors.length > 0) {
          return { ok: false, extra: { errors: probe.errors } }
        }

        const doneIds = new Set(probe.done.map((entry) => entry.conversationId))
        const ok = doneIds.has(overlap.conversationA) && doneIds.has(overlap.conversationB)
        return ok ? { ok: true, value: probe } : { ok: false, extra: { probe } }
      },
    )

    await clickConversation(page, 'A-ISOLATION prompt.')
    const bodyA = await getBodyText(page)
    await clickConversation(page, 'B-ISOLATION prompt.')
    const bodyB = await getBodyText(page)

    assert(bodyA.includes('A-ISOLATION-01'), 'Conversation A DOM is missing A output token.', { bodyA })
    assert(!bodyA.includes('B-ISOLATION-01'), 'Conversation A DOM leaked B output token.', { bodyA })
    assert(bodyB.includes('B-ISOLATION-01'), 'Conversation B DOM is missing B output token.', { bodyB })
    assert(!bodyB.includes('A-ISOLATION-01'), 'Conversation B DOM leaked A output token.', { bodyB })

    await clickNewChat(page)
    await sendPrompt(page, promptC)

    const completedABC = await waitForCondition(
      'C completion',
      120000,
      750,
      async () => {
        const probe = await getProbe(page)
        if (probe.errors.length > 0) {
          return { ok: false, extra: { errors: probe.errors } }
        }

        const conversationC = probe.firstConversationIds.find((conversationId) =>
          conversationId
          && conversationId !== conversationA
          && conversationId !== overlap.conversationB,
        )
        if (!conversationC) return { ok: false, extra: { probe } }

        const doneIds = new Set(probe.done.map((entry) => entry.conversationId))
        return doneIds.has(conversationC)
          ? { ok: true, value: { probe, conversationC } }
          : { ok: false, extra: { probe } }
      },
    )

    await clickConversation(page, 'C-ISOLATION prompt.')
    const bodyC = await getBodyText(page)
    assert(bodyC.includes('C-ISOLATION-OK'), 'Conversation C DOM is missing C output token.', { bodyC })
    assert(!bodyC.includes('A-ISOLATION-01'), 'Conversation C DOM leaked A output token.', { bodyC })
    assert(!bodyC.includes('B-ISOLATION-01'), 'Conversation C DOM leaked B output token.', { bodyC })

    report.domChecks = {
      conversationA,
      conversationB: overlap.conversationB,
      conversationC: completedABC.conversationC,
      doneCount: completedAB.done.length,
    }

    await page.waitForTimeout(900)
    await page.evaluate(() => {
      if (window.__disposeIsolationProbe) window.__disposeIsolationProbe()
    })
  } finally {
    await app.close()
  }

  const persistedChatStatePath = path.join(tempUserDataDir, 'chat-state.json')
  const persistedChatState = readJson(persistedChatStatePath)
  const sessionDir = path.join(tempUserDataDir, 'agent-sessions')
  const sessionFiles = fs.existsSync(sessionDir) ? fs.readdirSync(sessionDir).filter((file) => file.endsWith('.json')) : []

  const conversationA = report.domChecks.conversationA
  const conversationB = report.domChecks.conversationB
  const conversationC = report.domChecks.conversationC

  const chatA = findConversation(persistedChatState, conversationA)
  const chatB = findConversation(persistedChatState, conversationB)
  const chatC = findConversation(persistedChatState, conversationC)

  assert(chatA, 'Persisted chat-state is missing conversation A.', { conversationA })
  assert(chatB, 'Persisted chat-state is missing conversation B.', { conversationB })
  assert(chatC, 'Persisted chat-state is missing conversation C.', { conversationC })

  const assistantA = assistantText(chatA)
  const assistantB = assistantText(chatB)
  const assistantC = assistantText(chatC)

  assert(assistantA.includes('A-ISOLATION-01'), 'Persisted chat-state for A is missing A output.', { assistantA })
  assert(!assistantA.includes('B-ISOLATION-01'), 'Persisted chat-state for A leaked B output.', { assistantA })
  assert(!assistantA.includes('C-ISOLATION-OK'), 'Persisted chat-state for A leaked C output.', { assistantA })

  assert(assistantB.includes('B-ISOLATION-01'), 'Persisted chat-state for B is missing B output.', { assistantB })
  assert(!assistantB.includes('A-ISOLATION-01'), 'Persisted chat-state for B leaked A output.', { assistantB })
  assert(!assistantB.includes('C-ISOLATION-OK'), 'Persisted chat-state for B leaked C output.', { assistantB })

  assert(assistantC.includes('C-ISOLATION-OK'), 'Persisted chat-state for C is missing C output.', { assistantC })
  assert(!assistantC.includes('A-ISOLATION-01'), 'Persisted chat-state for C leaked A output.', { assistantC })
  assert(!assistantC.includes('B-ISOLATION-01'), 'Persisted chat-state for C leaked B output.', { assistantC })

  const sessionChecks = {}
  for (const conversationId of [conversationA, conversationB, conversationC]) {
    const sessionPath = path.join(sessionDir, `${conversationId}.json`)
    assert(fs.existsSync(sessionPath), 'Missing persisted session file.', { conversationId, sessionFiles })
    const session = readJson(sessionPath)
    const raw = JSON.stringify(session.messages)
    sessionChecks[conversationId] = {
      messageCount: Array.isArray(session.messages) ? session.messages.length : 0,
      hasA: raw.includes('A-ISOLATION-01'),
      hasB: raw.includes('B-ISOLATION-01'),
      hasC: raw.includes('C-ISOLATION-OK'),
    }
  }

  assert(sessionFiles.length >= 3, 'Expected at least three persisted agent session files.', { sessionFiles })
  assert(sessionChecks[conversationA].hasA && !sessionChecks[conversationA].hasB && !sessionChecks[conversationA].hasC, 'Conversation A session file is not isolated.', sessionChecks[conversationA])
  assert(!sessionChecks[conversationB].hasA && sessionChecks[conversationB].hasB && !sessionChecks[conversationB].hasC, 'Conversation B session file is not isolated.', sessionChecks[conversationB])
  assert(!sessionChecks[conversationC].hasA && !sessionChecks[conversationC].hasB && sessionChecks[conversationC].hasC, 'Conversation C session file is not isolated.', sessionChecks[conversationC])

  report.persistedChecks = {
    sessionFiles,
    sessionChecks,
  }

  console.log(JSON.stringify({ ok: true, report }, null, 2))
}

main().catch((error) => {
  const details = error?.extra ? { ...error.extra } : {}
  console.error(JSON.stringify({
    ok: false,
    message: error instanceof Error ? error.message : String(error),
    details,
    stack: error instanceof Error ? error.stack : null,
  }, null, 2))
  process.exit(1)
})
