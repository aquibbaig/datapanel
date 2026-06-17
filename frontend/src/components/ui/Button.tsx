import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "default" | "icon" | "tab" | "row";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

const variants: Record<Variant, string> = {
  primary:
    "border-accent bg-accent text-accent-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] hover:bg-accent-hover",
  secondary:
    "border-line bg-control/[0.04] text-zinc-200 hover:bg-control/[0.07]",
  ghost:
    "border-transparent bg-transparent text-zinc-500 hover:bg-control/[0.06] hover:text-zinc-200",
  danger: "border-red-400/40 bg-red-500/15 text-red-100 hover:bg-red-500/25",
};

const sizes: Record<Size, string> = {
  default: "h-7 px-3",
  icon: "h-7 w-7 rounded-md px-0",
  tab: "h-[38px] px-4",
  row: "h-7 px-2",
};

export function Button({
  className,
  variant,
  size = "default",
  children,
  ...props
}: Props) {
  const resolvedVariant =
    variant ?? (size === "icon" || size === "row" ? "ghost" : "secondary");

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md border text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-65 [&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:shrink-0",
        variants[resolvedVariant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
