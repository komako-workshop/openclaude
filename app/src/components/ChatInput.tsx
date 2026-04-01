import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import { Send, Square } from 'lucide-react'

type Props = {
  onSend: (text: string) => void
  onAbort: () => void
  isStreaming: boolean
}

export function ChatInput({ onSend, onAbort, isStreaming }: Props) {
  const [text, setText] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!isStreaming) ref.current?.focus()
  }, [isStreaming])

  const submit = () => {
    const trimmed = text.trim()
    if (!trimmed || isStreaming) return
    onSend(trimmed)
    setText('')
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="border-t border-border bg-surface-light/80 backdrop-blur-md px-4 py-3">
      <div className="flex items-end gap-2 max-w-3xl mx-auto">
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything…"
          rows={1}
          className="flex-1 resize-none bg-surface-lighter border border-border rounded-xl px-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-accent/50 transition-colors"
          style={{ maxHeight: 160, minHeight: 40 }}
          onInput={(e) => {
            const t = e.currentTarget
            t.style.height = '40px'
            t.style.height = Math.min(t.scrollHeight, 160) + 'px'
          }}
        />

        {isStreaming ? (
          <button
            onClick={onAbort}
            className="shrink-0 p-2.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-xl text-red-400 transition-colors"
          >
            <Square size={18} />
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={!text.trim()}
            className="shrink-0 p-2.5 bg-accent/20 hover:bg-accent/30 border border-accent/30 rounded-xl text-accent-light disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <Send size={18} />
          </button>
        )}
      </div>
    </div>
  )
}
