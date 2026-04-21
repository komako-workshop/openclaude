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
  isAtBottom: boolean
}

type InternalContext = ConversationScrollContext & {
  contentRef: MutableRefObject<HTMLDivElement | null>
  stickyRef: MutableRefObject<boolean>
  updateIsAtBottom: (value: boolean) => void
}

const Ctx = createContext<InternalContext | null>(null)

function useInternalContext(): InternalContext {
  const ctx = useContext(Ctx)
  if (!ctx) {
    throw new Error(
      'Conversation context missing — did you forget to wrap in <Conversation>?',
    )
  }
  return ctx
}

export function useConversationScroll(): ConversationScrollContext {
  const ctx = useInternalContext()
  return useMemo(
    () => ({
      scrollRef: ctx.scrollRef,
      scrollToBottom: ctx.scrollToBottom,
      stopScroll: ctx.stopScroll,
      isAtBottom: ctx.isAtBottom,
    }),
    [ctx.isAtBottom, ctx.scrollRef, ctx.scrollToBottom, ctx.stopScroll],
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

  const context = useMemo<InternalContext>(
    () => ({
      scrollRef,
      contentRef,
      stickyRef,
      scrollToBottom,
      stopScroll,
      isAtBottom,
      updateIsAtBottom,
    }),
    [isAtBottom, scrollToBottom, stopScroll, updateIsAtBottom],
  )

  useImperativeHandle(contextRef, () => context, [context])

  return (
    <Ctx.Provider value={context}>
      <div
        className={`relative flex-1 overflow-y-hidden ${className}`}
        role="log"
      >
        {children}
      </div>
    </Ctx.Provider>
  )
}

export type ConversationContentProps = {
  className?: string
  children?: ReactNode
}

export function ConversationContent({ className = '', children }: ConversationContentProps) {
  const { scrollRef, contentRef, stickyRef, updateIsAtBottom } = useInternalContext()

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
  const { isAtBottom, scrollToBottom } = useConversationScroll()
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
