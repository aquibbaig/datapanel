import { BookOpen, Database, Loader2, Plus } from "lucide-react";
import { Button } from "../components/ui/Button";

export function WorkspaceLoader() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center bg-surface-900 text-muted">
      <div className="flex items-center gap-2 text-sm">
        <Loader2 size={14} className="animate-spin" />
        Loading workspace
      </div>
    </div>
  );
}

export function WorkspaceSwitchOverlay({
  workspaceName,
}: {
  workspaceName: string;
}) {
  return (
    <div
      aria-live="polite"
      aria-busy="true"
      className="fixed inset-0 z-[60] overflow-hidden bg-black/55 text-zinc-200 backdrop-blur-[2px]"
      role="status"
    >
      <div className="datapanel-workspace-sweep absolute inset-y-0 w-[38%] border-r border-white/[0.08] bg-white/[0.035]" />
      <div className="absolute left-0 right-0 top-0 h-px bg-white/[0.08]" />
      <div className="datapanel-workspace-progress absolute left-0 top-0 h-px w-1/3 bg-accent" />
      <div className="flex h-full items-center justify-center">
        <div className="datapanel-workspace-panel flex min-w-[260px] items-center gap-3 rounded-ui border border-white/[0.08] bg-surface-850/95 px-4 py-3 shadow-2xl">
          <Loader2 className="animate-spin text-zinc-100" size={18} />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-zinc-100">
              Switching workspace
            </span>
            <span className="block max-w-[220px] truncate text-xs text-muted">
              {workspaceName}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

export function EmptyWorkspace({
  onCreateConnection,
}: {
  onCreateConnection(): void;
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center bg-surface-900 px-6">
      <div className="w-full max-w-[420px]">
        <div className="mb-8 grid w-[104px] grid-cols-2 gap-2">
          {[0, 1, 2, 3].map((index) => (
            <div
              key={index}
              className="grid h-12 w-12 place-items-center rounded-full border border-zinc-500/40 bg-surface-850 shadow-[inset_0_0_0_2px_rgba(255,255,255,0.06),0_0_0_1px_rgba(255,255,255,0.04)]"
            >
              <Database size={28} className="text-zinc-300" strokeWidth={1.6} />
            </div>
          ))}
        </div>

        <h2 className="text-xl font-semibold tracking-[-0.01em] text-zinc-100">
          No database selected
        </h2>
        <p className="mt-4 text-base leading-7 text-muted">
          Select a connection from the sidebar or create a new database
          connection to browse tables, inspect schemas, and run SQL queries.
        </p>

        <div className="mt-8 flex items-center gap-2">
          <Button variant="primary" onClick={onCreateConnection}>
            <Plus size={14} />
            Create connection
          </Button>
          <Button variant="secondary">
            <BookOpen size={14} />
            Documentation
          </Button>
        </div>
      </div>
    </div>
  );
}
