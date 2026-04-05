import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import electronBinary from 'electron'
import { _electron as electron } from 'playwright'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const appDir = path.resolve(__dirname, '..')
const tempHome = path.join(os.tmpdir(), 'openclaude-scroll-smoke-home')

function buildMessage(id, role, content, timestamp) {
  return {
    id,
    role,
    content,
    timestamp,
  }
}

function buildConversation(id, title, seed) {
  const baseTime = Date.now() - 1000 * 60 * 60
  const messages = []

  for (let index = 0; index < 18; index += 1) {
    const ts = baseTime + (seed * 1000) + index * 2000
    messages.push(
      buildMessage(
        `${id}-u-${index}`,
        'user',
        `Scroll smoke prompt ${seed}-${index}: summarize the notes for section ${index}.`,
        ts,
      ),
    )
    messages.push(
      buildMessage(
        `${id}-a-${index}`,
        'assistant',
        [
          `Conversation ${title}, block ${index}.`,
          'This is intentionally long content used to create a stable scrolling surface for regression checks.',
          'Each paragraph adds enough vertical height to verify that switching sessions restores the last scroll position.',
          `Seed ${seed}, item ${index}, repeated phrase: steady scroll behavior should survive view switches and streaming updates.`,
        ].join('\n\n'),
        ts + 1000,
      ),
    )
  }

  return {
    id,
    title,
    messages,
    createdAt: baseTime,
    updatedAt: baseTime + messages.length * 2000,
  }
}

function assert(condition, message, extra = {}) {
  if (!condition) {
    const error = new Error(message)
    error.extra = extra
    throw error
  }
}

async function main() {
  const seededState = {
    conversations: [
      buildConversation('scroll-a', 'Scroll Smoke A', 1),
      buildConversation('scroll-b', 'Scroll Smoke B', 2),
    ],
    activeId: 'scroll-a',
  }

  const app = await electron.launch({
    executablePath: electronBinary,
    args: ['.'],
    cwd: appDir,
    env: {
      ...process.env,
      HOME: tempHome,
      VITE_DEV_SERVER_URL: 'http://localhost:5173',
    },
  })

  const page = await app.firstWindow()
  const scrollLocator = page.locator('[role="log"] > div')
  const report = {
    switchRestore: null,
    streamingDetach: null,
    streamingReattach: null,
  }

  const getMetrics = async () => page.evaluate(() => {
    const scrollElement = document.querySelector('[role="log"] > div')
    if (!(scrollElement instanceof HTMLElement)) {
      return null
    }

    const maxScrollTop = Math.max(scrollElement.scrollHeight - scrollElement.clientHeight, 0)
    return {
      scrollTop: scrollElement.scrollTop,
      scrollHeight: scrollElement.scrollHeight,
      clientHeight: scrollElement.clientHeight,
      gap: scrollElement.scrollHeight - scrollElement.scrollTop - scrollElement.clientHeight,
      maxScrollTop,
    }
  })

  const setScrollRatio = async (ratio) => page.evaluate((nextRatio) => {
    const scrollElement = document.querySelector('[role="log"] > div')
    if (!(scrollElement instanceof HTMLElement)) {
      throw new Error('Missing scroll element')
    }

    const maxScrollTop = Math.max(scrollElement.scrollHeight - scrollElement.clientHeight, 0)
    scrollElement.scrollTop = maxScrollTop * nextRatio
  }, ratio)

  const scrollBy = async (delta) => page.evaluate((nextDelta) => {
    const scrollElement = document.querySelector('[role="log"] > div')
    if (!(scrollElement instanceof HTMLElement)) {
      throw new Error('Missing scroll element')
    }

    scrollElement.scrollTop = Math.max(0, scrollElement.scrollTop + nextDelta)
  }, delta)

  const wheelScroll = async (deltaY) => {
    const box = await scrollLocator.boundingBox()
    assert(box, 'Missing scroll box for wheel input')
    await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height / 2, 240))
    await page.mouse.wheel(0, deltaY)
  }

  const wheelToBottom = async () => {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await wheelScroll(1200)
      await page.waitForTimeout(120)
      const metrics = await getMetrics()
      if (metrics && metrics.gap <= 24) {
        return metrics
      }
    }

    await scrollToBottom()
    await page.waitForTimeout(120)
    return getMetrics()
  }

  const scrollToBottom = async () => page.evaluate(() => {
    const scrollElement = document.querySelector('[role="log"] > div')
    if (!(scrollElement instanceof HTMLElement)) {
      throw new Error('Missing scroll element')
    }

    scrollElement.scrollTop = scrollElement.scrollHeight
  })

  const waitForHydratedTitle = async (title) => {
    await page.locator('aside').getByText(title, { exact: true }).waitFor({ timeout: 10000 })
    await page.waitForTimeout(250)
  }

  try {
    await page.waitForTimeout(1200)

    await page.evaluate(async (state) => {
      const { useChatStore } = await import('/src/stores/chatStore.ts')
      useChatStore.getState().hydratePersistedState(state)
    }, seededState)

    await waitForHydratedTitle('Scroll Smoke A')
    await page.waitForSelector('textarea[placeholder="Message OpenClaude…"]', { timeout: 10000 })

    await setScrollRatio(0.35)
    await page.waitForTimeout(350)
    const aBefore = await getMetrics()
    assert(aBefore && aBefore.scrollTop > 80, 'Conversation A did not become scrollable', { aBefore })

    await page.locator('aside').getByText('Scroll Smoke B', { exact: true }).click()
    await page.waitForTimeout(350)
    await setScrollRatio(0.18)
    await page.waitForTimeout(350)
    const bBefore = await getMetrics()
    assert(bBefore && bBefore.scrollTop > 40, 'Conversation B did not become scrollable', { bBefore })

    await page.locator('aside').getByText('Scroll Smoke A', { exact: true }).click()
    await page.waitForTimeout(350)
    const aAfter = await getMetrics()
    assert(aAfter, 'Missing scroll metrics after switching back to A')

    await page.locator('aside').getByText('Scroll Smoke B', { exact: true }).click()
    await page.waitForTimeout(350)
    const bAfter = await getMetrics()
    assert(bAfter, 'Missing scroll metrics after switching back to B')

    report.switchRestore = {
      aBefore: aBefore.scrollTop,
      aAfter: aAfter.scrollTop,
      aDelta: Math.abs(aAfter.scrollTop - aBefore.scrollTop),
      bBefore: bBefore.scrollTop,
      bAfter: bAfter.scrollTop,
      bDelta: Math.abs(bAfter.scrollTop - bBefore.scrollTop),
    }

    assert(report.switchRestore.aDelta <= 24, 'Conversation A scroll position was not restored', report.switchRestore)
    assert(report.switchRestore.bDelta <= 24, 'Conversation B scroll position was not restored', report.switchRestore)

    await page.locator('aside').getByText('Scroll Smoke A', { exact: true }).click()
    await page.waitForTimeout(300)
    await scrollToBottom()
    await page.waitForTimeout(250)

    await page.evaluate(async () => {
      const { useChatStore } = await import('/src/stores/chatStore.ts')
      const store = useChatStore.getState()
      const conversationId = 'scroll-a'
      const chunks = Array.from({ length: 90 }, (_, index) =>
        `stream-${index.toString().padStart(2, '0')} keeps growing so the viewport has to decide whether it should stay detached or follow the tail.\n`,
      )

      store.addMessage({ role: 'user', content: 'Synthetic streaming smoke prompt' }, conversationId)
      store.addMessage({ role: 'assistant', content: '', isStreaming: true }, conversationId)
      store.startStreaming(conversationId)

      let cursor = 0
      const timer = window.setInterval(() => {
        if (cursor >= chunks.length) {
          window.clearInterval(timer)
          useChatStore.getState().finishStreaming(conversationId)
          window.__scrollSmokeStreamState = 'completed'
          return
        }

        useChatStore.getState().appendToLastAssistant(chunks[cursor], conversationId)
        cursor += 1
        window.__scrollSmokeStreamState = 'streaming'
      }, 45)

      window.__scrollSmokeStreamState = 'streaming'
      window.__scrollSmokeStreamTimer = timer
    })

    const startMetrics = await getMetrics()
    assert(startMetrics, 'Missing metrics before streaming begins')

    await page.waitForFunction((initialHeight) => {
      const scrollElement = document.querySelector('[role="log"] > div')
      return scrollElement instanceof HTMLElement && scrollElement.scrollHeight > initialHeight + 120
    }, startMetrics.scrollHeight, { timeout: 15000 })

    await wheelScroll(-520)
    await page.waitForTimeout(120)
    await wheelScroll(-520)
    await page.waitForTimeout(250)
    const detachedBefore = await getMetrics()
    assert(detachedBefore, 'Missing metrics after manual upward scroll')

    await page.waitForFunction((initialHeight) => {
      const scrollElement = document.querySelector('[role="log"] > div')
      return scrollElement instanceof HTMLElement && scrollElement.scrollHeight > initialHeight + 220
    }, detachedBefore.scrollHeight, { timeout: 15000 })

    const detachedAfter = await getMetrics()
    assert(detachedAfter, 'Missing metrics after detached growth')

    report.streamingDetach = {
      beforeScrollTop: detachedBefore.scrollTop,
      afterScrollTop: detachedAfter.scrollTop,
      delta: Math.abs(detachedAfter.scrollTop - detachedBefore.scrollTop),
      afterGap: detachedAfter.gap,
    }

    assert(report.streamingDetach.delta <= 50, 'Viewport was pulled downward after manual upward scroll', report.streamingDetach)
    assert(report.streamingDetach.afterGap >= 160, 'Viewport unexpectedly stayed attached to bottom after manual upward scroll', report.streamingDetach)

    const reattachBefore = await wheelToBottom()
    assert(reattachBefore, 'Missing metrics before reattach growth')
    assert(reattachBefore.gap <= 36, 'Could not return to bottom before reattach check', reattachBefore)

    await page.waitForFunction((initialHeight) => {
      const scrollElement = document.querySelector('[role="log"] > div')
      return scrollElement instanceof HTMLElement && scrollElement.scrollHeight > initialHeight + 180
    }, reattachBefore.scrollHeight, { timeout: 15000 })

    const reattachAfter = await getMetrics()
    assert(reattachAfter, 'Missing metrics after reattach growth')

    report.streamingReattach = {
      beforeGap: reattachBefore.gap,
      afterGap: reattachAfter.gap,
      afterScrollTop: reattachAfter.scrollTop,
    }

    assert(report.streamingReattach.afterGap <= 36, 'Viewport did not reattach after returning to bottom', report.streamingReattach)

    await page.evaluate(async () => {
      if (window.__scrollSmokeStreamTimer) {
        window.clearInterval(window.__scrollSmokeStreamTimer)
      }
      const { useChatStore } = await import('/src/stores/chatStore.ts')
      useChatStore.getState().finishStreaming('scroll-a')
      window.__scrollSmokeStreamState = 'stopped'
    })

    console.log(JSON.stringify({ ok: true, report }, null, 2))
  } finally {
    await app.close()
  }
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
