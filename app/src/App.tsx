import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { LEGACY_CHAT_STORAGE_KEY, useChatStore } from './stores/chatStore'
import { useSettingsStore } from './stores/settingsStore'
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
  type ConversationScrollContext,
} from './components/Conversation'
import { Sidebar } from './components/Sidebar'
import MessageBubble from './components/MessageBubble'
import { ChatInput } from './components/ChatInput'
import { SettingsPanel } from './components/SettingsPanel'
import { resolveAppAssetUrl } from './utils/assetUrl'
import type {
  AgentDonePayload,
  AgentErrorPayload,
  AgentEvent,
  AgentEventPayload,
  ImageAttachment,
} from './types/bridge'
import type { PersistedChatState } from './stores/chatStore'

const STARTUP_LOGO_SRC = resolveAppAssetUrl('icon.png')

type ScrollSnapshot = {
  scrollTop: number
  atBottom: boolean
}

type ConversationStreamState = {
  streamedText: boolean
  streamedThinking: boolean
  streamedToolCallIds: Set<string>
}

function createConversationStreamState(): ConversationStreamState {
  return {
    streamedText: false,
    streamedThinking: false,
    streamedToolCallIds: new Set<string>(),
  }
}

function loadLegacyChatState(): PersistedChatState | null {
  try {
    const raw = window.localStorage.getItem(LEGACY_CHAT_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { state?: PersistedChatState }
    if (!parsed.state?.conversations?.length) return null
    return {
      conversations: parsed.state.conversations,
      activeId: parsed.state.activeId ?? parsed.state.conversations[0].id,
    }
  } catch { return null }
}

export default function App() {
  const {
    active, conversations, activeId, hydratePersistedState, streamingConversationIds,
    addMessage, appendToLastAssistant, appendThinking,
    addToolCall, updateToolCall, stopLastAssistantStreaming, startStreaming, finishStreaming,
  } = useChatStore()

  const { loaded, showPanel, load: loadSettings, togglePanel, settings } = useSettingsStore()
  const conversationContextRef = useRef<ConversationScrollContext | null>(null)
  const scrollSnapshotsRef = useRef(new Map<string, ScrollSnapshot>())
  const activeConversationRef = useRef<string | null>(null)
  const messageCountRef = useRef(0)
  const [chatLoaded, setChatLoaded] = useState(false)

  useEffect(() => { loadSettings() }, [loadSettings])

  useEffect(() => {
    let cancelled = false
    async function loadChat() {
      try {
        const persisted = await window.openclaude.invoke('chat:load') as PersistedChatState | null
        if (cancelled) return
        if (persisted?.conversations?.length) { hydratePersistedState(persisted); setChatLoaded(true); return }
        const legacy = loadLegacyChatState()
        if (legacy) { hydratePersistedState(legacy); window.localStorage.removeItem(LEGACY_CHAT_STORAGE_KEY) }
      } catch {
        const legacy = loadLegacyChatState()
        if (!cancelled && legacy) { hydratePersistedState(legacy); window.localStorage.removeItem(LEGACY_CHAT_STORAGE_KEY) }
      }
      if (!cancelled) setChatLoaded(true)
    }
    loadChat()
    return () => { cancelled = true }
  }, [hydratePersistedState])

  useEffect(() => {
    if (!chatLoaded) return
    const timeout = window.setTimeout(() => {
      window.openclaude.invoke('chat:save', { conversations, activeId } as PersistedChatState).catch(() => undefined)
    }, 150)
    return () => window.clearTimeout(timeout)
  }, [activeId, chatLoaded, conversations])

  const streamStatesRef = useRef(new Map<string, ConversationStreamState>())
  const initMetaRef = useRef<Record<string, unknown> | null>(null)

  const getConversationMessages = useCallback((conversationId?: string) => {
    const state = useChatStore.getState()
    const targetId = conversationId ?? state.activeId
    return state.conversations.find((conversation) => conversation.id === targetId)?.messages ?? []
  }, [])

  const ensureAssistantPlaceholder = useCallback((conversationId?: string) => {
    const messages = getConversationMessages(conversationId)
    const lastMessage = messages[messages.length - 1]
    if (lastMessage?.role === 'assistant' && lastMessage.isStreaming) return
    addMessage({ role: 'assistant', content: '', isStreaming: true }, conversationId)
  }, [addMessage, getConversationMessages])

  const beginAssistantTurn = useCallback((conversationId?: string) => {
    const messages = getConversationMessages(conversationId)
    const lastMessage = messages[messages.length - 1]

    if (lastMessage?.role === 'assistant' && lastMessage.isStreaming) {
      const hasContent = Boolean(
        lastMessage.content
        || lastMessage.thinkingContent?.trim()
        || lastMessage.toolCalls?.length,
      )
      if (!hasContent) return
      stopLastAssistantStreaming(conversationId)
    }

    addMessage({ role: 'assistant', content: '', isStreaming: true }, conversationId)
  }, [addMessage, getConversationMessages, stopLastAssistantStreaming])

  const getStreamState = useCallback((conversationId?: string | null) => {
    if (!conversationId) return createConversationStreamState()
    let state = streamStatesRef.current.get(conversationId)
    if (!state) {
      state = createConversationStreamState()
      streamStatesRef.current.set(conversationId, state)
    }
    return state
  }, [])

  const resetStreamState = useCallback((conversationId?: string | null) => {
    if (!conversationId) return
    streamStatesRef.current.set(conversationId, createConversationStreamState())
  }, [])

  const clearStreamState = useCallback((conversationId?: string | null) => {
    if (!conversationId) return
    streamStatesRef.current.delete(conversationId)
  }, [])

  // Streaming deltas arrive faster than the UI can re-render — each token
  // otherwise triggers a full Markdown re-parse, shiki highlight pass, and a
  // re-render of the whole conversation list. Coalesce deltas per conversation
  // into at most one state update per animation frame so the main thread stays
  // responsive during fast model output (Opus 4.7 etc.).
  const streamBuffersRef = useRef(
    new Map<string, { text: string; thinking: string; rafId: number | null }>(),
  )

  const getStreamBuffer = useCallback((conversationId: string) => {
    let buffer = streamBuffersRef.current.get(conversationId)
    if (!buffer) {
      buffer = { text: '', thinking: '', rafId: null }
      streamBuffersRef.current.set(conversationId, buffer)
    }
    return buffer
  }, [])

  const flushStreamBuffer = useCallback((conversationId?: string | null) => {
    if (!conversationId) return
    const buffer = streamBuffersRef.current.get(conversationId)
    if (!buffer) return
    if (buffer.rafId != null) {
      window.cancelAnimationFrame(buffer.rafId)
      buffer.rafId = null
    }
    if (buffer.text) {
      const pending = buffer.text
      buffer.text = ''
      appendToLastAssistant(pending, conversationId)
    }
    if (buffer.thinking) {
      const pending = buffer.thinking
      buffer.thinking = ''
      appendThinking(pending, conversationId)
    }
  }, [appendToLastAssistant, appendThinking])

  const scheduleStreamFlush = useCallback((conversationId: string) => {
    const buffer = getStreamBuffer(conversationId)
    if (buffer.rafId != null) return
    buffer.rafId = window.requestAnimationFrame(() => {
      flushStreamBuffer(conversationId)
    })
  }, [flushStreamBuffer, getStreamBuffer])

  const queueAssistantText = useCallback((text: string, conversationId?: string | null) => {
    if (!conversationId) {
      appendToLastAssistant(text, undefined)
      return
    }
    const buffer = getStreamBuffer(conversationId)
    buffer.text += text
    scheduleStreamFlush(conversationId)
  }, [appendToLastAssistant, getStreamBuffer, scheduleStreamFlush])

  const queueAssistantThinking = useCallback((text: string, conversationId?: string | null) => {
    if (!conversationId) {
      appendThinking(text, undefined)
      return
    }
    const buffer = getStreamBuffer(conversationId)
    buffer.thinking += text
    scheduleStreamFlush(conversationId)
  }, [appendThinking, getStreamBuffer, scheduleStreamFlush])

  const clearStreamBuffer = useCallback((conversationId?: string | null) => {
    if (!conversationId) return
    const buffer = streamBuffersRef.current.get(conversationId)
    if (!buffer) return
    if (buffer.rafId != null) {
      window.cancelAnimationFrame(buffer.rafId)
    }
    streamBuffersRef.current.delete(conversationId)
  }, [])

  useEffect(() => {
    const offEvent = window.openclaude.on('agent:event', (payload: AgentEventPayload) => {
      const targetConversationId = payload.conversationId
      const event = payload.event
      const streamState = getStreamState(targetConversationId)
      if (event.type === 'stream_event') {
        const se = (event as AgentEvent & { event?: Record<string, unknown> }).event as any
        if (!se) return
        if (se.type === 'message_start') {
          flushStreamBuffer(targetConversationId)
          resetStreamState(targetConversationId)
          beginAssistantTurn(targetConversationId ?? undefined)
          return
        }
        if (se.type === 'content_block_delta' && se.delta) {
          ensureAssistantPlaceholder(targetConversationId ?? undefined)
          if (se.delta.type === 'text_delta' && se.delta.text) {
            streamState.streamedText = true
            queueAssistantText(se.delta.text, targetConversationId)
          }
          else if (se.delta.type === 'thinking_delta' && se.delta.thinking) {
            streamState.streamedThinking = true
            queueAssistantThinking(se.delta.thinking, targetConversationId)
          }
        } else if (se.type === 'content_block_start' && se.content_block?.type === 'tool_use') {
          ensureAssistantPlaceholder(targetConversationId ?? undefined)
          // Flush any pending text before a tool call so visual ordering matches
          // the stream ordering (text → tool_use, not tool_use → text).
          flushStreamBuffer(targetConversationId)
          streamState.streamedToolCallIds.add(se.content_block.id)
          addToolCall({
            id: se.content_block.id,
            toolName: se.content_block.name,
            status: 'running',
            args: se.content_block.input,
            startedAt: Date.now(),
          }, targetConversationId ?? undefined)
        }
        return
      }
      if (event.type === 'assistant') {
        const msg = event.message
        if (!msg?.content) return
        ensureAssistantPlaceholder(targetConversationId ?? undefined)
        // Drain the streaming buffer first; the aggregated `assistant` event
        // is the authoritative turn snapshot and may be followed by tool
        // results that must render after the text.
        flushStreamBuffer(targetConversationId)
        for (const block of msg.content) {
          if (block.type === 'text' && !streamState.streamedText) {
            appendToLastAssistant(block.text, targetConversationId ?? undefined)
          }
          else if (block.type === 'thinking' && !streamState.streamedThinking) {
            appendThinking(block.thinking, targetConversationId ?? undefined)
          }
          else if (block.type === 'tool_use') {
            if (streamState.streamedToolCallIds.has(block.id)) {
              updateToolCall(block.id, {
                args: block.input,
              }, targetConversationId ?? undefined)
            } else {
              addToolCall({
                id: block.id,
                toolName: block.name,
                status: 'running',
                args: block.input,
                startedAt: Date.now(),
              }, targetConversationId ?? undefined)
            }
          }
        }
        return
      }
      if (event.type === 'user') {
        const msg = event.message
        if (!msg?.content) return
        flushStreamBuffer(targetConversationId)
        for (const block of msg.content) {
          if (block.type !== 'tool_result') continue
          updateToolCall(block.tool_use_id, {
            status: block.is_error ? 'error' : 'completed',
            result: block.content,
            completedAt: Date.now(),
          }, targetConversationId ?? undefined)
        }
      }
      if ((event as any).type === 'system' && (event as any).subtype === 'init') {
        initMetaRef.current = event as Record<string, unknown>
      }
    })
    const offDone = window.openclaude.on('agent:done', (payload: AgentDonePayload) => {
      const targetConversationId = payload.conversationId
      flushStreamBuffer(targetConversationId)
      clearStreamBuffer(targetConversationId)
      finishStreaming(targetConversationId ?? undefined)
      clearStreamState(targetConversationId)
    })
    const offError = window.openclaude.on('agent:error', (payload: AgentErrorPayload) => {
      const targetConversationId = payload.conversationId
      flushStreamBuffer(targetConversationId)
      clearStreamBuffer(targetConversationId)
      addMessage({ role: 'assistant', content: payload.error, isError: true }, targetConversationId ?? undefined)
      finishStreaming(targetConversationId ?? undefined)
      clearStreamState(targetConversationId)
    })
    return () => {
      offEvent()
      offDone()
      offError()
      for (const id of Array.from(streamBuffersRef.current.keys())) {
        flushStreamBuffer(id)
        clearStreamBuffer(id)
      }
    }
  }, [
    addMessage,
    appendToLastAssistant,
    appendThinking,
    addToolCall,
    updateToolCall,
    beginAssistantTurn,
    clearStreamBuffer,
    clearStreamState,
    ensureAssistantPlaceholder,
    finishStreaming,
    flushStreamBuffer,
    getStreamState,
    queueAssistantText,
    queueAssistantThinking,
    resetStreamState,
  ])

  const conv = active()
  const messages = conv?.messages ?? []
  const saveScrollSnapshot = useCallback((conversationId: string | null | undefined) => {
    const scrollElement = conversationContextRef.current?.scrollRef.current
    if (!conversationId || !scrollElement) return

    const maxScrollTop = Math.max(scrollElement.scrollHeight - scrollElement.clientHeight, 0)
    const scrollTop = Math.min(scrollElement.scrollTop, maxScrollTop)
    const atBottom = maxScrollTop - scrollTop < 8

    scrollSnapshotsRef.current.set(conversationId, { scrollTop, atBottom })
  }, [])

  const restoreScrollSnapshot = useCallback((conversationId: string | null | undefined) => {
    const context = conversationContextRef.current
    const scrollElement = context?.scrollRef.current
    if (!conversationId || !context || !scrollElement) return

    const snapshot = scrollSnapshotsRef.current.get(conversationId)
    if (!snapshot || snapshot.atBottom) {
      void context.scrollToBottom({ animation: 'instant' })
      return
    }

    context.stopScroll()
    const maxScrollTop = Math.max(scrollElement.scrollHeight - scrollElement.clientHeight, 0)
    scrollElement.scrollTop = Math.min(snapshot.scrollTop, maxScrollTop)
  }, [])

  useEffect(() => {
    const scrollElement = conversationContextRef.current?.scrollRef.current
    if (!activeId || !scrollElement) return

    const handleScroll = () => saveScrollSnapshot(activeId)

    scrollElement.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      handleScroll()
      scrollElement.removeEventListener('scroll', handleScroll)
    }
  }, [activeId, saveScrollSnapshot])

  useLayoutEffect(() => {
    if (!activeId) return

    const frame = window.requestAnimationFrame(() => {
      restoreScrollSnapshot(activeId)
      activeConversationRef.current = activeId
      messageCountRef.current = messages.length
    })

    return () => window.cancelAnimationFrame(frame)
  }, [activeId, restoreScrollSnapshot])

  useEffect(() => {
    if (activeConversationRef.current !== activeId) return

    if (messages.length > messageCountRef.current) {
      void conversationContextRef.current?.scrollToBottom({
        animation: 'smooth',
        preserveScrollPosition: true,
      })
    }

    messageCountRef.current = messages.length
  }, [activeId, messages.length])

  const handleSend = (text: string, images?: ImageAttachment[]) => {
    const targetConversationId = activeId ?? conv?.id
    if (!targetConversationId) return

    const trimmed = text.trim()

    if (trimmed === '/help') {
      addMessage({ role: 'user', content: trimmed }, targetConversationId)
      addMessage({
        role: 'assistant',
        content: [
          '## Available Commands',
          '',
          '- **/help** — Show this help message',
          '- **/clear** — Clear conversation history',
          '- **/mcp** — Show connected MCP servers and tools',
          '',
          '**Tips:**',
          '- Drag files into the input area to attach them',
          '- The agent can read files, write code, and run commands',
        ].join('\n'),
      }, targetConversationId)
      return
    }

    if (trimmed === '/clear') {
      addMessage({ role: 'user', content: trimmed }, targetConversationId)
      addMessage({ role: 'assistant', content: 'Conversation cleared. Starting fresh.' }, targetConversationId)
      return
    }

    if (trimmed === '/mcp') {
      addMessage({ role: 'user', content: trimmed }, targetConversationId)
      const meta = initMetaRef.current
      if (!meta) {
        addMessage({ role: 'assistant', content: 'No MCP information available yet. Send a message first to initialize the agent.' }, targetConversationId)
        return
      }
      const tools = Array.isArray(meta.tools) ? meta.tools as Array<{ name?: string; description?: string }> : []
      const mcpServers = meta.mcp_servers
      let content = '## MCP Status\n\n'
      if (mcpServers && typeof mcpServers === 'object') {
        const servers = Array.isArray(mcpServers) ? mcpServers : Object.values(mcpServers)
        content += `**Connected servers:** ${servers.length}\n\n`
        for (const server of servers) {
          const s = server as Record<string, unknown>
          content += `- **${s.name || s.id || 'Unknown'}** — ${s.status || 'connected'}\n`
        }
        content += '\n'
      } else {
        content += 'No MCP servers connected.\n\n'
      }
      const mcpTools = tools.filter((t) => t.name?.startsWith('mcp__'))
      if (mcpTools.length > 0) {
        content += `**MCP tools available:** ${mcpTools.length}\n\n`
        for (const tool of mcpTools.slice(0, 20)) {
          content += `- \`${tool.name}\`\n`
        }
        if (mcpTools.length > 20) content += `- ... and ${mcpTools.length - 20} more\n`
      } else {
        content += 'No MCP tools loaded. Try starting a new conversation after configuring MCP.\n'
      }
      addMessage({ role: 'assistant', content }, targetConversationId)
      return
    }

    resetStreamState(targetConversationId)

    const messageImages = images?.length
      ? images.map(({ base64, mediaType }) => ({ base64, mediaType }))
      : undefined
    addMessage({ role: 'user', content: text, images: messageImages }, targetConversationId)
    startStreaming(targetConversationId)
    window.openclaude.invoke('agent:query', text, targetConversationId, images).catch((error) => {
      addMessage({ role: 'assistant', content: String(error), isError: true }, targetConversationId)
      finishStreaming(targetConversationId)
      clearStreamState(targetConversationId)
    })
  }

  const handleAbort = () => {
    const targetConversationId = activeId ?? conv?.id
    window.openclaude.invoke('agent:abort', targetConversationId ?? undefined).catch(() => undefined)
    finishStreaming(targetConversationId ?? undefined)
    clearStreamState(targetConversationId)
  }

  if (!loaded || !chatLoaded) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="animate-spin text-primary" size={24} />
      </div>
    )
  }

  const needsSetup = !settings.apiKey
  const isActiveStreaming = activeId ? streamingConversationIds.includes(activeId) : false

  return (
    <div className="h-screen flex bg-background text-foreground overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Title bar */}
        <div className="h-11 shrink-0 flex items-center px-4 border-b" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
          <div className="text-[13px] font-medium text-muted-foreground truncate">{conv?.title ?? 'OpenClaude'}</div>
        </div>

        {/* Messages */}
        <Conversation contextRef={conversationContextRef} className="flex-1">
          <ConversationContent className="mx-auto w-full max-w-[720px] px-5 py-4">
            {messages.length === 0 && !isActiveStreaming && (
              <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
                <img src={STARTUP_LOGO_SRC} alt="OpenClaude" className="w-12 h-12 rounded-xl mb-4" />
                <h1 className="text-lg font-semibold text-foreground mb-1">OpenClaude</h1>
                <p className="text-[13px] text-muted-foreground max-w-xs">Ask anything. Read files, write code, run commands.</p>
                {needsSetup && (
                  <button onClick={togglePanel} className="mt-5 px-4 py-2 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity">
                    Set up API key to get started
                  </button>
                )}
              </div>
            )}
            <div className="space-y-0">
              {messages.map((msg, index) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  previousRole={index > 0 ? messages[index - 1].role : undefined}
                  isStreaming={isActiveStreaming}
                />
              ))}
            </div>
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <ChatInput onSend={handleSend} onAbort={handleAbort} isStreaming={isActiveStreaming} />
      </div>
      {showPanel && <SettingsPanel />}
    </div>
  )
}
