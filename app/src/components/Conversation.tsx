import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
  type Ref,
} from 'react'
import { ArrowDown } from 'lucide-react'

// How close (in pixels) to the bottom we treat as "still at the bottom".
// One full streamed chunk can easily push the bottom by ~30-40px before the
// next frame, so we keep this generous enough to feel natural without being
// so wide that an obviously-scrolled-away user gets yanked back.
const STICK_THRESHOLD = 64

type ScrollToBottomOptions = {
  animation?: 'instant' | 'smooth'
  /**
   * When true, the caller is saying "only scroll if the user hasn't already
   * scrolled away from the bottom". This matches the contract we originally
   * relied on from use-stick-to-bottom so existing callers keep working.
   */
  preserveScrollPosition?: boolean
}

export type ConversationScrollContext = {
  scrollRef: MutableRefObject<HTMLDivElement | null>
  scrollToBottom: (opts?: ScrollToBottomOptions) => Promise<boolean>
  stopScroll: () => void
  /**
   * Read-through to the current "at bottom" state. Retained for the imperative
   * contextRef API so App.tsx can still observe it without subscribing. Inside
   * React components, prefer `useConversationIsAtBottom()` — it's the only
   * subscriber that re-renders when the value changes.
   */
  isAtBottom: boolean
}

// The stable half of the context: refs + callbacks that never change across
// a conversation's lifetime. Everything that only needs to call stopScroll /
// scrollToBottom subscribes here and therefore never re-renders when the
// at-bottom indicator flips. That's important during streaming because every
// tool row, every thinking panel, every expandable bubble used to re-render
// on every sticky-state change while the user was trying to scroll.
type StableContext = {
  scrollRef: MutableRefObject<HTMLDivElement | null>
  contentRef: MutableRefObject<HTMLDivElement | null>
  stickyRef: MutableRefObject<boolean>
  scrollToBottom: (opts?: ScrollToBottomOptions) => Promise<boolean>
  stopScroll: () => void
  updateIsAtBottom: (value: boolean) => void
}

const StableCtx = createContext<StableContext | null>(null)
const IsAtBottomCtx = createContext<boolean>(true)

function useStableContext(): StableContext {
  const ctx = useContext(StableCtx)
  if (!ctx) {
    throw new Error(
      'Conversation context missing — did you forget to wrap in <Conversation>?',
    )
  }
  return ctx
}

export function useConversationIsAtBottom(): boolean {
  return useContext(IsAtBottomCtx)
}

export function useConversationScroll(): ConversationScrollContext {
  const stable = useStableContext()
  // Return stable references so consumers that only care about actions (every
  // tool row, thinking row, user bubble collapse button, etc.) do NOT
  // re-render when isAtBottom changes. Consumers that actually need the
  // at-bottom flag should call `useConversationIsAtBottom()` instead. The
  // field is kept on the object purely to preserve the shape for imperative
  // callers (Ref forwarded to App.tsx).
  return useMemo(
    () => ({
      scrollRef: stable.scrollRef,
      scrollToBottom: stable.scrollToBottom,
      stopScroll: stable.stopScroll,
      // Never read during render (we can't subscribe without re-rendering).
      // App.tsx reads it through the imperative contextRef which mirrors the
      // real value via useImperativeHandle below.
      get isAtBottom() {
        return stable.stickyRef.current
      },
    }),
    [stable],
  )
}

export type ConversationProps = {
  className?: string
  children?: ReactNode
  contextRef?: Ref<ConversationScrollContext>
}

export function Conversation({ className = '', children, contextRef }: ConversationProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  // stickyRef is the user's intent — true means "keep me pinned to the bottom
  // as new content arrives". Wheel-up, scrollbar drag, or simply drifting away
  // from the bottom flip this to false. It flips back to true when the user
  // scrolls back within STICK_THRESHOLD of the bottom.
  const stickyRef = useRef(true)
  const [isAtBottom, setIsAtBottom] = useState(true)

  const updateIsAtBottom = useCallback((value: boolean) => {
    setIsAtBottom((prev) => (prev === value ? prev : value))
  }, [])

  const scrollToBottom = useCallback(
    async (opts?: ScrollToBottomOptions): Promise<boolean> => {
      const el = scrollRef.current
      if (!el) return false
      if (opts?.preserveScrollPosition && !stickyRef.current) {
        // The user has drifted away; respect that.
        return false
      }
      const behavior = opts?.animation === 'instant' ? 'auto' : 'smooth'
      el.scrollTo({ top: el.scrollHeight, behavior })
      // An explicit request to go to the bottom counts as re-engaging sticky.
      stickyRef.current = true
      updateIsAtBottom(true)
      return true
    },
    [updateIsAtBottom],
  )

  const stopScroll = useCallback(() => {
    // Legacy callers (e.g. tool-row expand handlers) use this to mean "don't
    // pull me back down now that I did something that might have moved the
    // viewport". Dropping the sticky flag captures that intent.
    stickyRef.current = false
  }, [])

  // The stable context only re-computes when one of its callbacks changes,
  // which is effectively never after the initial mount. This is what lets us
  // put the whole subtree's tool rows behind it without them re-rendering
  // whenever the bottom indicator flips during streaming.
  const stableContext = useMemo<StableContext>(
    () => ({
      scrollRef,
      contentRef,
      stickyRef,
      scrollToBottom,
      stopScroll,
      updateIsAtBottom,
    }),
    [scrollToBottom, stopScroll, updateIsAtBottom],
  )

  useImperativeHandle(
    contextRef,
    () => ({
      scrollRef,
      scrollToBottom,
      stopScroll,
      isAtBottom,
    }),
    [isAtBottom, scrollToBottom, stopScroll],
  )

  return (
    <StableCtx.Provider value={stableContext}>
      <IsAtBottomCtx.Provider value={isAtBottom}>
        <div
          className={`relative flex-1 overflow-y-hidden ${className}`}
          role="log"
        >
          {children}
        </div>
      </IsAtBottomCtx.Provider>
    </StableCtx.Provider>
  )
}

export type ConversationContentProps = {
  className?: string
  children?: ReactNode
}

export function ConversationContent({ className = '', children }: ConversationContentProps) {
  const { scrollRef, contentRef, stickyRef, updateIsAtBottom } = useStableContext()

  useEffect(() => {
    const scrollEl = scrollRef.current
    const contentEl = contentRef.current
    if (!scrollEl || !contentEl) return

    const measureAtBottom = () => {
      const distance = scrollEl.scrollHeight - scrollEl.clientHeight - scrollEl.scrollTop
      return distance <= STICK_THRESHOLD
    }

    const handleScroll = () => {
      const atBottom = measureAtBottom()
      stickyRef.current = atBottom
      updateIsAtBottom(atBottom)
    }

    // Intentionally no auto-follow while content grows during streaming. Every
    // previous attempt to keep the viewport pinned to the bottom while tokens
    // streamed in fought with React rendering and made long replies feel like
    // the whole app locked up, so we leave the viewport exactly where the user
    // put it. We still observe resizes purely to refresh the scroll-to-bottom
    // button visibility (content growing past the threshold reveals it, and
    // hitting the new bottom hides it again).
    const resizeObserver = new ResizeObserver(() => {
      updateIsAtBottom(measureAtBottom())
    })

    scrollEl.addEventListener('scroll', handleScroll, { passive: true })
    resizeObserver.observe(contentEl)

    // Seed initial state so the scroll-to-bottom button renders correctly.
    updateIsAtBottom(measureAtBottom())

    return () => {
      scrollEl.removeEventListener('scroll', handleScroll)
      resizeObserver.disconnect()
    }
  }, [scrollRef, contentRef, stickyRef, updateIsAtBottom])

  return (
    <div ref={scrollRef} className="h-full w-full overflow-y-auto">
      <div ref={contentRef} className={className}>
        {children}
      </div>
    </div>
  )
}

export function ConversationScrollButton() {
  const { scrollToBottom } = useConversationScroll()
  const isAtBottom = useConversationIsAtBottom()
  const handleClick = useCallback(() => {
    void scrollToBottom({ animation: 'smooth' })
  }, [scrollToBottom])

  if (isAtBottom) return null

  return (
    <button
      type="button"
      onClick={handleClick}
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
