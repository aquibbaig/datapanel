import { PanelLeft } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { Button } from "./Button";

export function SidebarProvider({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full bg-surface-800 text-zinc-100">{children}</div>
  );
}

export function SidebarInset({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <main
      className={cn(
        "m-2 ml-0 grid min-w-0 flex-1 overflow-hidden rounded-xl border border-line bg-surface-950",
        className,
      )}
    >
      {children}
    </main>
  );
}

export function SidebarTrigger({ className }: { className?: string }) {
  return (
    <Button className={className} size="icon" title="Toggle sidebar">
      <PanelLeft size={14} />
    </Button>
  );
}
