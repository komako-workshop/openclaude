/**
 * Centralized tool progress types.
 * Restored from import analysis across the codebase.
 * These types break import cycles by being in a standalone module.
 */

// Note: NormalizedUserMessage is not imported directly to avoid circular dependency
// (types/message.ts imports ToolProgressData from types/tools.ts).
// AgentToolProgress.message and SkillToolProgress.message are typed as `any`.
import type { AgentId } from './ids.js'

/**
 * Progress data emitted by BashTool during command execution.
 */
export type BashProgress = {
  type: 'bash_progress'
  output: string
  fullOutput: string
  elapsedTimeSeconds?: number
  totalLines?: number
  totalBytes?: number
  taskId?: string
  timeoutMs?: number
}

/**
 * Progress data emitted by PowerShellTool during command execution.
 */
export type PowerShellProgress = {
  type: 'powershell_progress'
  output: string
  fullOutput: string
  elapsedTimeSeconds?: number
  totalLines?: number
  totalBytes?: number
  timeoutMs?: number
  taskId?: string
}

/**
 * Union of shell progress types (Bash + PowerShell).
 */
export type ShellProgress = BashProgress | PowerShellProgress

/**
 * Progress data emitted by AgentTool when a sub-agent starts.
 */
export type AgentToolProgress = {
  type: 'agent_progress'
  message: any // NormalizedUserMessage (circular dep avoidance)
  prompt: string
  agentId?: AgentId
}

/**
 * Progress data emitted by MCPTool during tool execution.
 */
export type MCPProgress = {
  type: 'mcp_progress'
  status: 'started' | 'completed' | 'failed'
  serverName: string
  toolName: string
  elapsedTimeMs?: number
}

/**
 * Progress data emitted by WebSearchTool.
 */
export type WebSearchProgress = {
  type: 'web_search_progress'
  [key: string]: unknown
}

/**
 * Progress data emitted by SkillTool during skill execution.
 */
export type SkillToolProgress = {
  type: 'skill_progress'
  message: any
  prompt: string
  agentId?: AgentId
}

/**
 * Progress data emitted by TaskOutputTool.
 */
export type TaskOutputProgress = {
  type: 'task_output_progress'
  [key: string]: unknown
}

/**
 * Progress data emitted by REPLTool.
 */
export type REPLToolProgress = {
  type: 'repl_tool_progress'
  [key: string]: unknown
}

/**
 * Progress data for SDK workflow events.
 */
export type SdkWorkflowProgress = {
  step_name?: string
  status?: string
  progress?: number
  message?: string
  [key: string]: unknown
}

/**
 * Union of all tool progress data types.
 */
export type ToolProgressData =
  | BashProgress
  | PowerShellProgress
  | AgentToolProgress
  | MCPProgress
  | WebSearchProgress
  | SkillToolProgress
  | TaskOutputProgress
  | REPLToolProgress
