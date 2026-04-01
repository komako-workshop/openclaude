import { marked } from 'marked'
import { useMemo, useState } from 'react'
import { AlertTriangle, Brain, ChevronDown, ChevronRight } from 'lucide-react'
import { ToolCard } from './ToolCard'
import type { ChatMessage } from '../stores/chatStore'

marked.setOptions({ breaks: true, gfm: true })

function RenderedMarkdown({ text }: { text: string }) {
  const html = useMemo(() => marked.parse(text) as string, [text])
  return (
    <div
      className="prose prose-invert prose-sm max-w-none prose-pre:bg-surface prose-pre:border prose-pre:border-border prose-code:text-accent-light"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

export function MessageBubble({ msg }: { msg: ChatMessage }) {
  const [showThinking, setShowThinking] = useState(false)

  if (msg.role === 'user') {
    return (
      <div className="flex justify-end mb-4">
        <div className="bg-accent/15 border border-accent/20 rounded-2xl rounded-tr-md px-4 py-2.5 max-w-[80%] text-sm text-zinc-200">
          {msg.content}
        </div>
      </div>
    )
  }

  if (msg.role === 'error') {
    return (
      <div className="flex items-start gap-2 mb-4 px-3 py-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-300">
        <AlertTriangle size={16} className="shrink-0 mt-0.5" />
        <span>{msg.content}</span>
      </div>
    )
  }

  return (
    <div className="mb-4 max-w-[90%]">
      {msg.thinking && (
        <button
          onClick={() => setShowThinking(!showThinking)}
          className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-400 mb-1.5 transition-colors"
        >
          <Brain size={13} />
          <span>Thinking</span>
          {showThinking ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
      )}
      {showThinking && msg.thinking && (
        <div className="text-xs text-zinc-500 bg-surface-light/50 rounded-lg p-3 mb-2 border border-border italic whitespace-pre-wrap">
          {msg.thinking}
        </div>
      )}

      {msg.tools?.map((t) => <ToolCard key={t.id} tool={t} />)}

      {msg.content && <RenderedMarkdown text={msg.content} />}
    </div>
  )
}
