import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from 'react'
import { Streamdown } from 'streamdown'
import { useConversationScroll as useStickToBottomContext } from './Conversation'
import { cjk } from '@streamdown/cjk'
import { createCodePlugin } from '@streamdown/code'
import { math } from '@streamdown/math'
import { mermaid } from '@streamdown/mermaid'
import {
  ChevronRight, ChevronDown, AlertTriangle, Copy, Check,
  Brain, Wrench, ChevronUp, Search, Terminal, FileText,
  Loader2, CheckCircle2, XCircle,
} from 'lucide-react'
import type { ChatMessage, ToolCallInfo } from '../stores/chatStore'

interface Props {
  message: ChatMessage
  previousRole?: ChatMessage['role']
  isStreaming?: boolean
}

const rawCodePlugin = createCodePlugin()
const safeCodePlugin = {
  ...rawCodePlugin,
  highlight(params: Parameters<typeof rawCodePlugin.highlight>[0], callback?: Parameters<typeof rawCodePlugin.highlight>[1]) {
    if (!rawCodePlugin.supportsLanguage(params.language)) return null
    return rawCodePlugin.highlight(params, callback)
  },
}
const streamdownPlugins = { cjk, code: safeCodePlugin, math, mermaid }
const COLLAPSE_HEIGHT = 300
const BUFFER_WORD_THRESHOLD = 40
const BUFFER_MAX_MS = 2500
const CONTEXT_TOOLS = new Set([
  'read', 'readfile', 'read_file',
  'glob', 'grep', 'search', 'search_files', 'find_files',
  'websearch', 'web_search', 'ls', 'list', 'list_files',
])
const SEND_USER_MESSAGE_TOOL = 'sendusermessage'

function isSendUserMessageTool(toolName: string) {
  return toolName.toLowerCase() === SEND_USER_MESSAGE_TOOL
}

function getSendUserMessageText(toolCalls?: ToolCallInfo[]) {
  if (!toolCalls?.length) return ''
  return toolCalls
    .filter((toolCall) => isSendUserMessageTool(toolCall.toolName))
    .map((toolCall) => {
      const message = toolCall.args?.message
      return typeof message === 'string' ? message.trim() : ''
    })
    .filter(Boolean)
    .join('\n\n')
}

function getVisibleToolCalls(toolCalls?: ToolCallInfo[]) {
  return (toolCalls ?? []).filter((toolCall) => !isSendUserMessageTool(toolCall.toolName))
}

export default function MessageBubble({ message, previousRole }: Props) {
  if (message.role === 'user') return <UserMessage message={message} previousRole={previousRole} />
  return <AssistantMessage message={message} />
}

// ── User message ─────────────────────────────────────────────────────

function UserMessage({
  message,
  previousRole,
}: {
  message: ChatMessage
  previousRole?: ChatMessage['role']
}) {
  const [expanded, setExpanded] = useState(false)
  const [overflows, setOverflows] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const { stopScroll } = useStickToBottomContext()
  const hasImages = Boolean(message.images?.length)

  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    requestAnimationFrame(() => {
      setOverflows(el.scrollHeight > COLLAPSE_HEIGHT)
    })
  }, [message.content])

  const imageCount = message.images?.length ?? 0
  const spacingClass = previousRole === 'user' ? 'mt-8 mb-5' : 'mt-6 mb-5'

  return (
    <div className={`flex justify-end ${spacingClass}`}>
      <div className="max-w-[95%] ml-auto">
        <div
          className="rounded-lg overflow-hidden"
          style={{ background: 'var(--user-bubble)', color: 'var(--user-bubble-fg)' }}
        >
          {hasImages && (
            <div className="flex flex-col gap-1 p-1.5">
              {imageCount === 1 ? (
                <img
                  src={`data:${message.images![0].mediaType};base64,${message.images![0].base64}`}
                  alt=""
                  className="rounded-md max-h-80 max-w-full object-contain cursor-pointer hover:opacity-80 transition-opacity"
                  onDoubleClick={() => window.openclaude.invoke('image:preview', message.images![0].base64, message.images![0].mediaType)}
                />
              ) : (
                <div className="grid grid-cols-2 gap-1">
                  {message.images!.map((img, i) => (
                    <img
                      key={i}
                      src={`data:${img.mediaType};base64,${img.base64}`}
                      alt=""
                      className="rounded-md w-full h-36 object-contain cursor-pointer hover:opacity-80 transition-opacity"
                      style={{ background: 'rgba(0,0,0,0.03)' }}
                      onDoubleClick={() => window.openclaude.invoke('image:preview', img.base64, img.mediaType)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
          {message.content && (
            <div className="relative overflow-hidden rounded-lg">
              <div
                ref={contentRef}
                className="px-4 py-3 text-sm whitespace-pre-wrap break-words leading-relaxed overflow-hidden transition-[max-height] duration-300 ease-in-out"
                style={{
                  maxHeight: overflows && !expanded ? `${COLLAPSE_HEIGHT}px` : undefined,
                }}
              >
                {message.content}
              </div>
              {overflows && !expanded && (
                <div className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none"
                  style={{ background: `linear-gradient(to top, var(--user-bubble), transparent)` }} />
              )}
            </div>
          )}
        </div>
        {/* Keep the collapse control outside the fade/clip container. */}
        {overflows && (
          <button onClick={() => {
            const willExpand = !expanded
            setExpanded(willExpand)
            if (willExpand) stopScroll()
          }}
            className="flex items-center gap-1 mt-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            <span>{expanded ? '收起' : '展开'}</span>
          </button>
        )}
      </div>
    </div>
  )
}

// ── Assistant message ────────────────────────────────────────────────

function AssistantMessage({ message }: { message: ChatMessage }) {
  const sendUserMessageText = useMemo(() => getSendUserMessageText(message.toolCalls), [message.toolCalls])
  const visibleToolCalls = useMemo(() => getVisibleToolCalls(message.toolCalls), [message.toolCalls])
  const displayContent = sendUserMessageText || message.content
  const hasThinking = Boolean(message.thinkingContent?.trim())
  const hasTools = visibleToolCalls.length > 0
  const bufferedContent = useBufferedContent(displayContent, Boolean(message.isStreaming))

  if (message.isError) {
    return (
      <div className="flex items-start gap-2 px-3 py-2.5 my-2 rounded-lg text-sm" style={{ background: 'color-mix(in srgb, var(--destructive) 8%, transparent)', color: 'var(--destructive)' }}>
        <AlertTriangle size={15} className="shrink-0 mt-0.5" />
        <span className="whitespace-pre-wrap">{message.content}</span>
      </div>
    )
  }

  if (!message.isStreaming && !displayContent && !hasThinking && !hasTools) return null

  return (
    <div className="group mt-5 mb-3">
      {(hasThinking || hasTools) && (
        <ToolActionsGroup
          toolCalls={visibleToolCalls}
          thinkingContent={message.thinkingContent}
          isStreaming={Boolean(message.isStreaming)}
        />
      )}

      {/* Text content */}
      {bufferedContent && (
        <div className="relative">
          <div className="markdown-body text-[14px] leading-relaxed">
            <MarkdownRenderer text={bufferedContent} isStreaming={Boolean(message.isStreaming)} />
            {message.isStreaming && <StreamingCursor />}
          </div>
          <div className="absolute -top-1 right-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <CopyButton text={displayContent} />
          </div>
        </div>
      )}

      {/* Streaming: no content yet */}
      {message.isStreaming && !bufferedContent && !hasThinking && !hasTools && (
        <ThinkingPhaseLabel />
      )}

      {/* Streaming status bar */}
      {message.isStreaming && hasTools && (
        <StreamingStatusBar toolCalls={visibleToolCalls} />
      )}

      {/* Timestamp on hover */}
      {!message.isStreaming && displayContent && (
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

function useBufferedContent(rawContent: string, isStreaming: boolean): string {
  const [bypassed, setBypassed] = useState(false)
  const timerRef = useRef<number | null>(null)
  const hasStructuredBlock = /```/.test(rawContent)
  const wordCount = rawContent.split(/\s+/).filter(Boolean).length

  useEffect(() => {
    if (!isStreaming || !rawContent) {
      setBypassed(false)
      if (timerRef.current) window.clearTimeout(timerRef.current)
      timerRef.current = null
      return
    }

    if (hasStructuredBlock || wordCount >= BUFFER_WORD_THRESHOLD) {
      setBypassed(true)
      if (timerRef.current) window.clearTimeout(timerRef.current)
      timerRef.current = null
      return
    }

    if (!timerRef.current) {
      timerRef.current = window.setTimeout(() => {
        setBypassed(true)
        timerRef.current = null
      }, BUFFER_MAX_MS)
    }
  }, [hasStructuredBlock, isStreaming, rawContent, wordCount])

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
  }, [])

  if (!isStreaming) return rawContent
  if (!rawContent) return ''
  if (bypassed || hasStructuredBlock || wordCount >= BUFFER_WORD_THRESHOLD) return rawContent
  return ''
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

function ToolActionsGroup({
  toolCalls,
  thinkingContent,
  isStreaming,
}: {
  toolCalls: ToolCallInfo[]
  thinkingContent?: string
  isStreaming?: boolean
}) {
  const [open, setOpen] = useState(false)
  const segments = useMemo(() => computeToolSegments(toolCalls), [toolCalls])
  const runningCount = toolCalls.filter((tc) => tc.status === 'running').length
  const hasTools = toolCalls.length > 0
  const { stopScroll } = useStickToBottomContext()

  if (!hasTools && !thinkingContent) return null
  if (!hasTools && thinkingContent) {
    return (
      <div className="mb-3">
        <ThinkingRow content={thinkingContent} isStreaming={isStreaming} />
      </div>
    )
  }

  return (
    <div className="mb-3">
      <button onClick={() => {
        const willOpen = !open
        setOpen(willOpen)
        if (willOpen) stopScroll()
      }}
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
        <Wrench size={12} />
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        <span>
          {runningCount > 0
            ? <span className="shimmer">Running {runningCount} tool{runningCount > 1 ? 's' : ''}…</span>
            : `Used ${toolCalls.length} tool${toolCalls.length > 1 ? 's' : ''}`}
        </span>
      </button>
      {open && (
        <div className="mt-1.5 space-y-1 ml-1">
          {thinkingContent && <ThinkingRow content={thinkingContent} isStreaming={isStreaming} />}
          {segments.map((segment, index) => segment.kind === 'context'
            ? <ContextToolGroup key={`context-${index}`} toolCalls={segment.toolCalls} />
            : <ToolCallItem key={segment.toolCall.id} toolCall={segment.toolCall} />)}
        </div>
      )}
    </div>
  )
}

function ThinkingRow({ content, isStreaming }: { content: string; isStreaming?: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const { stopScroll } = useStickToBottomContext()

  const summary = useMemo(() => {
    const heading = content.match(/^#{1,4}\s+(.+)$/m)
    if (heading?.[1]) return heading[1]
    const bold = content.match(/\*\*(.+?)\*\*/)
    if (bold?.[1]) return bold[1]
    return isStreaming ? 'Thinking…' : 'Thought'
  }, [content, isStreaming])

  return (
    <div>
      <button onClick={() => {
        const willExpand = !expanded
        setExpanded(willExpand)
        if (willExpand) stopScroll()
      }}
        className="flex w-full items-center gap-2 px-2 py-1 min-h-[28px] text-xs hover:bg-muted/40 rounded-sm transition-colors">
        <Brain size={14} className="shrink-0 text-muted-foreground" />
        {expanded ? <ChevronDown size={11} className="shrink-0 text-muted-foreground/60" /> : <ChevronRight size={11} className="shrink-0 text-muted-foreground/60" />}
        <span className="font-mono text-muted-foreground/70 truncate flex-1 text-left">
          {isStreaming ? <span className="shimmer">{summary}</span> : summary}
        </span>
      </button>
      {expanded && (
        <div className="ml-6 px-2 py-1.5 text-xs rounded-md border"
          style={{ background: 'var(--muted)', borderColor: 'var(--border)' }}>
          <MarkdownRenderer text={content} isStreaming={false} className="markdown-body text-xs leading-relaxed text-muted-foreground" />
        </div>
      )}
    </div>
  )
}

type ToolSegment =
  | { kind: 'context'; toolCalls: ToolCallInfo[] }
  | { kind: 'single'; toolCall: ToolCallInfo }

function computeToolSegments(toolCalls: ToolCallInfo[]): ToolSegment[] {
  const segments: ToolSegment[] = []
  let buffer: ToolCallInfo[] = []

  const flush = () => {
    if (buffer.length >= 3) {
      segments.push({ kind: 'context', toolCalls: buffer })
    } else {
      for (const toolCall of buffer) segments.push({ kind: 'single', toolCall })
    }
    buffer = []
  }

  for (const toolCall of toolCalls) {
    if (CONTEXT_TOOLS.has(toolCall.toolName.toLowerCase())) {
      buffer.push(toolCall)
    } else {
      flush()
      segments.push({ kind: 'single', toolCall })
    }
  }
  flush()
  return segments
}

function ContextToolGroup({ toolCalls }: { toolCalls: ToolCallInfo[] }) {
  const [expanded, setExpanded] = useState(false)
  const hasRunning = toolCalls.some((toolCall) => toolCall.status === 'running')
  const { stopScroll } = useStickToBottomContext()

  return (
    <div>
      <button onClick={() => {
        const willExpand = !expanded
        setExpanded(willExpand)
        if (willExpand) stopScroll()
      }}
        className="flex w-full items-center gap-2 px-2 py-1 min-h-[28px] text-xs hover:bg-muted/40 rounded-sm transition-colors">
        <Search size={14} className="shrink-0 text-muted-foreground" />
        {expanded ? <ChevronDown size={11} className="shrink-0 text-muted-foreground/60" /> : <ChevronRight size={11} className="shrink-0 text-muted-foreground/60" />}
        <span className="font-medium text-muted-foreground">
          {hasRunning ? `Gathering context (${toolCalls.length})` : `Gathered context (${toolCalls.length})`}
        </span>
      </button>
      {expanded && (
        <div className="ml-6 border-l-2 pl-2 space-y-1" style={{ borderColor: 'var(--border)' }}>
          {toolCalls.map((toolCall) => <ToolCallItem key={toolCall.id} toolCall={toolCall} nested />)}
        </div>
      )}
    </div>
  )
}

function ToolCallItem({ toolCall, nested = false }: { toolCall: ToolCallInfo; nested?: boolean }) {
  return <ToolCallItemInner toolCall={toolCall} nested={nested} />
}

function ToolCallItemInner({ toolCall, nested }: { toolCall: ToolCallInfo; nested: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const statusColor = toolCall.status === 'running' ? 'var(--warning)' : toolCall.status === 'completed' ? 'var(--success)' : 'var(--destructive)'
  const command = toolCall.args?.command && typeof toolCall.args.command === 'string' ? toolCall.args.command : ''
  const path = getToolPath(toolCall.args)
  const pattern = getToolPattern(toolCall.args)
  const duration = toolCall.completedAt && toolCall.startedAt ? ((toolCall.completedAt - toolCall.startedAt) / 1000).toFixed(1) : null
  const summary = getToolSummary(toolCall, command, path, pattern)
  const Icon = getToolIcon(toolCall.toolName)
  const canExpand = Boolean(toolCall.args || toolCall.result)
  const { stopScroll } = useStickToBottomContext()

  return (
    <div className={nested ? '' : 'rounded-lg border overflow-hidden'} style={nested ? undefined : { background: 'var(--muted)', borderColor: 'var(--border)' }}>
      <button onClick={() => {
        if (!canExpand) return
        const willExpand = !expanded
        setExpanded(willExpand)
        if (willExpand) stopScroll()
      }}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/40 transition-colors">
        <Icon size={14} className="shrink-0" style={{ color: 'var(--muted-fg)' }} />
        <span className="font-medium shrink-0" style={{ color: 'var(--primary)' }}>{toolCall.toolName}</span>
        <span className="truncate font-mono min-w-0 flex-1 text-left text-muted-foreground">{summary}</span>
        {toolCall.status === 'running' && <Loader2 size={13} className="shrink-0 animate-spin" style={{ color: statusColor }} />}
        {toolCall.status === 'completed' && <CheckCircle2 size={13} className="shrink-0" style={{ color: statusColor }} />}
        {toolCall.status === 'error' && <XCircle size={13} className="shrink-0" style={{ color: statusColor }} />}
        {duration && <span className="text-muted-foreground shrink-0">{duration}s</span>}
        {canExpand && (expanded ? <ChevronDown size={11} className="text-muted-foreground shrink-0" /> : <ChevronRight size={11} className="text-muted-foreground shrink-0" />)}
      </button>
      {expanded && canExpand && (
        <div className="px-3 pb-2 text-xs space-y-1.5 border-t pt-1.5" style={{ borderColor: 'var(--border)' }}>
          {toolCall.args && <pre className="rounded p-2 overflow-x-auto text-muted-foreground whitespace-pre-wrap" style={{ background: 'var(--bg)' }}>{JSON.stringify(toolCall.args, null, 2)}</pre>}
          {toolCall.result && <pre className="rounded p-2 overflow-x-auto text-muted-foreground whitespace-pre-wrap max-h-56" style={{ background: 'var(--bg)' }}>{toolCall.result}</pre>}
        </div>
      )}
    </div>
  )
}

// ── Markdown renderer ────────────────────────────────────────────────

function getToolIcon(toolName: string) {
  const lower = toolName.toLowerCase()
  if (['bash', 'shell', 'execute', 'run'].includes(lower)) return Terminal
  if (CONTEXT_TOOLS.has(lower)) return Search
  if (['write', 'edit', 'writefile', 'create_file', 'notebookedit'].includes(lower)) return FileText
  if (getToolSummaryByPathType(lower)) return FileText
  return Wrench
}

function getToolSummaryByPathType(toolName: string): boolean {
  return ['read', 'readfile', 'write', 'edit', 'writefile', 'create_file', 'glob', 'grep', 'search'].includes(toolName)
}

function getToolPath(args?: Record<string, unknown>) {
  if (!args) return ''
  const candidate = args.path ?? args.file_path ?? args.filePath
  return typeof candidate === 'string' ? candidate : ''
}

function getToolPattern(args?: Record<string, unknown>) {
  if (!args) return ''
  const candidate = args.pattern ?? args.query ?? args.glob
  return typeof candidate === 'string' ? candidate : ''
}

function getToolSummary(toolCall: ToolCallInfo, command: string, path: string, pattern: string) {
  if (command) return `$ ${truncateMiddle(command, 80)}`
  if (pattern) return truncateMiddle(pattern, 80)
  if (path) return truncateMiddle(path, 80)
  return toolCall.toolName
}

function truncateMiddle(value: string, maxLength: number) {
  if (value.length <= maxLength) return value
  const head = Math.ceil((maxLength - 1) / 2)
  const tail = Math.floor((maxLength - 1) / 2)
  return `${value.slice(0, head)}…${value.slice(value.length - tail)}`
}

function MarkdownLink({ href, children, ...props }: ComponentProps<'a'> & { node?: unknown }) {
  return (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        event.preventDefault()
        if (href) void window.openclaude.invoke('shell:openExternal', href)
      }}
      className="cursor-pointer"
    >
      {children}
    </a>
  )
}

function MarkdownRenderer({
  text,
  isStreaming,
  className,
}: {
  text: string
  isStreaming: boolean
  className?: string
}) {
  return (
    <Streamdown
      mode={isStreaming ? 'streaming' : 'static'}
      plugins={streamdownPlugins}
      controls={false}
      animated={false}
      className={className}
      components={{ a: MarkdownLink }}
    >
      {text}
    </Streamdown>
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
