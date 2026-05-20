import { Database } from "lucide-react";

export type RightPanel = "ai" | "history" | "panels";

export function RightActionPanel({
  panel,
  activeProfileName,
}: {
  panel: RightPanel;
  activeProfileName?: string;
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
      <div className="rounded-xl border border-line bg-surface-850 p-3 text-sm text-muted">
        {panel === "ai"
          ? "AI schema assistance will appear here once providers are configured."
          : null}
        {panel === "history" ? "Recent query executions will appear here." : null}
        {panel === "panels"
          ? "Panel controls for schema, results, and assistant views will appear here."
          : null}
      </div>
    </div>
  );
}
