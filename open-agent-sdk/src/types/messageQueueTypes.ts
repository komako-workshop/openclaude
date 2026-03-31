/**
 * Message queue types used by messageQueueManager and sessionStorage.
 * Restored from import analysis.
 */

/**
 * Queue operation names for logging.
 */
export type QueueOperation = 'enqueue' | 'dequeue' | 'remove' | 'popAll'

/**
 * Logged queue operation message (persisted in session storage).
 */
export type QueueOperationMessage = {
  type: 'queue-operation'
  operation: QueueOperation
  timestamp: string
  sessionId: string
  content?: string
}
