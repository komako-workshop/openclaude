import type { ComponentProps } from 'react'
import { useCallback, useEffect } from 'react'
import { ArrowDown } from 'lucide-react'
import { StickToBottom, useStickToBottomContext } from 'use-stick-to-bottom'

function joinClasses(...classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(' ')
}

export type ConversationProps = ComponentProps<typeof StickToBottom>

export function Conversation({ className, children, ...props }: ConversationProps) {
  const renderChildren: ConversationProps['children'] =
    typeof children === 'function'
      ? (ctx) => (
          <>
            <UserScrollGuard />
            {children(ctx)}
          </>
        )
      : (
          <>
            <UserScrollGuard />
            {children}
          </>
        )

  return (
    <StickToBottom
      className={joinClasses('relative flex-1 overflow-y-hidden', className)}
      initial="smooth"
      resize="instant"
      role="log"
      {...props}
    >
      {renderChildren}
    </StickToBottom>
  )
}

// The library already pauses auto-follow on wheel-up, but the behaviour can be
// flaky when content is resizing rapidly during streaming. Listen for wheel
// events directly and call `stopScroll()` on any upward intent. `wheel` is a
// user-only signal (the library's own smooth-scroll animation never emits it),
// so this handler runs infrequently and cannot create a feedback loop with the
// ongoing resize-driven auto-scroll. We intentionally avoid listening to plain
// `scroll` events here — those fire on every animation tick during streaming
// and layering our own logic on top of them is what caused the whole chat view
// to freeze.
function UserScrollGuard() {
  const { scrollRef, stopScroll } = useStickToBottomContext()

  useEffect(() => {
    let rafId: number | null = null
    let detach: (() => void) | null = null

    const attach = () => {
      const element = scrollRef.current
      if (!element) {
        rafId = window.requestAnimationFrame(attach)
        return
      }

      const handleWheel = (event: WheelEvent) => {
        if (event.deltaY < 0) stopScroll()
      }

      element.addEventListener('wheel', handleWheel, { passive: true })
      detach = () => element.removeEventListener('wheel', handleWheel)
    }

    attach()

    return () => {
      if (rafId != null) window.cancelAnimationFrame(rafId)
      detach?.()
    }
  }, [scrollRef, stopScroll])

  return null
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
