import { useState } from 'react'
import { ChevronDown, ChevronRight, Wrench } from 'lucide-react'
import type { ToolCall } from '../stores/chatStore'

export function ToolCard({ tool }: { tool: ToolCall }) {
  const [open, setOpen] = useState(false)

  const inputPreview = Object.entries(tool.input)
    .map(([k, v]) => {
      const s = typeof v === 'string' ? v : JSON.stringify(v)
      return `${k}: ${s.length > 60 ? s.slice(0, 60) + '…' : s}`
    })
    .join(', ')

  return (
    <div className="border border-border rounded-lg overflow-hidden my-1.5 bg-surface-light/50">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-400 hover:bg-surface-lighter/60 transition-colors"
      >
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <Wrench size={13} className="text-accent-light shrink-0" />
        <span className="font-medium text-zinc-300">{tool.name}</span>
        {!open && <span className="truncate ml-1 text-zinc-500">{inputPreview}</span>}
      </button>

      {open && (
        <div className="px-3 pb-2.5 text-xs space-y-2">
          <div>
            <div className="text-zinc-500 mb-0.5">Input</div>
            <pre className="bg-surface/70 rounded p-2 overflow-x-auto text-zinc-400 whitespace-pre-wrap">
              {JSON.stringify(tool.input, null, 2)}
            </pre>
          </div>
          {tool.result && (
            <div>
              <div className="text-zinc-500 mb-0.5">Result</div>
              <pre className="bg-surface/70 rounded p-2 overflow-x-auto text-zinc-400 whitespace-pre-wrap max-h-64">
                {tool.result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
