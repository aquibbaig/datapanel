import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "../../lib/cn";

export function Breadcrumb({ children }: { children: ReactNode }) {
  return <nav aria-label="Breadcrumb">{children}</nav>;
}

export function BreadcrumbList({ children }: { children: ReactNode }) {
  return <ol className="flex items-center gap-1.5 text-sm text-muted">{children}</ol>;
}

export function BreadcrumbItem({ children, className }: { children: ReactNode; className?: string }) {
  return <li className={cn("flex items-center", className)}>{children}</li>;
}

export function BreadcrumbLink({ children }: { children: ReactNode }) {
  return <span className="font-medium text-zinc-400">{children}</span>;
}

export function BreadcrumbPage({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-zinc-100">{children}</span>;
}

export function BreadcrumbSeparator({ className }: { className?: string }) {
  return (
    <li className={cn("flex items-center text-zinc-600", className)}>
      <ChevronRight size={14} />
    </li>
  );
}

