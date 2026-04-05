import { useEffect, useRef, useState } from 'react'
import { Loader2, Settings } from 'lucide-react'
import { LEGACY_CHAT_STORAGE_KEY, useChatStore } from './stores/chatStore'
import { useSettingsStore } from './stores/settingsStore'
import { Sidebar } from './components/Sidebar'
import MessageBubble from './components/MessageBubble'
import { ChatInput } from './components/ChatInput'
import { SettingsPanel } from './components/SettingsPanel'
import type { AgentEvent } from './types/bridge'
import type { PersistedChatState } from './stores/chatStore'

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
    active, conversations, activeId, hydratePersistedState, isStreaming, streamingConversationId,
    addMessage, appendToLastAssistant, appendThinking,
    addToolCall, startStreaming, finishStreaming,
  } = useChatStore()

  const { loaded, showPanel, load: loadSettings, togglePanel, settings } = useSettingsStore()
  const scrollRef = useRef<HTMLDivElement>(null)
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

  const hadStreamDeltas = useRef(false)
  const streamTargetIdRef = useRef<string | null>(null)

  useEffect(() => {
    streamTargetIdRef.current = streamingConversationId
  }, [streamingConversationId])

  useEffect(() => {
    const offEvent = window.openclaude.on('agent:event', (raw: unknown) => {
      const event = raw as Record<string, unknown>
      const targetConversationId = streamTargetIdRef.current
      if (event.type === 'stream_event') {
        const se = (event as any).event
        if (!se) return
        if (se.type === 'content_block_delta' && se.delta) {
          if (se.delta.type === 'text_delta' && se.delta.text) {
            hadStreamDeltas.current = true
            appendToLastAssistant(se.delta.text, targetConversationId ?? undefined)
          }
          else if (se.delta.type === 'thinking_delta' && se.delta.thinking) {
            hadStreamDeltas.current = true
            appendThinking(se.delta.thinking, targetConversationId ?? undefined)
          }
        } else if (se.type === 'content_block_start' && se.content_block?.type === 'tool_use') {
          hadStreamDeltas.current = true
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
        const msg = (event as AgentEvent).message
        if (!msg?.content) return
        for (const block of msg.content) {
          if (block.type === 'text' && !hadStreamDeltas.current) {
            appendToLastAssistant(block.text, targetConversationId ?? undefined)
          }
          else if (block.type === 'tool_use' && !hadStreamDeltas.current)
            addToolCall({
              id: block.id,
              toolName: block.name,
              status: 'running',
              args: block.input,
              startedAt: Date.now(),
            }, targetConversationId ?? undefined)
        }
      }
    })
    const offDone = window.openclaude.on('agent:done', () => {
      const targetConversationId = streamTargetIdRef.current
      finishStreaming(targetConversationId ?? undefined)
      streamTargetIdRef.current = null
    })
    const offError = window.openclaude.on('agent:error', (err: unknown) => {
      const targetConversationId = streamTargetIdRef.current
      addMessage({ role: 'assistant', content: String(err), isError: true }, targetConversationId ?? undefined)
      finishStreaming(targetConversationId ?? undefined)
      streamTargetIdRef.current = null
    })
    return () => { offEvent(); offDone(); offError() }
  }, [addMessage, appendToLastAssistant, appendThinking, addToolCall, finishStreaming])

  const conv = active()
  const messages = conv?.messages ?? []
  const stickToBottom = useRef(true)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => { stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80 }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (stickToBottom.current) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const handleSend = (text: string) => {
    const targetConversationId = activeId ?? conv?.id
    if (!targetConversationId) return

    hadStreamDeltas.current = false
    streamTargetIdRef.current = targetConversationId
    addMessage({ role: 'user', content: text }, targetConversationId)
    addMessage({ role: 'assistant', content: '', isStreaming: true }, targetConversationId)
    startStreaming(targetConversationId)
    window.openclaude.invoke('agent:query', text, targetConversationId).catch((error) => {
      addMessage({ role: 'assistant', content: String(error), isError: true }, targetConversationId)
      finishStreaming(targetConversationId)
      streamTargetIdRef.current = null
    })
  }

  const handleAbort = () => {
    const targetConversationId = streamTargetIdRef.current
    window.openclaude.invoke('agent:abort').catch(() => undefined)
    finishStreaming(targetConversationId ?? undefined)
    streamTargetIdRef.current = null
  }

  if (!loaded || !chatLoaded) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="animate-spin text-primary" size={24} />
      </div>
    )
  }

  const needsSetup = !settings.apiKey

  return (
    <div className="h-screen flex bg-background text-foreground overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Title bar */}
        <div className="h-11 shrink-0 flex items-center justify-between px-4 border-b" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
          <div className="text-[13px] font-medium text-muted-foreground truncate max-w-[50%]">{conv?.title ?? 'OpenClaude'}</div>
          <button onClick={togglePanel} className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties} title="Settings">
            <Settings size={14} />
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="max-w-[720px] mx-auto px-5 py-4">
            {messages.length === 0 && !isStreaming && (
              <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <span className="text-lg font-bold text-primary">O</span>
                </div>
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
              {messages.map((msg) => <MessageBubble key={msg.id} message={msg} isStreaming={isStreaming} />)}
            </div>
          </div>
        </div>

        <ChatInput onSend={handleSend} onAbort={handleAbort} isStreaming={isStreaming} />
      </div>
      {showPanel && <SettingsPanel />}
    </div>
  )
}
