import { memo, useMemo, useState, useRef, useEffect, useCallback } from 'react'
import { Plus, MessageSquare, Trash2, Pin, PinOff, Pencil, Settings, Sun, Moon } from 'lucide-react'
import { useChatStore, type Conversation } from '../stores/chatStore'
import { useSettingsStore } from '../stores/settingsStore'

function getDateGroup(ts: number): string {
  const now = new Date()
  const d = new Date(ts)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const weekAgo = new Date(today.getTime() - 7 * 86400000)
  if (d >= today) return 'Today'
  if (d >= yesterday) return 'Yesterday'
  if (d >= weekAgo) return 'This week'
  return 'Earlier'
}

type GroupedConversations = { label: string; items: Conversation[] }[]

type ConversationRowProps = {
  conv: Conversation
  isActive: boolean
  isStreaming: boolean
  onSwitch: (id: string) => void
  onDelete: (id: string) => void
  onRename: (id: string, title: string) => void
  onTogglePin: (id: string) => void
}

const ConversationRow = memo<ConversationRowProps>(function ConversationRow({
  conv, isActive, isStreaming, onSwitch, onDelete, onRename, onTogglePin,
}: ConversationRowProps) {
  const isPinned = conv.pinned
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(conv.title)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      setDraft(conv.title)
      requestAnimationFrame(() => inputRef.current?.select())
    }
  }, [editing, conv.title])

  const commitRename = useCallback(() => {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== conv.title) {
      onRename(conv.id, trimmed)
    }
    setEditing(false)
  }, [conv.id, conv.title, draft, onRename])

  const startEditing = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setEditing(true)
  }, [])

  return (
    <div
      className="group flex items-center gap-2 px-2.5 py-[7px] rounded-lg cursor-pointer transition-all"
      style={{
        background: isActive ? 'color-mix(in srgb, var(--primary) 10%, transparent)' : undefined,
        color: isActive ? 'var(--fg)' : 'var(--muted-fg)',
      }}
      onClick={() => { if (!editing) onSwitch(conv.id) }}>
      <MessageSquare size={13} className="shrink-0" style={{ opacity: isActive ? 0.7 : 0.4, color: isActive ? 'var(--primary)' : undefined }} />
      {editing ? (
        <input
          ref={inputRef}
          className="text-[13px] flex-1 min-w-0 bg-transparent border-b outline-none"
          style={{ borderColor: 'var(--primary)', color: 'var(--fg)' }}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename()
            if (e.key === 'Escape') setEditing(false)
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="text-[13px] truncate flex-1" onDoubleClick={startEditing}>{conv.title}</span>
      )}
      {!editing && (
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
          <button
            onClick={startEditing}
            className="p-0.5 transition-colors"
            style={{ color: 'var(--muted-fg)' }}
            title="Rename">
            <Pencil size={11} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onTogglePin(conv.id) }}
            className="p-0.5 transition-colors"
            style={{ color: isPinned ? 'var(--primary)' : 'var(--muted-fg)' }}
            title={isPinned ? 'Unpin' : 'Pin'}>
            {isPinned ? <PinOff size={11} /> : <Pin size={11} />}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              if (isStreaming) return
              onDelete(conv.id)
            }}
            disabled={isStreaming}
            className="p-0.5 transition-colors"
            style={{
              color: 'var(--muted-fg)',
              opacity: isStreaming ? 0.35 : undefined,
              cursor: isStreaming ? 'not-allowed' : undefined,
            }}
            title={isStreaming ? 'Stop streaming before deleting' : 'Delete'}>
            <Trash2 size={11} />
          </button>
        </div>
      )}
    </div>
  )
}, (prev, next) =>
  prev.conv.id === next.conv.id
  && prev.conv.title === next.conv.title
  && prev.conv.pinned === next.conv.pinned
  && prev.isActive === next.isActive
  && prev.isStreaming === next.isStreaming
  && prev.onSwitch === next.onSwitch
  && prev.onDelete === next.onDelete
  && prev.onRename === next.onRename
  && prev.onTogglePin === next.onTogglePin,
)

export function Sidebar() {
  const { conversations, activeId, newConversation, switchTo, deleteConversation, renameConversation, togglePin, streamingConversationIds } = useChatStore()
  const { togglePanel, theme, setTheme } = useSettingsStore()

  const pinned = useMemo(() => conversations.filter((c) => c.pinned), [conversations])

  const groups = useMemo<GroupedConversations>(() => {
    const unpinned = conversations.filter((c) => !c.pinned)
    const order = ['Today', 'Yesterday', 'This week', 'Earlier']
    const map = new Map<string, Conversation[]>()
    for (const conv of unpinned) {
      const label = getDateGroup(conv.updatedAt)
      const arr = map.get(label) ?? []
      arr.push(conv)
      map.set(label, arr)
    }
    return order.filter((l) => map.has(l)).map((l) => ({ label: l, items: map.get(l)! }))
  }, [conversations])

  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  const handleDelete = useCallback((conversationId: string) => {
    void window.openclaude.invoke('chat:deleteConversationSession', conversationId).catch(() => undefined)
    deleteConversation(conversationId)
  }, [deleteConversation])

  const renderRow = useCallback((conv: Conversation) => (
    <ConversationRow
      key={conv.id}
      conv={conv}
      isActive={conv.id === activeId}
      isStreaming={streamingConversationIds.includes(conv.id)}
      onSwitch={switchTo}
      onDelete={handleDelete}
      onRename={renameConversation}
      onTogglePin={togglePin}
    />
  ), [activeId, streamingConversationIds, switchTo, handleDelete, renameConversation, togglePin])

  return (
    <aside className="w-[240px] shrink-0 h-full flex flex-col border-r"
      style={{ background: 'var(--sidebar)', borderColor: 'var(--sidebar-border)', backdropFilter: 'blur(16px)' }}>

      {/* Top: traffic lights + New Chat */}
      <div className="flex items-center justify-between px-3 pt-8 pb-2"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <div />
        <button onClick={newConversation} title="New chat"
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-lg transition-colors"
          style={{ WebkitAppRegion: 'no-drag', color: 'var(--fg)', borderColor: 'var(--border)', background: 'var(--muted)' } as React.CSSProperties}>
          <Plus size={13} />
          <span>New Chat</span>
        </button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-2">

        {/* Pinned (Threads) section */}
        {pinned.length > 0 && (
          <div className="mb-1">
            <div className="px-2 pt-2.5 pb-1">
              <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--muted-fg)' }}>Threads</span>
            </div>
            {pinned.map(renderRow)}
          </div>
        )}

        {/* Unpinned conversations grouped by date */}
        {groups.map((group) => (
          <div key={group.label} className="mb-1">
            <div className="px-2 pt-2.5 pb-1">
              <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--muted-fg)' }}>{group.label}</span>
            </div>
            {group.items.map(renderRow)}
          </div>
        ))}
      </div>

      {/* Bottom: Settings + Theme toggle */}
      <div className="shrink-0 px-2 py-2 border-t flex items-center gap-1" style={{ borderColor: 'var(--sidebar-border)' }}>
        <button onClick={togglePanel}
          className="flex-1 flex items-center gap-2 px-2.5 py-[7px] rounded-lg text-[13px] transition-colors"
          style={{ color: 'var(--muted-fg)' }}>
          <Settings size={13} />
          <span>Settings</span>
        </button>
        <button onClick={() => setTheme(isDark ? 'light' : 'dark')}
          className="p-1.5 rounded-lg transition-colors"
          style={{ color: 'var(--muted-fg)' }} title={isDark ? 'Light mode' : 'Dark mode'}>
          {isDark ? <Sun size={14} /> : <Moon size={14} />}
        </button>
      </div>
    </aside>
  )
}
