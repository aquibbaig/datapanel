import { CheckCircle2, Clock3, Database, FileQuestion, Play, XCircle } from "lucide-react";
import { Button } from "../components/ui/Button";
import { cn } from "../lib/cn";
import type { QueryHistoryEntry } from "../lib/types";

export type RightPanel = "ai" | "history" | "panels";

export function RightActionPanel({
  panel,
  activeProfileName,
  queryHistory,
  onUseQuery,
}: {
  panel: RightPanel;
  activeProfileName?: string;
  queryHistory: QueryHistoryEntry[];
  onUseQuery(sql: string): void;
}) {
  const titles = {
    ai: "AI assistant",
    history: "Query history",
    panels: "Panels",
  };

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <Database size={14} className="text-muted" />
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">
            {titles[panel]}
          </h2>
          <p className="text-xs text-muted">
            {activeProfileName || "No active connection"}
          </p>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-ui border border-line bg-surface-850 p-3 text-sm text-muted">
        {panel === "ai"
          ? "AI schema assistance will appear here once providers are configured."
          : null}
        {panel === "history" ? (
          <QueryHistoryList items={queryHistory} onUseQuery={onUseQuery} />
        ) : null}
        {panel === "panels"
          ? "Panel controls for schema, results, and assistant views will appear here."
          : null}
      </div>
    </div>
  );
}

function QueryHistoryList({
  items,
  onUseQuery,
}: {
  items: QueryHistoryEntry[];
  onUseQuery(sql: string): void;
}) {
  if (items.length === 0) {
    return (
      <div className="grid h-full place-items-center text-center text-xs text-muted">
        Typed queries you run will appear here.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-2 overflow-auto pr-1">
      {items.map((item) => (
        <button
          key={item.id}
          className="group rounded-ui border border-line bg-surface-900 p-2 text-left transition hover:border-zinc-600 hover:bg-surface-800"
          onClick={() => onUseQuery(item.sql)}
          title="Load query into editor"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium uppercase text-zinc-400">
              {item.mode === "explain" ? <FileQuestion size={12} /> : <Play size={12} />}
              {item.mode === "explain" ? "Explain" : "Query"}
            </span>
            {item.success ? (
              <CheckCircle2 size={12} className="text-green-300" />
            ) : (
              <XCircle size={12} className="text-red-300" />
            )}
          </div>
          <pre className="line-clamp-3 whitespace-pre-wrap break-words font-mono text-[11px] leading-4 text-zinc-200">
            {item.sql}
          </pre>
          <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted">
            <span className="flex items-center gap-1">
              <Clock3 size={11} />
              {formatTime(item.executedAt)}
            </span>
            <span
              className={cn(
                item.success ? "text-zinc-400" : "text-red-200",
                "truncate",
              )}
            >
              {item.success
                ? `${item.rowCount} rows / ${item.affectedRows} affected / ${item.durationMs}ms`
                : item.error || "Failed"}
            </span>
          </div>
        </button>
      ))}
      <Button className="mt-1 w-full" onClick={() => onUseQuery(items[0].sql)}>
        Load latest query
      </Button>
    </div>
  );
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
