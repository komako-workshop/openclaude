export const STREAM_EVENT_BATCH_WINDOW_MS = 50

function isBatchableTextOrThinkingDelta(event) {
  return (
    event?.type === 'stream_event'
    && event?.event?.type === 'content_block_delta'
    && (
      event?.event?.delta?.type === 'text_delta'
      || event?.event?.delta?.type === 'thinking_delta'
    )
  )
}

function cloneBatchableEvent(event) {
  return {
    ...event,
    event: {
      ...event.event,
      delta: {
        ...event.event.delta,
      },
    },
  }
}

function getBatchKey(event) {
  return `${event?.event?.index ?? -1}:${event?.event?.delta?.type ?? ''}`
}

function appendBatchableDelta(target, event) {
  const nextDelta = event?.event?.delta
  if (!nextDelta) return
  if (nextDelta.type === 'text_delta') {
    target.event.delta.text = `${target.event.delta.text ?? ''}${nextDelta.text ?? ''}`
    return
  }
  if (nextDelta.type === 'thinking_delta') {
    target.event.delta.thinking = `${target.event.delta.thinking ?? ''}${nextDelta.thinking ?? ''}`
  }
}

export function createRendererEventBatcher({
  send,
  flushMs = STREAM_EVENT_BATCH_WINDOW_MS,
}) {
  let pendingEvent = null
  let timer = null

  const stats = {
    upstreamEvents: 0,
    rendererEvents: 0,
    batchedDeltaEvents: 0,
  }

  const clearTimer = () => {
    if (timer == null) return
    clearTimeout(timer)
    timer = null
  }

  const dispatch = (event) => {
    send(event)
    stats.rendererEvents += 1
  }

  const flush = () => {
    if (!pendingEvent) return false
    clearTimer()
    dispatch(pendingEvent)
    pendingEvent = null
    return true
  }

  const scheduleFlush = () => {
    if (timer != null) return
    timer = setTimeout(() => {
      timer = null
      flush()
    }, flushMs)
    if (typeof timer?.unref === 'function') {
      timer.unref()
    }
  }

  const push = (event) => {
    stats.upstreamEvents += 1

    if (!isBatchableTextOrThinkingDelta(event)) {
      flush()
      dispatch(event)
      return
    }

    if (pendingEvent && getBatchKey(pendingEvent) === getBatchKey(event)) {
      appendBatchableDelta(pendingEvent, event)
      stats.batchedDeltaEvents += 1
      scheduleFlush()
      return
    }

    flush()
    pendingEvent = cloneBatchableEvent(event)
    scheduleFlush()
  }

  return {
    push,
    flush,
    stats,
  }
}
