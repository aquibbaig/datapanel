import { cn } from "../../../lib/cn";

export function DisclosureTriangle({
  expanded,
  className,
}: {
  expanded: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "h-0 w-0 shrink-0 border-y-4 border-l-[6px] border-y-transparent border-l-zinc-600 transition-transform",
        expanded ? "rotate-90" : "rotate-0",
        className,
      )}
    />
  );
}
