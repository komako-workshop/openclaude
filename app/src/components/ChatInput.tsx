import { useState, useRef, useEffect, useCallback, useMemo, type KeyboardEvent, type DragEvent, type ClipboardEvent } from 'react'
import { ArrowUp, Square, ChevronDown, Check, Search, Paperclip, X, Image as ImageIcon } from 'lucide-react'
import { useSettingsStore } from '../stores/settingsStore'
import type { ImageAttachment } from '../types/bridge'

type ModelEntry = { value: string; label: string; provider: string }

const OPENROUTER_MODELS: ModelEntry[] = [
  { value: 'anthropic/claude-opus-4.7', label: 'Claude Opus 4.7', provider: 'Anthropic' },
  { value: 'anthropic/claude-opus-4.6', label: 'Claude Opus 4.6', provider: 'Anthropic' },
  { value: 'anthropic/claude-opus-4.6-fast', label: 'Claude Opus 4.6 Fast', provider: 'Anthropic' },
  { value: 'anthropic/claude-sonnet-4.6', label: 'Claude Sonnet 4.6', provider: 'Anthropic' },
  { value: 'anthropic/claude-opus-4.5', label: 'Claude Opus 4.5', provider: 'Anthropic' },
  { value: 'anthropic/claude-haiku-4.5', label: 'Claude Haiku 4.5', provider: 'Anthropic' },
]

const ANTHROPIC_MODELS: ModelEntry[] = [
  { value: 'claude-opus-4-7', label: 'Claude Opus 4.7', provider: 'Anthropic' },
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
type AttachedImageLocal = ImageAttachment & { previewUrl: string }

const IMAGE_MIME_RE = /^image\/(png|jpe?g|gif|webp)$/
const MAX_IMAGE_DIMENSION = 1568
const MAX_IMAGE_BYTES = 4 * 1024 * 1024

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function resizeImageIfNeeded(dataUrl: string): Promise<{ base64: string; mediaType: string }> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const { naturalWidth: w, naturalHeight: h } = img
      const rawBase64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl
      const rawBytes = Math.ceil(rawBase64.length * 3 / 4)

      if (w <= MAX_IMAGE_DIMENSION && h <= MAX_IMAGE_DIMENSION && rawBytes <= MAX_IMAGE_BYTES) {
        resolve({ base64: rawBase64, mediaType: 'image/png' })
        return
      }

      const scale = Math.min(MAX_IMAGE_DIMENSION / w, MAX_IMAGE_DIMENSION / h, 1)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(w * scale)
      canvas.height = Math.round(h * scale)
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

      let quality = 0.85
      let result = canvas.toDataURL('image/jpeg', quality)
      while (Math.ceil(result.length * 3 / 4) > MAX_IMAGE_BYTES && quality > 0.3) {
        quality -= 0.1
        result = canvas.toDataURL('image/jpeg', quality)
      }

      const base64 = result.includes(',') ? result.split(',')[1] : result
      resolve({ base64, mediaType: 'image/jpeg' })
    }
    img.onerror = () => {
      const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl
      resolve({ base64, mediaType: 'image/png' })
    }
    img.src = dataUrl
  })
}

async function fileToAttachedImage(file: File): Promise<AttachedImageLocal | null> {
  if (!IMAGE_MIME_RE.test(file.type)) return null
  const dataUrl = await readFileAsDataURL(file)
  const { base64, mediaType } = await resizeImageIfNeeded(dataUrl)
  return {
    name: file.name || 'image.png',
    base64,
    mediaType,
    previewUrl: URL.createObjectURL(file),
  }
}

type Props = {
  onSend: (text: string, images?: ImageAttachment[]) => void
  onAbort: () => void
  isStreaming: boolean
}

export function ChatInput({ onSend, onAbort, isStreaming }: Props) {
  const [text, setText] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([])
  const [attachedImages, setAttachedImages] = useState<AttachedImageLocal[]>([])
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

  const hasContent = text.trim() || attachedFiles.length > 0 || attachedImages.length > 0

  const submit = () => {
    const trimmed = text.trim()
    if (!trimmed && attachedFiles.length === 0 && attachedImages.length === 0) return
    if (isStreaming) return

    let prompt = trimmed
    if (attachedFiles.length > 0) {
      const fileList = attachedFiles.map((f) => f.path).join('\n')
      const prefix = `[User attached ${attachedFiles.length} file(s). Read them with the Read tool before responding:\n${fileList}\n]\n\n`
      prompt = prefix + prompt
      if (!trimmed && attachedImages.length === 0) prompt = prefix + 'Please review the attached file(s).'
    }

    const images = attachedImages.length > 0
      ? attachedImages.map(({ base64, mediaType, name }) => ({ base64, mediaType, name }))
      : undefined

    onSend(prompt, images)
    setText('')
    setAttachedFiles([])
    for (const img of attachedImages) URL.revokeObjectURL(img.previewUrl)
    setAttachedImages([])
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

  const addImageFiles = useCallback(async (files: File[]) => {
    const results = await Promise.all(files.map(fileToAttachedImage))
    const valid = results.filter((r): r is AttachedImageLocal => r !== null)
    if (valid.length > 0) setAttachedImages((prev) => [...prev, ...valid])
    return valid.length
  }, [])

  const handleDrop = useCallback(async (e: DragEvent) => {
    e.preventDefault()
    dragCounterRef.current = 0
    setDragOver(false)

    const files = e.dataTransfer?.files
    if (!files?.length) return

    const imageFiles: File[] = []
    const nonImageFiles: AttachedFile[] = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (IMAGE_MIME_RE.test(file.type)) {
        imageFiles.push(file)
      } else {
        const filePath = (file as File & { path?: string }).path
        if (filePath) nonImageFiles.push({ name: file.name, path: filePath })
      }
    }
    if (nonImageFiles.length > 0) setAttachedFiles((prev) => [...prev, ...nonImageFiles])
    if (imageFiles.length > 0) await addImageFiles(imageFiles)
  }, [addImageFiles])

  const handlePaste = useCallback(async (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items
    if (!items) return

    const imageFiles: File[] = []
    for (const item of items) {
      if (item.kind === 'file' && IMAGE_MIME_RE.test(item.type)) {
        const file = item.getAsFile()
        if (file) imageFiles.push(file)
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault()
      await addImageFiles(imageFiles)
    }
  }, [addImageFiles])

  const removeFile = useCallback((index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const removeImage = useCallback((index: number) => {
    setAttachedImages((prev) => {
      const removed = prev[index]
      if (removed) URL.revokeObjectURL(removed.previewUrl)
      return prev.filter((_, i) => i !== index)
    })
  }, [])

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit() }
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
          {/* Attached files & images */}
          {(attachedFiles.length > 0 || attachedImages.length > 0) && (
            <div className="flex flex-wrap gap-1.5 px-3 pt-2.5">
              {attachedImages.map((img, index) => (
                <div
                  key={`img-${index}`}
                  className="relative group/img"
                  onDoubleClick={() => window.openclaude.invoke('image:preview', img.base64, img.mediaType)}
                >
                  <img
                    src={img.previewUrl}
                    alt={img.name}
                    className="h-14 w-14 rounded-lg object-cover cursor-pointer border"
                    style={{ borderColor: 'var(--border)' }}
                  />
                  <button
                    onClick={(e) => { e.stopPropagation(); removeImage(index) }}
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity"
                    style={{ background: 'var(--fg)', color: 'var(--bg)' }}
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
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
            onPaste={handlePaste}
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
              <button onClick={submit} disabled={!hasContent}
                className="p-1.5 rounded-lg text-white transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                style={{ background: hasContent ? 'var(--primary)' : 'var(--muted-fg)' }}>
                <ArrowUp size={14} strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
