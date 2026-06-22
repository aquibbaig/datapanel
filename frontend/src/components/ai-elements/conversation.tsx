import { ArrowDown } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { cn } from "../../lib/cn";

export function Conversation({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", className)}>
      {children}
    </div>
  );
}

export function ConversationContent({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedToBottomRef = useRef(true);
  const [showScrollButton, setShowScrollButton] = useState(false);

  function scrollToBottom(behavior: ScrollBehavior = "smooth") {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior });
  }

  function updatePinnedState() {
    const element = scrollRef.current;
    if (!element) return;
    const distanceFromBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight;
    const pinned = distanceFromBottom < 72;
    pinnedToBottomRef.current = pinned;
    setShowScrollButton(!pinned);
  }

  useEffect(() => {
    if (pinnedToBottomRef.current) {
      scrollToBottom("auto");
    } else {
      updatePinnedState();
    }
  }, [children]);

  return (
    <div className="relative min-h-0 flex-1">
      <div
        className={cn("h-full min-h-0 overflow-y-auto overflow-x-hidden p-3", className)}
        onScroll={updatePinnedState}
        ref={scrollRef}
      >
        <div className="flex min-w-0 flex-col gap-5">{children}</div>
      </div>
      {showScrollButton ? (
        <ConversationScrollButton
          className="absolute bottom-3 left-1/2 -translate-x-1/2 shadow-xl"
          onClick={() => scrollToBottom()}
        >
          <ArrowDown size={12} />
          Scroll to bottom
        </ConversationScrollButton>
      ) : null}
    </div>
  );
}

export function ConversationEmpty({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid h-full place-items-center text-center", className)}>
      {children}
    </div>
  );
}

export function ConversationScrollButton({
  className,
  ...props
}: HTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "inline-flex items-center gap-1.5 self-center rounded-full border border-line bg-surface-800 px-3 py-1 text-xs text-muted transition hover:text-zinc-200",
        className,
      )}
      type="button"
      {...props}
    />
  );
}
