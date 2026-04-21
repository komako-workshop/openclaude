import assert from 'node:assert/strict'
import { createRendererEventBatcher } from '../electron/main/streamEventBatcher.js'

function textDelta(text, index = 0) {
  return {
    type: 'stream_event',
    event: {
      type: 'content_block_delta',
      index,
      delta: {
        type: 'text_delta',
        text,
      },
    },
  }
}

function thinkingDelta(thinking, index = 0) {
  return {
    type: 'stream_event',
    event: {
      type: 'content_block_delta',
      index,
      delta: {
        type: 'thinking_delta',
        thinking,
      },
    },
  }
}

function messageStart() {
  return {
    type: 'stream_event',
    event: {
      type: 'message_start',
    },
  }
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
  const sent = []
  const batcher = createRendererEventBatcher({
    flushMs: 15,
    send: (event) => sent.push(event),
  })

  batcher.push(textDelta('hel'))
  batcher.push(textDelta('lo'))
  batcher.push(textDelta(' world'))
  await sleep(25)

  assert.equal(sent.length, 1, 'contiguous text deltas should flush as one renderer event')
  assert.equal(sent[0].event.delta.text, 'hello world')

  batcher.push(thinkingDelta('plan '))
  batcher.push(thinkingDelta('carefully'))
  batcher.push(messageStart())
  await sleep(5)

  assert.equal(sent.length, 3, 'boundary event should flush pending thinking delta before dispatching itself')
  assert.equal(sent[1].event.delta.thinking, 'plan carefully')
  assert.equal(sent[2].event.type, 'message_start')

  const keyed = []
  const keyedBatcher = createRendererEventBatcher({
    flushMs: 15,
    send: (event) => keyed.push(event),
  })
  keyedBatcher.push(textDelta('a', 0))
  keyedBatcher.push(textDelta('b', 1))
  await sleep(25)

  assert.equal(keyed.length, 2, 'deltas from different content blocks must not be merged')
  assert.equal(keyed[0].event.delta.text, 'a')
  assert.equal(keyed[1].event.delta.text, 'b')

  console.log(JSON.stringify({
    ok: true,
    sentCount: sent.length,
    keyedCount: keyed.length,
  }, null, 2))
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : null,
  }, null, 2))
  process.exit(1)
})
