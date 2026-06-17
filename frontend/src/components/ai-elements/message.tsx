import { type ReactNode } from "react";
import { cn } from "../../lib/cn";

export function Message({
  children,
  from,
}: {
  children: ReactNode;
  from: "assistant" | "user";
}) {
  return (
    <div
      className={cn(
        "flex min-w-0",
        from === "user" ? "justify-end" : "justify-start",
      )}
    >
      <div
        className={cn(
          "max-w-[92%] min-w-0 rounded-ui border px-3 py-2",
          from === "user"
            ? "border-accent/50 bg-accent/20 text-zinc-100"
            : "border-line bg-surface-900 text-zinc-200",
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function MessageContent({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 whitespace-pre-wrap break-words text-sm leading-5", className)}>
      {children}
    </div>
  );
}
