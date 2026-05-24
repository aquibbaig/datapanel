import { useEffect, useRef, type HTMLAttributes, type ReactNode } from "react";
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

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, [children]);

  return (
    <div
      className={cn("min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3", className)}
      ref={scrollRef}
    >
      <div className="flex min-w-0 flex-col gap-5">{children}</div>
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
        "self-center rounded-full border border-line bg-surface-800 px-3 py-1 text-xs text-muted transition hover:text-zinc-200",
        className,
      )}
      type="button"
      {...props}
    />
  );
}
