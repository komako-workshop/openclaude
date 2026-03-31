/**
 * Message types used throughout the codebase.
 * Restored from import analysis and usage patterns.
 */

import type {
  BetaContentBlock,
  BetaMessage,
} from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import type {
  ContentBlockParam,
} from '@anthropic-ai/sdk/resources/index.mjs'
import type { APIError } from '@anthropic-ai/sdk'
import type { UUID } from 'crypto'
// SDKAssistantMessageError comes from generated SDK types which may not be available.
// Using inline type to avoid dependency on generated files.
type SDKAssistantMessageError = {
  type: string
  message: string
  [key: string]: unknown
}
import type { PermissionMode } from './permissions.js'
import type { AgentId } from './ids.js'
// Note: Attachment type is not imported directly to avoid circular dependency
// (utils/attachments.ts imports from types/message.ts).
// AttachmentMessage.attachment is typed as `any` below.
import type { ToolProgressData } from './tools.js'
// HookProgress is defined inline to avoid circular dependency
// (types/hooks.ts imports Message from types/message.ts)
type HookProgress = {
  type: 'hook_progress'
  hookEvent: string
  hookName: string
  command: string
  promptText?: string
  statusMessage?: string
}

// ============================================================================
// Message Origin
// ============================================================================

export type MessageOrigin =
  | { kind: 'human' }
  | { kind: 'task-notification' }
  | { kind: 'coordinator' }
  | { kind: 'channel'; server: string }

// ============================================================================
// System Message Level
// ============================================================================

export type SystemMessageLevel = 'info' | 'warning' | 'error'

// ============================================================================
// Partial Compact Direction
// ============================================================================

export type PartialCompactDirection = 'older' | 'newer'

// ============================================================================
// Compact Metadata
// ============================================================================

export type CompactMetadata = {
  trigger: 'manual' | 'auto'
  preTokens: number
  userContext?: string
  messagesSummarized?: number
}

// ============================================================================
// Stop Hook Info
// ============================================================================

export type StopHookInfo = {
  hookName: string
  output?: string
  error?: string
  durationMs?: number
  [key: string]: unknown
}

// ============================================================================
// User Message
// ============================================================================

export type UserMessage = {
  type: 'user'
  message: {
    role: 'user'
    content: string | ContentBlockParam[]
  }
  uuid: UUID
  timestamp: string
  isMeta?: true
  isVisibleInTranscriptOnly?: true
  isVirtual?: true
  isCompactSummary?: true
  toolUseResult?: unknown
  mcpMeta?: {
    _meta?: Record<string, unknown>
    structuredContent?: Record<string, unknown>
  }
  imagePasteIds?: number[]
  sourceToolAssistantUUID?: UUID
  sourceToolUseID?: string
  permissionMode?: PermissionMode
  summarizeMetadata?: {
    messagesSummarized: number
    userContext?: string
    direction?: PartialCompactDirection
  }
  origin?: MessageOrigin
}

// ============================================================================
// Assistant Message
// ============================================================================

export type AssistantMessage = {
  type: 'assistant'
  message: BetaMessage & {
    context_management?: any
  }
  uuid: UUID
  timestamp: string
  requestId?: string
  isMeta?: true
  isVirtual?: true
  isApiErrorMessage?: boolean
  apiError?: APIError
  error?: SDKAssistantMessageError
  errorDetails?: string
  advisorModel?: string
}

// ============================================================================
// Progress Message
// ============================================================================

export type ProgressMessage<P = ToolProgressData | HookProgress> = {
  type: 'progress'
  data: P
  toolUseID: string
  parentToolUseID: string
  uuid: UUID
  timestamp: string
}

// ============================================================================
// Attachment Message
// ============================================================================

export type AttachmentMessage = {
  type: 'attachment'
  attachment: any // Actual type is Attachment from utils/attachments.ts (avoided to prevent circular import)
  uuid: UUID
  timestamp: string
  sourceToolUseID?: string
}

// ============================================================================
// System Message Subtypes
// ============================================================================

type SystemMessageBase = {
  type: 'system'
  uuid: UUID
  timestamp: string
  isMeta?: boolean
}

export type SystemInformationalMessage = SystemMessageBase & {
  subtype: 'informational'
  content: string
  level: SystemMessageLevel
  toolUseID?: string
  preventContinuation?: boolean
}

export type SystemLocalCommandMessage = SystemMessageBase & {
  subtype: 'local_command'
  content: string
  level: SystemMessageLevel
}

export type SystemAPIErrorMessage = SystemMessageBase & {
  subtype: 'api_error'
  level: 'error'
  cause?: Error
  error: APIError
  retryInMs: number
  retryAttempt: number
  maxRetries: number
}

export type SystemCompactBoundaryMessage = SystemMessageBase & {
  subtype: 'compact_boundary'
  content: string
  level: SystemMessageLevel
  compactMetadata: CompactMetadata
  logicalParentUuid?: UUID
}

export type SystemMicrocompactBoundaryMessage = SystemMessageBase & {
  subtype: 'microcompact_boundary'
  content: string
  level: SystemMessageLevel
  microcompactMetadata: {
    trigger: 'auto'
    preTokens: number
    tokensSaved: number
    compactedToolIds: string[]
    clearedAttachmentUUIDs: string[]
  }
}

export type SystemStopHookSummaryMessage = SystemMessageBase & {
  subtype: 'stop_hook_summary'
  hookCount: number
  hookInfos: StopHookInfo[]
  hookErrors: string[]
  preventedContinuation: boolean
  stopReason: string | undefined
  hasOutput: boolean
  level: SystemMessageLevel
  toolUseID?: string
  hookLabel?: string
  totalDurationMs?: number
}

export type SystemBridgeStatusMessage = SystemMessageBase & {
  subtype: 'bridge_status'
  content: string
  url: string
  upgradeNudge?: string
}

export type SystemTurnDurationMessage = SystemMessageBase & {
  subtype: 'turn_duration'
  durationMs: number
  budgetTokens?: number
  budgetLimit?: number
  budgetNudges?: number
  messageCount?: number
}

export type SystemAwaySummaryMessage = SystemMessageBase & {
  subtype: 'away_summary'
  content: string
}

export type SystemMemorySavedMessage = SystemMessageBase & {
  subtype: 'memory_saved'
  writtenPaths: string[]
}

export type SystemAgentsKilledMessage = SystemMessageBase & {
  subtype: 'agents_killed'
}

export type SystemApiMetricsMessage = SystemMessageBase & {
  subtype: 'api_metrics'
  ttftMs: number
  otps: number
  isP50?: boolean
  hookDurationMs?: number
  turnDurationMs?: number
  toolDurationMs?: number
  classifierDurationMs?: number
  toolCount?: number
  hookCount?: number
  classifierCount?: number
  configWriteCount?: number
}

export type SystemPermissionRetryMessage = SystemMessageBase & {
  subtype: 'permission_retry'
  content: string
  commands: string[]
  level: SystemMessageLevel
}

export type SystemScheduledTaskFireMessage = SystemMessageBase & {
  subtype: 'scheduled_task_fire'
  content: string
}

export type SystemThinkingMessage = SystemMessageBase & {
  subtype: 'thinking'
  content: string
  level: SystemMessageLevel
}

export type SystemFileSnapshotMessage = SystemMessageBase & {
  subtype: 'file_snapshot'
  content: string
  level: SystemMessageLevel
  snapshotFiles: Array<{
    key: string
    path: string
    content: string
  }>
}

/**
 * Union of all system message subtypes.
 */
export type SystemMessage =
  | SystemInformationalMessage
  | SystemLocalCommandMessage
  | SystemAPIErrorMessage
  | SystemCompactBoundaryMessage
  | SystemMicrocompactBoundaryMessage
  | SystemStopHookSummaryMessage
  | SystemBridgeStatusMessage
  | SystemTurnDurationMessage
  | SystemAwaySummaryMessage
  | SystemMemorySavedMessage
  | SystemAgentsKilledMessage
  | SystemApiMetricsMessage
  | SystemPermissionRetryMessage
  | SystemScheduledTaskFireMessage
  | SystemThinkingMessage
  | SystemFileSnapshotMessage

// ============================================================================
// Tombstone Message
// ============================================================================

export type TombstoneMessage = {
  type: 'tombstone'
  message: Message
}

// ============================================================================
// Tool Use Summary Message (SDK-only)
// ============================================================================

export type ToolUseSummaryMessage = {
  type: 'tool_use_summary'
  summary: string
  precedingToolUseIds: string[]
  uuid: UUID
  timestamp: string
}

// ============================================================================
// Stream Event types
// ============================================================================

export type StreamEvent = {
  type: 'stream_event'
  event: any
  ttftMs?: number
}

export type RequestStartEvent = {
  type: 'stream_request_start'
}

// ============================================================================
// Main Message union
// ============================================================================

/**
 * Union of all message types used in the conversation.
 */
export type Message =
  | UserMessage
  | AssistantMessage
  | ProgressMessage
  | AttachmentMessage
  | SystemMessage

// ============================================================================
// Hook Result Message
// ============================================================================

/**
 * Messages that can be produced by hooks.
 */
export type HookResultMessage = UserMessage | AttachmentMessage | SystemMessage

// ============================================================================
// Normalized Messages (single content block per message)
// ============================================================================

export type NormalizedUserMessage = Omit<UserMessage, 'message'> & {
  message: {
    role: 'user'
    content: ContentBlockParam[]
  }
}

export type NormalizedAssistantMessage = Omit<AssistantMessage, 'message'> & {
  message: AssistantMessage['message'] & {
    content: [BetaContentBlock]
    context_management: any
  }
}

export type NormalizedMessage =
  | NormalizedUserMessage
  | NormalizedAssistantMessage
  | ProgressMessage
  | AttachmentMessage
  | SystemMessage

// ============================================================================
// Grouped Tool Use Message (for UI rendering)
// ============================================================================

export type GroupedToolUseMessage = {
  type: 'grouped_tool_use'
  toolName: string
  messages: NormalizedAssistantMessage[]
  results: NormalizedUserMessage[]
  uuid: UUID
  timestamp: string
}

// ============================================================================
// Collapsed Read/Search Group (for UI rendering)
// ============================================================================

export type CollapsedReadSearchGroup = {
  type: 'collapsed_read_search'
  messages: RenderableMessage[]
  uuid: UUID
  timestamp: string
  searchCount: number
  readCount: number
  listCount: number
  replCount: number
  memoryWriteCount: number
  editCount?: number
  writeCount?: number
  commitKind?: any
  branchAction?: any
  prAction?: any
  gitOpsCount?: number
  [key: string]: unknown
}

// ============================================================================
// Collapsible Message (messages that can be collapsed in UI)
// ============================================================================

export type CollapsibleMessage =
  | NormalizedAssistantMessage
  | NormalizedUserMessage
  | GroupedToolUseMessage

// ============================================================================
// Renderable Message (all messages the UI can render)
// ============================================================================

export type RenderableMessage =
  | NormalizedUserMessage
  | NormalizedAssistantMessage
  | ProgressMessage
  | AttachmentMessage
  | SystemMessage
  | GroupedToolUseMessage
  | CollapsedReadSearchGroup
