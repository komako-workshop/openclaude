import { useState, useRef, useEffect, useCallback, useMemo, type KeyboardEvent, type DragEvent } from 'react'
import { ArrowUp, Square, ChevronDown, Check, Search, Paperclip, X } from 'lucide-react'
import { useSettingsStore } from '../stores/settingsStore'

type ModelEntry = { value: string; label: string; provider: string }

const OPENROUTER_MODELS: ModelEntry[] = [
  { value: 'anthropic/claude-opus-4.6', label: 'Claude Opus 4.6', provider: 'Anthropic' },
  { value: 'anthropic/claude-sonnet-4.6', label: 'Claude Sonnet 4.6', provider: 'Anthropic' },
  { value: 'anthropic/claude-opus-4.5', label: 'Claude Opus 4.5', provider: 'Anthropic' },
  { value: 'anthropic/claude-haiku-4.5', label: 'Claude Haiku 4.5', provider: 'Anthropic' },
]

const ANTHROPIC_MODELS: ModelEntry[] = [
  { value: 'claude-opus-4-6-20260204', label: 'Claude Opus 4.6', provider: 'Anthropic' },
  { value: 'claude-sonnet-4-6-20260217', label: 'Claude Sonnet 4.6', provider: 'Anthropic' },
  { value: 'claude-opus-4-5-20251124', label: 'Claude Opus 4.5', provider: 'Anthropic' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', provider: 'Anthropic' },
]

function getModelsForBaseURL(baseURL: string): ModelEntry[] {
  if (baseURL.includes('openrouter.ai')) return OPENROUTER_MODELS
  return ANTHROPIC_MODELS
}

const PROVIDERS = ['Anthropic'] as const

type AttachedFile = { name: string; path: string }

type Props = { onSend: (text: string) => void; onAbort: () => void; isStreaming: boolean }

export function ChatInput({ onSend, onAbort, isStreaming }: Props) {
  const [text, setText] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([])
  const [dragOver, setDragOver] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const dragCounterRef = useRef(0)
  const { settings, save } = useSettingsStore()

  useEffect(() => { if (!isStreaming) ref.current?.focus() }, [isStreaming])

  useEffect(() => {
    if (!menuOpen) return
    const timer = window.setTimeout(() => searchRef.current?.focus(), 60)
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => { document.removeEventListener('mousedown', handler); window.clearTimeout(timer) }
  }, [menuOpen])

  const submit = () => {
    const trimmed = text.trim()
    if (!trimmed && attachedFiles.length === 0) return
    if (isStreaming) return

    let prompt = trimmed
    if (attachedFiles.length > 0) {
      const fileList = attachedFiles.map((f) => f.path).join('\n')
      const prefix = `[User attached ${attachedFiles.length} file(s). Read them with the Read tool before responding:\n${fileList}\n]\n\n`
      prompt = prefix + prompt
      if (!trimmed) prompt = prefix + 'Please review the attached file(s).'
    }

    onSend(prompt)
    setText('')
    setAttachedFiles([])
    if (ref.current) ref.current.style.height = '42px'
  }

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault()
    dragCounterRef.current += 1
    if (e.dataTransfer?.types?.includes('Files')) setDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault()
    dragCounterRef.current -= 1
    if (dragCounterRef.current <= 0) { dragCounterRef.current = 0; setDragOver(false) }
  }, [])

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault()
    dragCounterRef.current = 0
    setDragOver(false)

    const files = e.dataTransfer?.files
    if (!files?.length) return

    const newFiles: AttachedFile[] = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const filePath = (file as File & { path?: string }).path
      if (filePath) {
        newFiles.push({ name: file.name, path: filePath })
      }
    }
    if (newFiles.length > 0) {
      setAttachedFiles((prev) => [...prev, ...newFiles])
    }
  }, [])

  const removeFile = useCallback((index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
  }

  const handleSelect = useCallback((value: string) => {
    save({ model: value })
    setMenuOpen(false)
    setSearch('')
  }, [save])

  const activeModels = useMemo(() => getModelsForBaseURL(settings.baseURL), [settings.baseURL])

  const filteredGroups = useMemo(() => {
    const q = search.toLowerCase()
    return PROVIDERS
      .map((provider) => ({
        provider,
        models: activeModels.filter((m) => m.provider === provider && (!q || m.label.toLowerCase().includes(q) || m.value.toLowerCase().includes(q))),
      }))
      .filter((g) => g.models.length > 0)
  }, [search, activeModels])

  const shortModel = settings.model.split('/').pop() ?? settings.model

  return (
    <div className="px-4 pb-3 pt-2" style={{ background: 'color-mix(in srgb, var(--bg) 80%, transparent)', backdropFilter: 'blur(16px)' }}>
      <div className="max-w-[720px] mx-auto relative">
        {/* Model selector popover — outside the overflow-hidden card */}
        {menuOpen && (
          <div
            ref={menuRef}
            className="absolute bottom-full left-0 mb-2 w-64 rounded-xl border shadow-lg overflow-hidden z-50"
            style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
          >
            <div className="px-3 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--muted-fg)' }}>
                <Search size={12} className="shrink-0" />
                <input
                  ref={searchRef}
                  type="text"
                  placeholder="Search models…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Escape') { setMenuOpen(false); setSearch('') } }}
                  className="w-full bg-transparent border-0 outline-none text-xs"
                  style={{ color: 'var(--fg)' }}
                />
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto py-1">
              {filteredGroups.map((group, gi) => (
                <div key={group.provider} className={gi > 0 ? 'border-t' : ''} style={{ borderColor: 'var(--border)' }}>
                  <div className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--muted-fg)' }}>
                    {group.provider}
                  </div>
                  {group.models.map((m) => {
                    const active = m.value === settings.model
                    return (
                      <button
                        key={m.value}
                        onClick={() => handleSelect(m.value)}
                        className="flex w-full items-center justify-between px-3 py-1.5 text-xs transition-colors"
                        style={{
                          color: active ? 'var(--primary)' : 'var(--fg)',
                          background: active ? 'color-mix(in srgb, var(--primary) 8%, transparent)' : undefined,
                        }}
                      >
                        <span className="font-mono">{m.label}</span>
                        {active && <Check size={12} className="shrink-0" />}
                      </button>
                    )
                  })}
                </div>
              ))}
              {filteredGroups.length === 0 && (
                <div className="px-3 py-3 text-center text-xs" style={{ color: 'var(--muted-fg)' }}>
                  No models found
                </div>
              )}
            </div>
          </div>
        )}

        {/* Input card */}
        <div
          className="border rounded-xl overflow-hidden transition-colors"
          style={{
            borderColor: dragOver ? 'var(--primary)' : 'var(--border)',
            background: dragOver ? 'color-mix(in srgb, var(--primary) 4%, var(--card))' : 'var(--card)',
          }}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {/* Attached files */}
          {attachedFiles.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-3 pt-2.5">
              {attachedFiles.map((file, index) => (
                <span
                  key={`${file.path}-${index}`}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs"
                  style={{ background: 'var(--muted)', color: 'var(--fg)' }}
                >
                  <Paperclip size={11} className="shrink-0" style={{ color: 'var(--muted-fg)' }} />
                  <span className="truncate max-w-[180px]">{file.name}</span>
                  <button
                    onClick={() => removeFile(index)}
                    className="shrink-0 hover:opacity-70 transition-opacity"
                    style={{ color: 'var(--muted-fg)' }}
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}

          <textarea
            ref={ref} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={handleKeyDown}
            placeholder={dragOver ? 'Drop files here…' : 'Message OpenClaude…'} rows={1}
            className="w-full resize-none bg-transparent px-4 pt-3 pb-2 text-sm focus:outline-none"
            style={{ color: 'var(--fg)', maxHeight: 160, minHeight: 42 }}
            onInput={(e) => { const t = e.currentTarget; t.style.height = '42px'; t.style.height = Math.min(t.scrollHeight, 160) + 'px' }}
          />
          <div className="flex items-center justify-between px-3 pb-2">
            <div className="flex items-center gap-2">
              <button onClick={() => setMenuOpen(!menuOpen)}
                className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-md transition-colors"
                style={{ color: 'var(--muted-fg)' }}>
                <span className="font-medium">{shortModel}</span>
                <ChevronDown size={10} className={`transition-transform duration-200 ${menuOpen ? 'rotate-180' : ''}`} />
              </button>
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
              <button onClick={submit} disabled={!text.trim() && attachedFiles.length === 0}
                className="p-1.5 rounded-lg text-white transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                style={{ background: (text.trim() || attachedFiles.length > 0) ? 'var(--primary)' : 'var(--muted-fg)' }}>
                <ArrowUp size={14} strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
