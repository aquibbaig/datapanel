import { PanelLeft } from "lucide-react";
import type { ReactNode } from "react";
import { createContext, useContext, useState } from "react";
import { cn } from "../../lib/cn";
import { Button } from "./Button";

interface SidebarContextValue {
  open: boolean;
  toggle(): void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(true);

  return (
    <SidebarContext.Provider
      value={{ open, toggle: () => setOpen((current) => !current) }}
    >
      <div className="flex h-full bg-surface-800 text-zinc-100">{children}</div>
    </SidebarContext.Provider>
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
        "m-2 grid min-w-0 mb-2 flex-1 overflow-hidden rounded-xl border border-line bg-surface-950",
        className,
      )}
    >
      {children}
    </main>
  );
}

export function SidebarTrigger({ className }: { className?: string }) {
  const sidebar = useSidebar();

  return (
    <Button
      className={className}
      size="icon"
      onClick={sidebar.toggle}
      title={sidebar.open ? "Collapse sidebar" : "Expand sidebar"}
    >
      <PanelLeft size={14} />
    </Button>
  );
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used inside SidebarProvider");
  }
  return context;
}
