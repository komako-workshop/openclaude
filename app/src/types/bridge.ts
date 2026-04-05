import type { PersistedChatState } from '../stores/chatStore'

export type Settings = {
  apiKey: string
  baseURL: string
  model: string
  cwd: string
  permissionMode: 'bypassPermissions' | 'acceptEdits' | 'default'
}

export type AgentEvent = {
  type: 'assistant' | 'user' | 'result' | 'tool_use' | string
  subtype?: string
  message?: {
    content: Array<
      | { type: 'text'; text: string }
      | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
      | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }
      | { type: 'thinking'; thinking: string }
    >
  }
  toolUseResult?: {
    stdout?: string
    stderr?: string
    interrupted?: boolean
    isImage?: boolean
    noOutputExpected?: boolean
  }
  usage?: { input_tokens: number; output_tokens: number }
  num_turns?: number
}

export interface OpenClaudeBridge {
  invoke(channel: 'settings:load'): Promise<Settings>
  invoke(channel: 'settings:save', settings: Settings): Promise<boolean>
  invoke(channel: 'chat:load'): Promise<PersistedChatState | null>
  invoke(channel: 'chat:save', state: PersistedChatState): Promise<boolean>
  invoke(channel: 'chat:deleteConversationSession', conversationId: string): Promise<boolean>
  invoke(channel: 'dialog:selectDirectory'): Promise<string | null>
  invoke(channel: 'agent:query', prompt: string, conversationId?: string): Promise<void>
  invoke(channel: 'agent:abort'): Promise<void>
  invoke(channel: 'agent:reset'): Promise<boolean>
  invoke(channel: 'shell:openExternal', url: string): Promise<void>
  invoke(channel: string, ...args: unknown[]): Promise<unknown>

  on(channel: 'agent:event', cb: (event: AgentEvent) => void): () => void
  on(channel: 'agent:done', cb: () => void): () => void
  on(channel: 'agent:error', cb: (error: string) => void): () => void
  on(channel: string, cb: (...args: unknown[]) => void): () => void

  platform: string
}

declare global {
  interface Window {
    openclaude: OpenClaudeBridge
  }
}
