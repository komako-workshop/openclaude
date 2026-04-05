import { create } from 'zustand'

export interface ToolCallInfo {
  id: string
  toolName: string
  status: 'running' | 'completed' | 'error'
  args?: Record<string, unknown>
  result?: string
  startedAt: number
  completedAt?: number
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  isStreaming?: boolean
  isError?: boolean
  thinkingContent?: string
  toolCalls?: ToolCallInfo[]
}

export interface Conversation {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
  pinned?: boolean
}

export interface PersistedChatState {
  conversations: Conversation[]
  activeId: string | null
}

let _seq = 0
const uid = () => `m-${Date.now()}-${_seq++}`
const convId = () => `c-${Date.now()}-${_seq++}`
export const LEGACY_CHAT_STORAGE_KEY = 'openclaude-chat-v1'

function makeConv(title = 'New chat'): Conversation {
  return { id: convId(), title, messages: [], createdAt: Date.now(), updatedAt: Date.now() }
}

function autoTitle(msgs: ChatMessage[]): string {
  const first = msgs.find((m) => m.role === 'user')
  if (!first) return 'New chat'
  return first.content.length > 40 ? first.content.slice(0, 40) + '…' : first.content
}

function rehydrateMessage(message: ChatMessage): ChatMessage {
  return {
    ...message,
    isStreaming: false,
    toolCalls: message.toolCalls?.map((toolCall) =>
      toolCall.status === 'running'
        ? {
            ...toolCall,
            status: 'completed',
            completedAt: toolCall.completedAt ?? toolCall.startedAt,
          }
        : toolCall,
    ),
  }
}

function rehydrateConversations(conversations?: Conversation[]): Conversation[] {
  if (!conversations?.length) return [makeConv()]

  return conversations.map((conversation) => {
    const messages = conversation.messages.map(rehydrateMessage)
    const createdAt = conversation.createdAt ?? Date.now()

    return {
      ...conversation,
      title: conversation.title || autoTitle(messages),
      messages,
      createdAt,
      updatedAt: conversation.updatedAt ?? createdAt,
    }
  })
}

function normalizePersistedState(persisted?: PersistedChatState | null): PersistedChatState {
  const conversations = rehydrateConversations(persisted?.conversations)
  const activeId = conversations.some((conversation) => conversation.id === persisted?.activeId)
    ? persisted?.activeId ?? conversations[0].id
    : conversations[0].id

  return {
    conversations,
    activeId,
  }
}

interface ChatState extends PersistedChatState {
  isStreaming: boolean
  streamingConversationId: string | null

  active: () => Conversation | undefined
  hydratePersistedState: (persisted?: PersistedChatState | null) => void
  newConversation: () => void
  switchTo: (id: string) => void
  deleteConversation: (id: string) => void
  togglePin: (id: string) => void

  addMessage: (msg: Omit<ChatMessage, 'id' | 'timestamp'>, conversationId?: string) => void
  appendToLastAssistant: (textDelta: string, conversationId?: string) => void
  appendThinking: (thinkingDelta: string, conversationId?: string) => void
  addToolCall: (tc: ToolCallInfo, conversationId?: string) => void
  updateToolCall: (toolCallId: string, updates: Partial<ToolCallInfo>, conversationId?: string) => void
  finishLastAssistant: (conversationId?: string) => void
  startStreaming: (conversationId?: string) => void
  finishStreaming: (conversationId?: string) => void
}

export const useChatStore = create<ChatState>((set, get) => {
  const initial = normalizePersistedState()

  function withConversation(fn: (conv: Conversation) => Conversation, conversationId?: string) {
    const { conversations, activeId } = get()
    const targetId = conversationId ?? activeId
    set({
      conversations: conversations.map((c) => {
        if (c.id !== targetId) return c
        const updated = fn(c)
        return { ...updated, updatedAt: Date.now(), title: autoTitle(updated.messages) }
      }),
    })
  }

  function lastAssistantIndex(msgs: ChatMessage[]): number {
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'assistant') return i
    }
    return -1
  }

  return {
    conversations: initial.conversations,
    activeId: initial.activeId,
    isStreaming: false,
    streamingConversationId: null,

    active: () => {
      const { conversations, activeId } = get()
      return conversations.find((c) => c.id === activeId)
    },

    hydratePersistedState: (persisted) => {
      const next = normalizePersistedState(persisted)
      set({
        conversations: next.conversations,
        activeId: next.activeId,
        isStreaming: false,
        streamingConversationId: null,
      })
    },

    newConversation: () => {
      const conv = makeConv()
      set((s) => ({
        conversations: [conv, ...s.conversations],
        activeId: conv.id,
        isStreaming: s.isStreaming,
        streamingConversationId: s.streamingConversationId,
      }))
    },

    switchTo: (id) => set({ activeId: id }),

    deleteConversation: (id) => {
      const { conversations, activeId, streamingConversationId } = get()
      const next = conversations.filter((c) => c.id !== id)
      if (next.length === 0) {
        const fresh = makeConv()
        set({
          conversations: [fresh],
          activeId: fresh.id,
          isStreaming: streamingConversationId === id ? false : get().isStreaming,
          streamingConversationId: streamingConversationId === id ? null : streamingConversationId,
        })
        return
      }
      set({
        conversations: next,
        activeId: activeId === id ? next[0].id : activeId,
        isStreaming: streamingConversationId === id ? false : get().isStreaming,
        streamingConversationId: streamingConversationId === id ? null : streamingConversationId,
      })
    },

    togglePin: (id) => {
      set({
        conversations: get().conversations.map((c) =>
          c.id === id ? { ...c, pinned: !c.pinned } : c,
        ),
      })
    },

    addMessage: (msg, conversationId) => {
      const full: ChatMessage = { ...msg, id: uid(), timestamp: Date.now() }
      withConversation((c) => ({ ...c, messages: [...c.messages, full] }), conversationId)
    },

    appendToLastAssistant: (text, conversationId) => {
      withConversation((c) => {
        const idx = lastAssistantIndex(c.messages)
        if (idx === -1) return c
        const msgs = [...c.messages]
        msgs[idx] = { ...msgs[idx], content: msgs[idx].content + text }
        return { ...c, messages: msgs }
      }, conversationId)
    },

    appendThinking: (text, conversationId) => {
      withConversation((c) => {
        const idx = lastAssistantIndex(c.messages)
        if (idx === -1) return c
        const msgs = [...c.messages]
        msgs[idx] = {
          ...msgs[idx],
          thinkingContent: (msgs[idx].thinkingContent ?? '') + text,
        }
        return { ...c, messages: msgs }
      }, conversationId)
    },

    addToolCall: (tc, conversationId) => {
      withConversation((c) => {
        const idx = lastAssistantIndex(c.messages)
        if (idx === -1) return c
        const msgs = [...c.messages]
        msgs[idx] = {
          ...msgs[idx],
          toolCalls: [...(msgs[idx].toolCalls ?? []), tc],
        }
        return { ...c, messages: msgs }
      }, conversationId)
    },

    updateToolCall: (toolCallId, updates, conversationId) => {
      withConversation((c) => {
        const idx = lastAssistantIndex(c.messages)
        if (idx === -1) return c
        const msgs = [...c.messages]
        msgs[idx] = {
          ...msgs[idx],
          toolCalls: (msgs[idx].toolCalls ?? []).map((tc) =>
            tc.id === toolCallId ? { ...tc, ...updates } : tc,
          ),
        }
        return { ...c, messages: msgs }
      }, conversationId)
    },

    finishLastAssistant: (conversationId) => {
      withConversation((c) => {
        const idx = lastAssistantIndex(c.messages)
        if (idx === -1) return c
        const msgs = [...c.messages]
        const msg = msgs[idx]
        msgs[idx] = {
          ...msg,
          isStreaming: false,
          toolCalls: msg.toolCalls?.map((tc) =>
            tc.status === 'running'
              ? { ...tc, status: 'completed' as const, completedAt: Date.now() }
              : tc,
          ),
        }
        return { ...c, messages: msgs }
      }, conversationId)
    },

    startStreaming: (conversationId) => set({
      isStreaming: true,
      streamingConversationId: conversationId ?? get().activeId,
    }),
    finishStreaming: (conversationId) => {
      const targetId = conversationId ?? get().streamingConversationId ?? get().activeId
      get().finishLastAssistant(targetId ?? undefined)
      set({ isStreaming: false, streamingConversationId: null })
    },
  }
})
