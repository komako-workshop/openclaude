export declare const STREAM_EVENT_BATCH_WINDOW_MS: number

export type RendererEventBatcherStats = {
  upstreamEvents: number
  rendererEvents: number
  batchedDeltaEvents: number
}

export type RendererEventBatcher = {
  push: (event: unknown) => void
  flush: () => boolean
  stats: RendererEventBatcherStats
}

export declare function createRendererEventBatcher(options: {
  send: (event: unknown) => void
  flushMs?: number
}): RendererEventBatcher
