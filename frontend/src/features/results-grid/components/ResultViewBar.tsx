import { ArrowDown, ArrowUp, EyeOff, Filter, X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "../../../components/ui/Button";
import type { ResultFilter, ResultSort } from "../types";
import { filterLabel } from "../lib/filters";

export function ResultViewBar({
  filters,
  hiddenColumnCount,
  rowCount,
  sort,
  totalRowCount,
  onClearAll,
  onClearFilter,
  onClearHiddenColumns,
  onClearSort,
}: {
  filters: ResultFilter[];
  hiddenColumnCount: number;
  rowCount: number;
  sort: ResultSort | null;
  totalRowCount: number;
  onClearAll(): void;
  onClearFilter(id: string): void;
  onClearHiddenColumns(): void;
  onClearSort(): void;
}) {
  const active = filters.length > 0 || sort || hiddenColumnCount > 0;
  if (!active) return null;

  return (
    <div className="flex min-h-8 items-center gap-2 border-b border-line bg-surface-950 px-2 py-1.5 text-xs text-zinc-300">
      <span className="shrink-0 text-muted">
        {rowCount === totalRowCount
          ? `${rowCount} rows`
          : `${rowCount}/${totalRowCount} rows`}
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        {filters.map((filter) => (
          <ViewChip key={filter.id} onRemove={() => onClearFilter(filter.id)}>
            <Filter size={12} />
            {filterLabel(filter)}
          </ViewChip>
        ))}
        {sort ? (
          <ViewChip onRemove={onClearSort}>
            {sort.direction === "asc" ? (
              <ArrowUp size={12} />
            ) : (
              <ArrowDown size={12} />
            )}
            {sort.columnName} {sort.direction}
          </ViewChip>
        ) : null}
        {hiddenColumnCount > 0 ? (
          <ViewChip onRemove={onClearHiddenColumns}>
            <EyeOff size={12} />
            {hiddenColumnCount} hidden
          </ViewChip>
        ) : null}
      </div>
      <Button
        aria-label="Reset result view"
        className="!h-6 px-2 text-xs"
        size="row"
        type="button"
        onClick={onClearAll}
      >
        Reset view
      </Button>
    </div>
  );
}

function ViewChip({
  children,
  onRemove,
}: {
  children: ReactNode;
  onRemove(): void;
}) {
  return (
    <span className="inline-flex max-w-72 items-center gap-1.5 rounded-md border border-line bg-control/[0.04] px-2 py-1 text-xs text-zinc-300">
      <span className="flex min-w-0 items-center gap-1.5 truncate">
        {children}
      </span>
      <button
        aria-label="Remove"
        className="-mr-1 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-control/[0.08] hover:text-zinc-100"
        type="button"
        onClick={onRemove}
      >
        <X size={11} />
      </button>
    </span>
  );
}
