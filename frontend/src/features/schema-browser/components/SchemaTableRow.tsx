import { Loader2, Table2, View } from "lucide-react";
import { cn } from "../../../lib/cn";
import type { TableDetails, TableSummary } from "../../../lib/types";

interface Props {
  active: boolean;
  loading: boolean;
  table: TableSummary;
  onInspectTable(table: TableSummary): Promise<TableDetails | null>;
}

export function SchemaTableRow({
  active,
  loading,
  table,
  onInspectTable,
}: Props) {
  const tableType = tableTypeDisplay(table.type);
  const TypeIcon = tableType.icon;

  return (
    <div className="pl-5 pr-1">
      <div
        className={cn(
          "relative flex h-8 w-full items-center rounded-md transition",
          active
            ? "bg-selection text-selection-foreground"
            : "text-zinc-500 hover:bg-selection-hover hover:text-zinc-200",
        )}
      >
        <button
          className="flex min-w-0 flex-1 items-center gap-2 self-stretch rounded-md px-2 text-left text-sm"
          onClick={() => void onInspectTable(table)}
          title={`Inspect ${table.schema}.${table.name}`}
          type="button"
        >
          <TypeIcon
            className={cn("shrink-0", tableType.iconClassName)}
            size={14}
          />
          <span className="min-w-0 flex-1 truncate">{table.name}</span>
        </button>
        <span
          className="mr-2 w-12 shrink-0 truncate whitespace-nowrap text-right text-[11px] text-muted"
          title={tableType.title}
        >
          {tableType.label}
        </span>
        {loading ? (
          <Loader2
            aria-label="Loading table metadata"
            className="mr-2 animate-spin text-zinc-300"
            size={14}
          />
        ) : null}
      </div>
    </div>
  );
}

function tableTypeDisplay(type: string) {
  const normalized = type.trim().toUpperCase();
  if (normalized === "MATERIALIZED VIEW") {
    return {
      icon: View,
      iconClassName: "text-zinc-500",
      label: "VIEW",
      title: "MATERIALIZED VIEW",
    };
  }
  if (normalized.includes("VIEW")) {
    return {
      icon: View,
      iconClassName: "text-zinc-500",
      label: "VIEW",
      title: normalized,
    };
  }
  return {
    icon: Table2,
    iconClassName: "",
    label: normalized.replace(/^BASE\s+/, "") || "TABLE",
    title: normalized || "TABLE",
  };
}
