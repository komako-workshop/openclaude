// @ts-nocheck
/**
 * Open Agent SDK - Main entry point
 *
 * This module provides the public API for the SDK, wrapping the full
 * Claude Code engine (QueryEngine, tools, services) in a clean interface
 * that runs entirely in-process without spawning subprocesses.
 *
 * Drop-in replacement for @anthropic-ai/claude-agent-sdk.
 */

// Initialize global variables (MACRO, Bun, Gates) before anything else
import './setup-globals.js'

// Re-export all public types from the official SDK type surface
export * from './entrypoints/agentSdkTypes.js'

// Re-export core engine components for advanced usage
export { QueryEngine } from './QueryEngine.js'

// Re-export tools
export {
  getAllBaseTools,
  getTools,
  assembleToolPool,
  filterToolsByDenyRules,
} from './tools.js'

// Re-export tool implementations
export { BashTool } from './tools/BashTool/BashTool.js'
export { FileReadTool } from './tools/FileReadTool/FileReadTool.js'
export { FileWriteTool } from './tools/FileWriteTool/FileWriteTool.js'
export { FileEditTool } from './tools/FileEditTool/FileEditTool.js'
export { GlobTool } from './tools/GlobTool/GlobTool.js'
export { GrepTool } from './tools/GrepTool/GrepTool.js'
export { WebFetchTool } from './tools/WebFetchTool/WebFetchTool.js'
export { WebSearchTool } from './tools/WebSearchTool/WebSearchTool.js'
export { AgentTool } from './tools/AgentTool/AgentTool.js'

// Re-export API client
export { getAnthropicClient } from './services/api/client.js'

// Re-export MCP utilities
export { connectToServer as connectMCPServer } from './services/mcp/client.js'

// Re-export context utilities
export { getSystemContext, getUserContext } from './context.js'

// Re-export message utilities
export {
  createUserMessage,
  createAssistantMessage,
  normalizeMessages,
} from './utils/messages.js'

// Re-export session/history utilities
export { getHistory, addToHistory } from './history.js'

// ============================================================================
// High-level Agent API
// ============================================================================

export { Agent, createAgent, query } from './agent.js'
export type { AgentOptions, QueryResult } from './agent.js'
