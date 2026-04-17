import type { ComponentProps } from 'react'
import { useCallback, useEffect, useRef } from 'react'
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

// During streaming, content resizes rapidly. The library's own scroll handler
// swallows scroll events whenever a resize just happened (to avoid feedback
// loops), which makes it miss user-initiated upward scrolls on macOS trackpads
// and yank the viewport back to the bottom. This guard watches wheel + scroll
// events directly on the scroll container and explicitly calls `stopScroll()`
// the moment it detects the user moving upward, so auto-follow pauses
// immediately. When the user scrolls back to the bottom, the library re-engages
// sticky mode on its own.
function UserScrollGuard() {
  const { scrollRef, stopScroll } = useStickToBottomContext()
  const lastScrollTopRef = useRef<number | null>(null)

  useEffect(() => {
    let attached = false
    let rafId: number | null = null
    let attachedElement: HTMLElement | null = null
    let detachHandlers: (() => void) | null = null

    const attach = () => {
      if (attached) return
      const element = scrollRef.current
      if (!element) {
        rafId = window.requestAnimationFrame(attach)
        return
      }

      attached = true
      attachedElement = element
      lastScrollTopRef.current = element.scrollTop

      const handleWheel = (event: WheelEvent) => {
        if (event.deltaY < 0) stopScroll()
      }

      const handleTouchMove = () => {
        const current = element.scrollTop
        const previous = lastScrollTopRef.current
        if (previous != null && current < previous - 1) stopScroll()
        lastScrollTopRef.current = current
      }

      const handleScroll = () => {
        const current = element.scrollTop
        const previous = lastScrollTopRef.current
        lastScrollTopRef.current = current
        if (previous == null) return
        if (current < previous - 1) stopScroll()
      }

      element.addEventListener('wheel', handleWheel, { passive: true })
      element.addEventListener('touchmove', handleTouchMove, { passive: true })
      element.addEventListener('scroll', handleScroll, { passive: true })

      detachHandlers = () => {
        element.removeEventListener('wheel', handleWheel)
        element.removeEventListener('touchmove', handleTouchMove)
        element.removeEventListener('scroll', handleScroll)
      }
    }

    attach()

    return () => {
      if (rafId != null) window.cancelAnimationFrame(rafId)
      detachHandlers?.()
      attachedElement = null
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
