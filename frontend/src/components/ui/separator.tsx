import { cn } from "../../lib/cn";

interface Props {
  orientation?: "horizontal" | "vertical";
  className?: string;
}

export function Separator({ orientation = "horizontal", className }: Props) {
  return (
    <div
      className={cn(
        orientation === "vertical" ? "h-4 w-px bg-line" : "h-px w-full bg-line",
        className,
      )}
    />
  );
}

