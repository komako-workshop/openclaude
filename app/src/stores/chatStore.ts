import { create } from 'zustand'

export type ToolCall = {
  id: string
  name: string
  input: Record<string, unknown>
  result?: string
}

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant' | 'tool' | 'error'
  content: string
  tools?: ToolCall[]
  thinking?: string
  timestamp: number
}

type ChatState = {
  messages: ChatMessage[]
  isStreaming: boolean
  currentText: string
  currentTools: ToolCall[]
  currentThinking: string

  addUserMessage: (text: string) => void
  startStreaming: () => void
  appendText: (text: string) => void
  addToolCall: (tool: ToolCall) => void
  setThinking: (text: string) => void
  finishStreaming: () => void
  addError: (text: string) => void
  clearMessages: () => void
}

let nextId = 0
const makeId = () => `msg-${Date.now()}-${nextId++}`

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isStreaming: false,
  currentText: '',
  currentTools: [],
  currentThinking: '',

  addUserMessage: (text) =>
    set((s) => ({
      messages: [...s.messages, { id: makeId(), role: 'user', content: text, timestamp: Date.now() }],
    })),

  startStreaming: () =>
    set({ isStreaming: true, currentText: '', currentTools: [], currentThinking: '' }),

  appendText: (text) =>
    set({ currentText: text }),

  addToolCall: (tool) =>
    set((s) => {
      const existing = s.currentTools.find((t) => t.id === tool.id)
      if (existing) return s
      return { currentTools: [...s.currentTools, tool] }
    }),

  setThinking: (text) =>
    set({ currentThinking: text }),

  finishStreaming: () => {
    const { currentText, currentTools, currentThinking, messages } = get()
    if (!currentText && currentTools.length === 0) {
      set({ isStreaming: false, currentText: '', currentTools: [], currentThinking: '' })
      return
    }
    set({
      messages: [
        ...messages,
        {
          id: makeId(),
          role: 'assistant',
          content: currentText,
          tools: currentTools.length > 0 ? currentTools : undefined,
          thinking: currentThinking || undefined,
          timestamp: Date.now(),
        },
      ],
      isStreaming: false,
      currentText: '',
      currentTools: [],
      currentThinking: '',
    })
  },

  addError: (text) =>
    set((s) => ({
      messages: [...s.messages, { id: makeId(), role: 'error', content: text, timestamp: Date.now() }],
      isStreaming: false,
    })),

  clearMessages: () =>
    set({ messages: [], currentText: '', currentTools: [], currentThinking: '' }),
}))
