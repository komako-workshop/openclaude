import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import { ArrowUp, Square, ChevronDown } from 'lucide-react'
import { useSettingsStore } from '../stores/settingsStore'

const MODELS = [
  'anthropic/claude-sonnet-4-6',
  'anthropic/claude-opus-4-6',
  'anthropic/claude-haiku-3.5',
  'google/gemini-2.5-pro-preview',
  'openai/gpt-4.1',
]

type Props = { onSend: (text: string) => void; onAbort: () => void; isStreaming: boolean }

export function ChatInput({ onSend, onAbort, isStreaming }: Props) {
  const [text, setText] = useState('')
  const [showModels, setShowModels] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)
  const { settings, save } = useSettingsStore()

  useEffect(() => { if (!isStreaming) ref.current?.focus() }, [isStreaming])

  const submit = () => {
    const trimmed = text.trim()
    if (!trimmed || isStreaming) return
    onSend(trimmed)
    setText('')
    if (ref.current) ref.current.style.height = '42px'
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
  }

  const shortModel = settings.model.split('/').pop() ?? settings.model

  return (
    <div className="px-4 pb-3 pt-2" style={{ background: 'color-mix(in srgb, var(--bg) 80%, transparent)', backdropFilter: 'blur(16px)' }}>
      <div className="max-w-[720px] mx-auto">
        <div className="border rounded-xl overflow-hidden transition-colors"
          style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
          <textarea
            ref={ref} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={handleKeyDown}
            placeholder="Message OpenClaude…" rows={1}
            className="w-full resize-none bg-transparent px-4 pt-3 pb-2 text-sm focus:outline-none"
            style={{ color: 'var(--fg)', maxHeight: 160, minHeight: 42 }}
            onInput={(e) => { const t = e.currentTarget; t.style.height = '42px'; t.style.height = Math.min(t.scrollHeight, 160) + 'px' }}
          />
          <div className="flex items-center justify-between px-3 pb-2">
            <div className="flex items-center gap-2">
              <div className="relative">
                <button onClick={() => setShowModels(!showModels)}
                  className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-md transition-colors"
                  style={{ color: 'var(--muted-fg)' }}>
                  <span className="font-medium">{shortModel}</span>
                  <ChevronDown size={10} />
                </button>
                {showModels && (
                  <div className="absolute bottom-full left-0 mb-1 border rounded-lg shadow-2xl py-1 min-w-[240px] z-50"
                    style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                    {MODELS.map((m) => (
                      <button key={m} onClick={() => { save({ model: m }); setShowModels(false) }}
                        className="block w-full text-left px-3 py-1.5 text-xs transition-colors"
                        style={{ color: m === settings.model ? 'var(--primary)' : 'var(--muted-fg)', background: m === settings.model ? 'color-mix(in srgb, var(--primary) 8%, transparent)' : undefined }}>
                        {m}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <span className="text-[11px]" style={{ color: 'var(--muted-fg)' }}>
                {settings.permissionMode === 'bypassPermissions' ? 'Full access' : settings.permissionMode === 'acceptEdits' ? 'Accept edits' : 'Ask permission'}
              </span>
            </div>
            {isStreaming ? (
              <button onClick={onAbort} className="p-1.5 rounded-lg transition-colors"
                style={{ background: 'color-mix(in srgb, var(--destructive) 15%, transparent)', color: 'var(--destructive)' }}>
                <Square size={14} />
              </button>
            ) : (
              <button onClick={submit} disabled={!text.trim()}
                className="p-1.5 rounded-lg text-white transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                style={{ background: text.trim() ? 'var(--primary)' : 'var(--muted-fg)' }}>
                <ArrowUp size={14} strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
