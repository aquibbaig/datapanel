import { textInputBehaviorProps } from "../../../lib/text-input";
import type { ChangeSummary } from "../types";

export function ChangeReviewPanel({
  generatedSQL,
  pendingChanges,
}: {
  generatedSQL: string;
  pendingChanges: ChangeSummary;
}) {
  return (
    <aside className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)_minmax(120px,36%)] border-l border-line bg-surface-950">
      <div className="border-b border-line p-3">
        <div className="mb-2 text-sm font-medium text-zinc-200">
          Changed rows
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <div className="text-lg font-semibold text-zinc-100">
              {pendingChanges.rows}
            </div>
            <div className="text-muted">rows</div>
          </div>
          <div>
            <div className="text-lg font-semibold text-zinc-100">
              {pendingChanges.cells}
            </div>
            <div className="text-muted">cells</div>
          </div>
        </div>
      </div>

      <div className="min-h-0 overflow-auto border-b border-line p-3">
        <div className="flex flex-col gap-2">
          {pendingChanges.items.map((item) => (
            <div
              className="rounded-ui border border-line bg-surface-900 p-2 text-xs"
              key={item.rowKey}
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="font-medium text-zinc-200">
                  {item.kind === "delete"
                    ? "Delete"
                    : item.kind === "insert"
                      ? "Insert"
                      : "Update"}
                </span>
                <code className="truncate text-muted">{item.label}</code>
              </div>
              <div className="truncate text-muted">
                {item.columns.join(", ")}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid min-h-0 grid-rows-[28px_minmax(0,1fr)] p-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-zinc-200">
            SQL preview
          </span>
          <span className="text-xs text-muted">
            {generatedSQL ? "ready" : "empty"}
          </span>
        </div>
        <textarea
          {...textInputBehaviorProps}
          className="min-h-0 resize-none rounded-ui border-line bg-background p-2 text-xs text-zinc-300"
          readOnly
          value={generatedSQL}
        />
      </div>
    </aside>
  );
}
