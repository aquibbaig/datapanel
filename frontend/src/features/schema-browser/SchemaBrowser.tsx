import {
  Braces,
  Calendar,
  Columns3,
  Database,
  Hash,
  KeyRound,
  Link2,
  RefreshCw,
  Search,
  Table2,
  ToggleLeft,
  Type,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "../../components/ui/Button";
import { cn } from "../../lib/cn";
import type {
  SchemaSummary,
  TableDetails,
  TableSummary,
} from "../../lib/types";

interface Props {
  activeConnectionId: string;
  schemas: SchemaSummary[];
  tablesBySchema: Record<string, TableSummary[]>;
  selectedTable: TableSummary | null;
  tableDetails: TableDetails | null;
  onRefresh(): Promise<void>;
  onInspectTable(table: TableSummary): Promise<TableDetails | null>;
  onRunTable(table: TableSummary): Promise<void>;
}

export function SchemaBrowser({
  activeConnectionId,
  schemas,
  tablesBySchema,
  selectedTable,
  tableDetails,
  onRefresh,
  onInspectTable,
  onRunTable,
}: Props) {
  const [filter, setFilter] = useState("");
  const filteredSchemas = useMemo(
    () => filterSchemas(schemas, tablesBySchema, filter),
    [filter, schemas, tablesBySchema],
  );

  return (
    <aside className="flex min-h-0 w-full min-w-0 flex-1 flex-col bg-transparent">
      <div className="flex h-12 items-center justify-between border-b border-line px-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
          <Columns3 size={14} />
          Explorer
        </div>
        <Button
          className="text-zinc-500"
          size="icon"
          disabled={!activeConnectionId}
          onClick={() => void onRefresh()}
          title="Refresh metadata"
        >
          <RefreshCw size={14} />
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-3 py-3">
        <label className="relative block">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500"
            size={14}
          />
          <input
            className="h-8 rounded-md border-white/[0.08] bg-white/[0.03] pl-8 pr-2 text-sm text-zinc-200 placeholder:text-zinc-600"
            disabled={!activeConnectionId}
            placeholder="Filter explorer"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        </label>

        {!activeConnectionId ? (
          <div className="flex items-center gap-2 rounded-ui border border-dashed border-line bg-surface-850 p-3 text-sm text-muted">
            <Database size={14} />
            <p>Choose a workspace above to browse tables.</p>
          </div>
        ) : null}

        <div className="flex flex-col gap-4">
          {filteredSchemas.map(({ schema, tables }) => (
            <div className="flex flex-col gap-1.5" key={schema.name}>
              <div className="px-2 text-[11px] font-semibold uppercase text-muted">
                {schema.name}
              </div>
              <div className="flex flex-col gap-1">
                {tables.map((table) => {
                  const active =
                    selectedTable?.schema === table.schema &&
                    selectedTable.name === table.name;
                  return (
                    <div
                      className="flex flex-col gap-2"
                      key={`${table.schema}.${table.name}`}
                    >
                      <Button
                        size="row"
                        className={cn(
                          "w-full justify-start rounded-md text-left",
                          active
                            ? "bg-white/[0.07] text-zinc-100"
                            : "text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200",
                        )}
                        onClick={() => void onInspectTable(table)}
                        onDoubleClick={() => void onRunTable(table)}
                      >
                        <Table2 size={14} />
                        <span className="min-w-0 flex-1 truncate">
                          {table.name}
                        </span>
                        <span className="text-[11px] text-muted">
                          {table.type.replace("BASE ", "")}
                        </span>
                      </Button>
                      {active && tableDetails ? (
                        <ColumnList tableDetails={tableDetails} />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {activeConnectionId && filteredSchemas.length === 0 ? (
            <p className="text-sm text-muted">No matching tables.</p>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

function filterSchemas(
  schemas: SchemaSummary[],
  tablesBySchema: Record<string, TableSummary[]>,
  filter: string,
) {
  const query = filter.trim().toLowerCase();
  return schemas
    .map((schema) => {
      const tables = tablesBySchema[schema.name] || [];
      if (!query) return { schema, tables };

      return {
        schema,
        tables: tables.filter((table) =>
          [schema.name, table.schema, table.name, table.type]
            .join(" ")
            .toLowerCase()
            .includes(query),
        ),
      };
    })
    .filter((entry) => entry.tables.length > 0);
}

function ColumnList({ tableDetails }: { tableDetails: TableDetails }) {
  const foreignKeys = foreignKeyColumns(tableDetails);

  return (
    <div className="ml-6 flex flex-col gap-1 border-l border-white/[0.06] pl-2">
      {tableDetails.columns.map((column) => {
        const isForeign = foreignKeys.has(column.name);
        return (
          <Button
            key={column.name}
            size="row"
            className="w-full justify-between rounded-md text-left text-xs text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-100"
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <ColumnTypeIcon dataType={column.dataType} />
              {column.isPrimary ? (
                <KeyRound
                  className="text-yellow-200"
                  size={8}
                  aria-label="Primary key"
                />
              ) : null}
              {isForeign ? (
                <Link2
                  className="text-sky-200"
                  size={8}
                  aria-label="Foreign key"
                />
              ) : null}
              <span className="min-w-0 truncate">{column.name}</span>
            </span>
            <code className="text-[11px] text-muted">{column.dataType}</code>
          </Button>
        );
      })}
    </div>
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

function foreignKeyColumns(tableDetails: TableDetails) {
  const columns = new Set<string>();
  for (const constraint of tableDetails.constraints) {
    if (constraint.type.toUpperCase() !== "FOREIGN KEY") continue;
    const match = constraint.definition.match(/FOREIGN KEY\s*\(([^)]+)\)/i);
    if (!match) continue;
    for (const column of match[1].split(",")) {
      columns.add(column.trim().replace(/^["`[]|["`\]]$/g, ""));
    }
  }
  return columns;
}
