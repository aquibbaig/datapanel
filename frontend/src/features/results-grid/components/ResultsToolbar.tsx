import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  Check,
  ChevronDown,
  Download,
  FileJson,
  FileSpreadsheet,
  Minus,
  Plus,
  RotateCcw,
  Search,
} from "lucide-react";
import { Button } from "../../../components/ui/Button";
import type { QueryResult } from "../../../lib/types";
import type { ChangeSummary } from "../types";

export function ResultsToolbar({
  affectedRows,
  canAddRow,
  canDeleteSelectedRows,
  deleteButtonTitle,
  durationMs,
  editUnavailableTitle,
  exportResult,
  mutationEnabled,
  pendingChanges,
  rowCount,
  saving,
  selectedRowCount,
  truncated,
  visibleColumnCount,
  onAddRow,
  onCommitChanges,
  onDeleteSelectedRows,
  onDiscardChanges,
  onExportCSV,
  onExportJSON,
  onOpenFinder,
}: {
  affectedRows: number;
  canAddRow: boolean;
  canDeleteSelectedRows: boolean;
  deleteButtonTitle: string;
  durationMs: number;
  editUnavailableTitle?: string;
  exportResult: QueryResult | null;
  mutationEnabled: boolean;
  pendingChanges: ChangeSummary;
  rowCount: number;
  saving: boolean;
  selectedRowCount: number;
  truncated: boolean;
  visibleColumnCount: number;
  onAddRow(): void;
  onCommitChanges(): void;
  onDeleteSelectedRows(): void;
  onDiscardChanges(): void;
  onExportCSV(result: QueryResult): void | Promise<void>;
  onExportJSON(result: QueryResult): void | Promise<void>;
  onOpenFinder(): void;
}) {
  return (
    <div className="flex h-8 items-center justify-between gap-4 border-b border-line px-2 text-xs text-zinc-300">
      <div className="flex min-w-0 items-center gap-4">
        <span>{rowCount} rows</span>
        {selectedRowCount > 0 ? <span>{selectedRowCount} selected</span> : null}
        <span>{affectedRows} affected</span>
        <span>{durationMs}ms</span>
        {mutationEnabled ? <span>{pendingChanges.total} pending</span> : null}
        {truncated ? (
          <span className="rounded border border-warning/35 bg-warning/10 px-1.5 py-0.5 font-medium text-warning">
            truncated
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-1">
        <Button
          aria-label="Find columns or cells"
          onClick={onOpenFinder}
          size="icon"
          className="!h-6 !w-6 border-line bg-control/[0.04] text-zinc-500 hover:bg-control/[0.08] hover:text-zinc-100"
          title="Find columns or cells"
          type="button"
        >
          <Search size={13} />
        </Button>
        <Button
          aria-label="Add row"
          disabled={!canAddRow}
          onClick={onAddRow}
          size="icon"
          className="!h-6 !w-6 border-line bg-control/[0.04] text-zinc-500 hover:bg-control/[0.08] hover:text-zinc-100"
          title={editUnavailableTitle || "Add row"}
          type="button"
        >
          <Plus size={13} />
        </Button>
        <Button
          aria-label="Delete selected row"
          disabled={!canDeleteSelectedRows}
          onClick={onDeleteSelectedRows}
          size="icon"
          className="!h-6 !w-6 border-line bg-control/[0.04] text-zinc-500 hover:bg-control/[0.08] hover:text-zinc-100"
          title={deleteButtonTitle}
          type="button"
        >
          <Minus size={13} />
        </Button>
        {pendingChanges.total > 0 ? (
          <>
            <Button
              aria-label="Discard changes"
              disabled={saving}
              onClick={onDiscardChanges}
              size="icon"
              className="!h-5"
              type="button"
            >
              <RotateCcw size={13} />
            </Button>
            <Button
              aria-label="Save changes"
              disabled={saving}
              onClick={onCommitChanges}
              size="icon"
              variant="primary"
              className="!h-5"
              type="button"
            >
              <Check size={13} />
            </Button>
          </>
        ) : null}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              className="inline-flex h-6 items-center justify-center gap-1.5 rounded-md border border-transparent bg-transparent px-2 text-xs font-medium text-zinc-500 transition hover:bg-surface-700 hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-65 [&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:shrink-0"
              disabled={visibleColumnCount === 0 || !exportResult}
              title={
                selectedRowCount > 0
                  ? "Export selected rows"
                  : "Export results"
              }
              type="button"
            >
              <Download size={13} />
              {selectedRowCount > 0 ? "Export selected as" : "Export as"}
              <ChevronDown size={12} />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              className="z-[1000] min-w-36 overflow-hidden rounded-ui border border-line bg-surface-800 py-1 shadow-xl"
              sideOffset={6}
            >
              <DropdownMenu.Item
                className="flex cursor-pointer select-none items-center gap-2 px-2.5 py-1.5 text-xs text-zinc-300 outline-none hover:bg-surface-700 hover:text-zinc-100 data-[highlighted]:bg-surface-700 data-[highlighted]:text-zinc-100"
                onSelect={() => {
                  if (exportResult) void onExportCSV(exportResult);
                }}
              >
                <FileSpreadsheet size={13} />
                CSV
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className="flex cursor-pointer select-none items-center gap-2 px-2.5 py-1.5 text-xs text-zinc-300 outline-none hover:bg-surface-700 hover:text-zinc-100 data-[highlighted]:bg-surface-700 data-[highlighted]:text-zinc-100"
                onSelect={() => {
                  if (exportResult) void onExportJSON(exportResult);
                }}
              >
                <FileJson size={13} />
                JSON
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </div>
  );
}
