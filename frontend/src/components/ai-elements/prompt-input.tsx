import { type FormHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export function PromptInput({
  children,
  className,
  ...props
}: FormHTMLAttributes<HTMLFormElement>) {
  return (
    <form
      className={cn(
        "grid min-w-0 gap-2 bg-surface-900 p-3",
        className,
      )}
      {...props}
    >
      {children}
    </form>
  );
}

export function PromptInputTextarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-[84px] resize-none border-0 bg-transparent p-0 text-sm leading-5 text-zinc-200 placeholder:text-zinc-600 focus:ring-0",
        className,
      )}
      {...props}
    />
  );
}

export function PromptInputToolbar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 items-center justify-between gap-2", className)}>
      {children}
    </div>
  );
}
