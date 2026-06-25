import {
  Braces,
  Calendar,
  Hash,
  KeyRound,
  Link2,
  ToggleLeft,
  Type,
} from "lucide-react";
import type { TableDetails } from "../../../lib/types";

interface Props {
  column: TableDetails["columns"][number];
  isForeign: boolean;
}

export function SchemaColumnRow({ column, isForeign }: Props) {
  const displayType = formatDisplayDataType(column.dataType);

  return (
    <div className="ml-8 border-l border-line/70 pl-2 pr-1">
      <div
        className="grid h-8 w-full grid-cols-[minmax(0,1fr)_minmax(4.75rem,auto)] items-center gap-2 rounded-md px-2 text-left text-[13px] font-medium text-zinc-400 hover:bg-control/[0.035] hover:text-zinc-100"
        title={`${column.name}: ${displayType}`}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <ColumnTypeIcon dataType={column.dataType} />
          {column.isPrimary ? (
            <KeyRound
              aria-label="Primary key"
              className="text-key"
              size={8}
            />
          ) : null}
          {isForeign ? (
            <Link2
              aria-label="Foreign key"
              className="text-muted"
              size={8}
            />
          ) : null}
          <span className="min-w-0 truncate">{column.name.trim()}</span>
        </span>
        <code className="min-w-0 truncate text-right text-[11px] text-muted">
          {displayType}
        </code>
      </div>
    </div>
  );
}

function formatDisplayDataType(dataType: string) {
  return dataType
    .replace(/^character varying(\s*\([^)]*\))?/i, "varchar$1")
    .replace(/^timestamp(\s*\([^)]*\))?\s+with\s+time\s+zone$/i, "timestamptz$1")
    .replace(
      /^timestamp(\s*\([^)]*\))?\s+without\s+time\s+zone$/i,
      "timestamp$1",
    );
}

function ColumnTypeIcon({ dataType }: { dataType: string }) {
  const normalized = dataType.toLowerCase();
  if (
    /\b(int|serial|decimal|numeric|float|double|real|bit)\b/.test(normalized)
  ) {
    return <Hash className="text-zinc-500" size={12} />;
  }
  if (/\b(bool|boolean|tinyint\(1\))\b/.test(normalized)) {
    return <ToggleLeft className="text-zinc-500" size={12} />;
  }
  if (/\b(date|time|timestamp|year)\b/.test(normalized)) {
    return <Calendar className="text-zinc-500" size={12} />;
  }
  if (/\b(json|jsonb|array)\b/.test(normalized)) {
    return <Braces className="text-zinc-500" size={12} />;
  }
  return <Type className="text-zinc-500" size={12} />;
}
