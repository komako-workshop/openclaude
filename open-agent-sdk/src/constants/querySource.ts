/**
 * QuerySource type for categorizing API query origins.
 * Restored from import analysis and usage patterns.
 *
 * Used for analytics, retry logic, caching decisions, and prompt category tracking.
 */

export type QuerySource =
  | 'repl_main_thread'
  | `repl_main_thread:outputStyle:${string}`
  | 'sdk'
  | 'agent:custom'
  | 'agent:default'
  | 'agent:builtin'
  | `agent:builtin:${string}`
  | 'compact'
  | 'hook_agent'
  | 'hook_prompt'
  | 'verification_agent'
  | 'side_question'
  | 'auto_mode'
  | 'bash_classifier'
  | 'memory_extraction'
  | 'tool_use_summary'
  | 'session_title'
  | 'dream'
  | 'prompt_suggestion'
  | 'speculation'
  | (string & {})
