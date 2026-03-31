/**
 * SDK Control Protocol Types.
 * Restored from import analysis and Zod schemas in controlSchemas.ts.
 *
 * These types define the control protocol between SDK implementations and the CLI.
 */

import type { z } from 'zod/v4'
import type {
  SDKControlRequestSchema,
  SDKControlRequestInnerSchema,
  SDKControlResponseSchema,
  SDKControlCancelRequestSchema,
  SDKControlPermissionRequestSchema,
  SDKControlMcpSetServersResponseSchema,
  SDKControlReloadPluginsResponseSchema,
  SDKControlElicitationResponseSchema,
  StdoutMessageSchema,
  StdinMessageSchema,
} from './controlSchemas.js'

// ============================================================================
// Control Request Types (inferred from Zod schemas)
// ============================================================================

/**
 * The inner request payload (a union of all control request subtypes).
 */
export type SDKControlRequestInner = z.infer<ReturnType<typeof SDKControlRequestInnerSchema>>

/**
 * A control request envelope with type, request_id, and inner request.
 */
export type SDKControlRequest = z.infer<ReturnType<typeof SDKControlRequestSchema>>

/**
 * A control response envelope (success or error).
 */
export type SDKControlResponse = z.infer<ReturnType<typeof SDKControlResponseSchema>>

/**
 * A cancel request for an open control request.
 */
export type SDKControlCancelRequest = z.infer<ReturnType<typeof SDKControlCancelRequestSchema>>

/**
 * Permission request control message.
 */
export type SDKControlPermissionRequest = z.infer<ReturnType<typeof SDKControlPermissionRequestSchema>>

/**
 * Response from MCP server set replacement.
 */
export type SDKControlMcpSetServersResponse = z.infer<ReturnType<typeof SDKControlMcpSetServersResponseSchema>>

/**
 * Response from plugin reload.
 */
export type SDKControlReloadPluginsResponse = z.infer<ReturnType<typeof SDKControlReloadPluginsResponseSchema>>

/**
 * Response from an elicitation request.
 */
export type SDKControlElicitationResponse = z.infer<ReturnType<typeof SDKControlElicitationResponseSchema>>

// ============================================================================
// Aggregate Message Types
// ============================================================================

/**
 * Union of all messages that can be sent from CLI to SDK (stdout).
 */
export type StdoutMessage = z.infer<ReturnType<typeof StdoutMessageSchema>>

/**
 * Union of all messages that can be sent from SDK to CLI (stdin).
 */
export type StdinMessage = z.infer<ReturnType<typeof StdinMessageSchema>>

// ============================================================================
// Partial Assistant Message (streaming)
// ============================================================================

import type { UUID } from 'crypto'

/**
 * A partial assistant message emitted during streaming.
 * Shape inferred from SDKPartialAssistantMessageSchema in coreSchemas.ts.
 */
export type SDKPartialAssistantMessage = {
  type: 'stream_event'
  event: any
  parent_tool_use_id: string | null
  uuid: UUID
  session_id: string
}

// Additional control types needed by consumers
export type SDKControlInitializeRequest = any;
export type SDKControlInitializeResponse = any;
