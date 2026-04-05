import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import {
  ChevronRight, ChevronDown, AlertTriangle, Copy, Check,
  Brain, Wrench, ChevronUp,
} from 'lucide-react'
import type { ChatMessage, ToolCallInfo } from '../stores/chatStore'

interface Props { message: ChatMessage; isStreaming?: boolean }

export default function MessageBubble({ message }: Props) {
  if (message.role === 'user') return <UserMessage message={message} />
  return <AssistantMessage message={message} />
}

// ── User message ─────────────────────────────────────────────────────

const COLLAPSE_HEIGHT = 300

function UserMessage({ message }: { message: ChatMessage }) {
  const [expanded, setExpanded] = useState(false)
  const [overflows, setOverflows] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (ref.current) setOverflows(ref.current.scrollHeight > COLLAPSE_HEIGHT)
  }, [message.content])

  return (
    <div className="flex justify-end mt-6 mb-2">
      <div className="relative max-w-[85%]">
        <div
          ref={ref}
          className="rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed overflow-hidden transition-[max-height] duration-300"
          style={{
            background: 'var(--user-bubble)',
            color: 'var(--user-bubble-fg)',
            maxHeight: overflows && !expanded ? COLLAPSE_HEIGHT : undefined,
          }}
        >
          {message.content}
        </div>
        {overflows && !expanded && (
          <div className="absolute bottom-0 left-0 right-0 h-16 rounded-b-2xl pointer-events-none"
            style={{ background: `linear-gradient(to top, var(--user-bubble), transparent)` }} />
        )}
        {overflows && (
          <button onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 mt-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            <span>{expanded ? 'Collapse' : 'Expand'}</span>
          </button>
        )}
      </div>
    </div>
  )
}

// ── Assistant message ────────────────────────────────────────────────

function AssistantMessage({ message }: { message: ChatMessage }) {
  const [thinkingOpen, setThinkingOpen] = useState(false)
  const hasThinking = Boolean(message.thinkingContent?.trim())
  const hasTools = Boolean(message.toolCalls?.length)

  if (message.isError) {
    return (
      <div className="flex items-start gap-2 px-3 py-2.5 my-2 rounded-lg text-sm" style={{ background: 'color-mix(in srgb, var(--destructive) 8%, transparent)', color: 'var(--destructive)' }}>
        <AlertTriangle size={15} className="shrink-0 mt-0.5" />
        <span className="whitespace-pre-wrap">{message.content}</span>
      </div>
    )
  }

  return (
    <div className="group my-3">
      {/* Thinking */}
      {hasThinking && (
        <div className="mb-2">
          <button onClick={() => setThinkingOpen(!thinkingOpen)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <Brain size={12} />
            {thinkingOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            <span className="italic">Thinking…</span>
          </button>
          {thinkingOpen && (
            <div className="mt-1.5 text-xs italic rounded-lg p-3 border whitespace-pre-wrap max-h-64 overflow-y-auto leading-relaxed"
              style={{ background: 'var(--muted)', color: 'var(--muted-fg)', borderColor: 'var(--border)' }}>
              {message.thinkingContent}
            </div>
          )}
        </div>
      )}

      {/* Tool calls */}
      {hasTools && <ToolCallGroup toolCalls={message.toolCalls!} />}

      {/* Text content */}
      {message.content && (
        <div className="relative">
          <div className="markdown-body text-[14px] leading-relaxed">
            <MarkdownRenderer text={message.content} />
            {message.isStreaming && <StreamingCursor />}
          </div>
          <div className="absolute -top-1 right-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <CopyButton text={message.content} />
          </div>
        </div>
      )}

      {/* Streaming: no content yet */}
      {message.isStreaming && !message.content && !hasThinking && !hasTools && (
        <ThinkingPhaseLabel />
      )}

      {/* Streaming status bar */}
      {message.isStreaming && hasTools && (
        <StreamingStatusBar toolCalls={message.toolCalls!} />
      )}

      {/* Timestamp on hover */}
      {!message.isStreaming && message.content && (
        <div className="mt-1 opacity-0 group-hover:opacity-100 transition-opacity text-[11px] text-muted-foreground">
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      )}
    </div>
  )
}

// ── Thinking phase label (evolves over time) ─────────────────────────

function ThinkingPhaseLabel() {
  const [phase, setPhase] = useState(0)

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 5000)
    const t2 = setTimeout(() => setPhase(2), 15000)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  const text = phase === 0 ? 'Thinking…' : phase === 1 ? 'Thinking deeply…' : 'Preparing response…'

  return (
    <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
      <span className="shimmer">{text}</span>
    </div>
  )
}

// ── Streaming status bar ─────────────────────────────────────────────

function StreamingStatusBar({ toolCalls }: { toolCalls: ToolCallInfo[] }) {
  const [elapsed, setElapsed] = useState(0)
  const running = toolCalls.filter((tc) => tc.status === 'running')

  useEffect(() => {
    if (running.length === 0) return
    const start = running[running.length - 1].startedAt
    const interval = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(interval)
  }, [running])

  if (running.length === 0) return null

  const last = running[running.length - 1]
  const command = (last.toolName === 'Bash' || last.toolName === 'bash') && last.args
    ? ((last.args as Record<string, string>).command ?? '')
    : ''
  const label = command
    ? `Running: ${command.length > 50 ? command.slice(0, 50) + '…' : command}`
    : `Running ${last.toolName}…`

  const isWarning = elapsed >= 60
  const isCritical = elapsed >= 90

  return (
    <div className="flex items-center gap-3 py-1.5 text-xs text-muted-foreground">
      <span className={`shimmer ${isCritical ? '!text-[var(--destructive)]' : isWarning ? '!text-[var(--warning)]' : ''}`}>
        {label}
      </span>
      <span style={{ color: 'var(--border)' }}>|</span>
      <span className="tabular-nums">{elapsed >= 60 ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s` : `${elapsed}s`}</span>
      {isWarning && !isCritical && <span className="text-[10px]" style={{ color: 'var(--warning)' }}>Running longer than usual</span>}
      {isCritical && <span className="text-[10px]" style={{ color: 'var(--destructive)' }}>Tool may be stuck</span>}
    </div>
  )
}

// ── Tool call group ──────────────────────────────────────────────────

function ToolCallGroup({ toolCalls }: { toolCalls: ToolCallInfo[] }) {
  const [open, setOpen] = useState(false)
  const allDone = toolCalls.every((tc) => tc.status !== 'running')
  const runningCount = toolCalls.filter((tc) => tc.status === 'running').length

  return (
    <div className="mb-3">
      <button onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
        <Wrench size={12} />
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        <span>
          {allDone ? `Used ${toolCalls.length} tool${toolCalls.length > 1 ? 's' : ''}` : <span className="shimmer">Running {runningCount} tool{runningCount > 1 ? 's' : ''}…</span>}
        </span>
      </button>
      {open && (
        <div className="mt-1.5 space-y-1 ml-1">
          {toolCalls.map((tc) => <ToolCallItem key={tc.id} toolCall={tc} />)}
        </div>
      )}
    </div>
  )
}

function ToolCallItem({ toolCall }: { toolCall: ToolCallInfo }) {
  const [expanded, setExpanded] = useState(false)
  const statusColor = toolCall.status === 'running' ? 'var(--warning)' : toolCall.status === 'completed' ? 'var(--success)' : 'var(--destructive)'
  const statusIcon = toolCall.status === 'running' ? '⏳' : toolCall.status === 'completed' ? '✓' : '✗'

  const command = (toolCall.toolName === 'Bash' || toolCall.toolName === 'bash') && toolCall.args
    ? ((toolCall.args as Record<string, string>).command ?? '') : ''
  const filePath = !command && toolCall.args
    ? ((toolCall.args as Record<string, string>).path ?? (toolCall.args as Record<string, string>).file_path ?? '') : ''
  const subtitle = command ? `$ ${command}` : filePath || ''
  const duration = toolCall.completedAt && toolCall.startedAt ? ((toolCall.completedAt - toolCall.startedAt) / 1000).toFixed(1) : null

  return (
    <div className="rounded-lg border overflow-hidden" style={{ background: 'var(--muted)', borderColor: 'var(--border)' }}>
      <button onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:opacity-80 transition-opacity">
        <span style={{ color: statusColor }}>{statusIcon}</span>
        <span className="font-mono font-medium" style={{ color: 'var(--primary)' }}>{toolCall.toolName}</span>
        {subtitle && <span className="text-muted-foreground truncate font-mono min-w-0 flex-1 text-left">{subtitle.length > 60 ? subtitle.slice(0, 60) + '…' : subtitle}</span>}
        {toolCall.status === 'running' && <span className="shimmer ml-auto shrink-0">running…</span>}
        {duration && <span className="text-muted-foreground ml-auto shrink-0">{duration}s</span>}
        {expanded ? <ChevronDown size={11} className="text-muted-foreground shrink-0" /> : <ChevronRight size={11} className="text-muted-foreground shrink-0" />}
      </button>
      {expanded && (
        <div className="px-3 pb-2 text-xs space-y-1.5 border-t pt-1.5" style={{ borderColor: 'var(--border)' }}>
          {toolCall.args && <pre className="rounded p-2 overflow-x-auto text-muted-foreground whitespace-pre-wrap" style={{ background: 'var(--bg)' }}>{JSON.stringify(toolCall.args, null, 2)}</pre>}
          {toolCall.result && <pre className="rounded p-2 overflow-x-auto text-muted-foreground whitespace-pre-wrap max-h-48" style={{ background: 'var(--bg)' }}>{toolCall.result}</pre>}
        </div>
      )}
    </div>
  )
}

// ── Markdown renderer ────────────────────────────────────────────────

function MarkdownRenderer({ text }: { text: string }) {
  return (
    <ReactMarkdown rehypePlugins={[rehypeHighlight]}
      components={{
        pre({ children }) { return <div className="relative group/code my-3">{children}</div> },
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '')
          const codeStr = String(children).replace(/\n$/, '')
          const isBlock = match || codeStr.includes('\n')
          if (isBlock) {
            const lang = match?.[1] || ''
            return <CodeBlockWithCopy code={codeStr} lang={lang} collapsible={codeStr.split('\n').length > 20} />
          }
          return <code {...props}>{children}</code>
        },
        a({ href, children }) {
          return (
            <a href={href} onClick={(e) => { e.preventDefault(); if (href) window.openclaude.invoke('shell:openExternal', href) }}
              className="cursor-pointer">{children}</a>
          )
        },
      }}>
      {text}
    </ReactMarkdown>
  )
}

// ── Code block ───────────────────────────────────────────────────────

function CodeBlockWithCopy({ code, lang, collapsible }: { code: string; lang: string; collapsible: boolean }) {
  const [copied, setCopied] = useState(false)
  const [expanded, setExpanded] = useState(!collapsible)
  const lines = code.split('\n')
  const displayCode = expanded ? code : lines.slice(0, 15).join('\n')

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [code])

  return (
    <div className="rounded-lg border overflow-hidden my-3" style={{ borderColor: 'var(--code-border)' }}>
      <div className="flex items-center justify-between px-3 py-1.5 border-b text-[11px]"
        style={{ background: 'var(--code-header)', borderColor: 'var(--code-border)' }}>
        <span className="font-mono uppercase text-muted-foreground">{lang || 'text'}</span>
        <button onClick={handleCopy} className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors">
          {copied ? <Check size={12} style={{ color: 'var(--success)' }} /> : <Copy size={12} />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <div className="overflow-x-auto relative">
        <ReactMarkdown rehypePlugins={[rehypeHighlight]}>{`\`\`\`${lang}\n${displayCode}\n\`\`\``}</ReactMarkdown>
        {collapsible && !expanded && (
          <div className="absolute bottom-0 left-0 right-0 h-12 pointer-events-none"
            style={{ background: `linear-gradient(to top, var(--code-bg), transparent)` }} />
        )}
      </div>
      {collapsible && (
        <button onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[11px] text-muted-foreground hover:text-foreground border-t transition-colors"
          style={{ background: 'var(--code-header)', borderColor: 'var(--code-border)' }}>
          {expanded ? <><ChevronUp size={11} /><span>Collapse</span></> : <><ChevronDown size={11} /><span>Expand all {lines.length} lines</span></>}
        </button>
      )}
    </div>
  )
}

// ── Utilities ────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [text])
  return (
    <button onClick={handleCopy} className="p-1 rounded-md border text-muted-foreground hover:text-foreground transition-colors"
      style={{ background: 'var(--muted)', borderColor: 'var(--border)' }} title="Copy">
      {copied ? <Check size={13} style={{ color: 'var(--success)' }} /> : <Copy size={13} />}
    </button>
  )
}

function StreamingCursor() {
  return <span className="inline-block w-2 h-4 ml-0.5 align-text-bottom rounded-sm animate-pulse" style={{ background: 'var(--primary)' }} />
}
