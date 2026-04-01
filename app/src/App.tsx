import { useEffect, useMemo, useRef, type CSSProperties } from 'react'
import { marked } from 'marked'
import { Loader2, Settings, Trash2 } from 'lucide-react'
import { ChatInput } from './components/ChatInput'
import { MessageBubble } from './components/MessageBubble'
import { SettingsPanel } from './components/SettingsPanel'
import { useChatStore } from './stores/chatStore'
import { useSettingsStore } from './stores/settingsStore'
import type { AgentEvent } from './types/bridge'

function StreamingMarkdown({ text }: { text: string }) {
  const html = useMemo(() => marked.parse(text) as string, [text])
  return <div dangerouslySetInnerHTML={{ __html: html }} />
}

export default function App() {
  const {
    messages,
    isStreaming,
    currentText,
    currentTools,
    currentThinking,
    addUserMessage,
    startStreaming,
    appendText,
    addToolCall,
    setThinking,
    finishStreaming,
    addError,
    clearMessages,
  } = useChatStore()

  const { loaded, showPanel, load: loadSettings, togglePanel, settings } = useSettingsStore()
  const scrollRef = useRef<HTMLDivElement>(null)
  const listenersRef = useRef<Array<() => void>>([])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  useEffect(() => {
    listenersRef.current.forEach((off) => off())

    const offEvent = window.openclaude.on('agent:event', (raw: unknown) => {
      const event = raw as AgentEvent
      if (event.type !== 'assistant' || !event.message?.content) return

      for (const block of event.message.content) {
        if (block.type === 'text') {
          appendText(block.text)
        } else if (block.type === 'tool_use') {
          addToolCall({ id: block.id, name: block.name, input: block.input })
        } else if (block.type === 'thinking') {
          setThinking(block.thinking)
        }
      }
    })

    const offDone = window.openclaude.on('agent:done', () => finishStreaming())
    const offError = window.openclaude.on('agent:error', (err: unknown) => addError(String(err)))

    listenersRef.current = [offEvent, offDone, offError]
    return () => listenersRef.current.forEach((off) => off())
  }, [addError, addToolCall, appendText, finishStreaming, setThinking])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, currentText, currentTools, currentThinking])

  const handleSend = (text: string) => {
    addUserMessage(text)
    startStreaming()
    window.openclaude.invoke('agent:query', text).catch((error) => {
      addError(String(error))
    })
  }

  const handleAbort = () => {
    window.openclaude.invoke('agent:abort').catch(() => undefined)
    finishStreaming()
  }

  if (!loaded) {
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0f0f14',
        }}
      >
        <Loader2 className="animate-spin text-accent" size={28} />
      </div>
    )
  }

  const needsSetup = !settings.apiKey

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: '#0f0f14',
        color: '#d4d4d8',
      }}
    >
      <div
        style={{
          height: 48,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          WebkitAppRegion: 'drag',
        } as CSSProperties}
      >
        <div style={{ paddingLeft: 80, fontSize: 14, fontWeight: 500, color: '#a1a1aa' }}>
          OpenClaude
        </div>
        <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
          <button
            onClick={clearMessages}
            className="p-1.5 text-zinc-500 hover:text-zinc-300 rounded-lg hover:bg-surface-lighter transition-colors"
            title="Clear"
          >
            <Trash2 size={15} />
          </button>
          <button
            onClick={togglePanel}
            className="p-1.5 text-zinc-500 hover:text-zinc-300 rounded-lg hover:bg-surface-lighter transition-colors"
            title="Settings"
          >
            <Settings size={15} />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-3xl mx-auto">
          {messages.length === 0 && !isStreaming && (
            <div className="flex flex-col items-center justify-center h-full min-h-[50vh] text-center">
              <div className="text-3xl font-bold bg-gradient-to-r from-accent to-amber-400 bg-clip-text text-transparent mb-3">
                OpenClaude
              </div>
              <p className="text-sm text-zinc-500 max-w-md">
                Claude Code agent engine in a desktop app. Ask me to read files, write code,
                run commands, search the web, or inspect the current project.
              </p>
              {needsSetup && (
                <button
                  onClick={togglePanel}
                  className="mt-4 px-4 py-2 text-sm bg-accent/20 hover:bg-accent/30 border border-accent/30 text-accent-light rounded-xl transition-colors"
                >
                  Set up API key to get started
                </button>
              )}
            </div>
          )}

          {messages.map((msg) => (
            <MessageBubble key={msg.id} msg={msg} />
          ))}

          {isStreaming && (
            <div className="mb-4 max-w-[90%]">
              {currentThinking && (
                <div className="text-xs text-zinc-500 bg-surface-light/50 rounded-lg p-3 mb-2 border border-border italic whitespace-pre-wrap">
                  {currentThinking}
                </div>
              )}

              {currentTools.map((tool) => (
                <div
                  key={tool.id}
                  className="flex items-center gap-2 text-xs text-zinc-500 bg-surface-light/50 border border-border rounded-lg px-3 py-2 my-1.5"
                >
                  <Loader2 size={13} className="animate-spin text-accent-light" />
                  <span className="font-medium text-zinc-400">{tool.name}</span>
                  <span className="truncate text-zinc-600">{JSON.stringify(tool.input).slice(0, 80)}</span>
                </div>
              ))}

              {currentText ? (
                <div className="prose prose-invert prose-sm max-w-none">
                  <StreamingMarkdown text={currentText} />
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <Loader2 size={14} className="animate-spin" />
                  <span>Thinking...</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <ChatInput onSend={handleSend} onAbort={handleAbort} isStreaming={isStreaming} />
      {showPanel && <SettingsPanel />}
    </div>
  )
}
