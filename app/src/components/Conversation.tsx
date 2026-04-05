import type { ComponentProps } from 'react'
import { useCallback } from 'react'
import { ArrowDown } from 'lucide-react'
import { StickToBottom, useStickToBottomContext } from 'use-stick-to-bottom'

function joinClasses(...classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(' ')
}

export type ConversationProps = ComponentProps<typeof StickToBottom>

export function Conversation({ className, ...props }: ConversationProps) {
  return (
    <StickToBottom
      className={joinClasses('relative flex-1 overflow-y-hidden', className)}
      initial="smooth"
      resize="instant"
      role="log"
      {...props}
    />
  )
}

export type ConversationContentProps = ComponentProps<typeof StickToBottom.Content>

export function ConversationContent({ className, ...props }: ConversationContentProps) {
  return (
    <StickToBottom.Content
      className={joinClasses('flex flex-col', className)}
      {...props}
    />
  )
}

export function ConversationScrollButton() {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext()

  const handleScrollToBottom = useCallback(() => {
    void scrollToBottom()
  }, [scrollToBottom])

  if (isAtBottom) return null

  return (
    <button
      type="button"
      onClick={handleScrollToBottom}
      className="absolute bottom-4 left-1/2 z-10 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border shadow-sm transition-colors hover:bg-muted"
      style={{
        background: 'var(--bg)',
        borderColor: 'var(--border)',
        color: 'var(--muted-fg)',
      }}
      title="Scroll to bottom"
    >
      <ArrowDown size={16} />
    </button>
  )
}
