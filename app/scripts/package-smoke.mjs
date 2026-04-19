import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import { join, resolve } from 'node:path'

import { _electron as electron } from 'playwright'

async function main() {
  const bundlePath = resolve(
    process.argv[2] ?? join(process.cwd(), 'build', 'release', 'OpenClaude.app'),
  )
  const executablePath = join(bundlePath, 'Contents', 'MacOS', 'Electron')

  assert.ok(existsSync(bundlePath), `找不到 app bundle：${bundlePath}`)
  assert.ok(existsSync(executablePath), `找不到 app 可执行文件：${executablePath}`)

  const isolatedRoot = mkdtempSync(join(os.tmpdir(), 'openclaude-package-smoke-'))
  let app

  try {
    app = await electron.launch({
      executablePath,
      env: {
        ...process.env,
        OPENCLAUDE_APPDATA_DIR: isolatedRoot,
      },
    })

    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await page.getByText('OpenClaude').waitFor({ timeout: 30000 })
    await page.getByPlaceholder(/Message OpenClaude/).waitFor({ timeout: 30000 })

    const logo = await page.evaluate(() => {
      const image = document.querySelector('img')
      if (!image) return null

      return {
        src: image.getAttribute('src'),
        resolvedSrc: image.src,
        naturalWidth: image.naturalWidth,
        complete: image.complete,
      }
    })

    assert.ok(logo, '启动页未找到 logo')
    assert.ok(logo.complete, '启动页 logo 尚未加载完成')
    assert.ok(logo.naturalWidth > 0, `启动页 logo 加载失败：${JSON.stringify(logo)}`)

    console.log('[smoke:package] PASS')
    console.log(JSON.stringify({
      bundlePath,
      logo,
    }, null, 2))
  } finally {
    try {
      await app?.close()
    } catch {}

    rmSync(isolatedRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error('[smoke:package] FAIL')
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exit(1)
})
