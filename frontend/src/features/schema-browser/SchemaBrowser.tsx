import {
  Braces,
  Calendar,
  Database,
  Hash,
  KeyRound,
  Link2,
  Loader2,
  Search,
  Table2,
  ToggleLeft,
  Type,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Button } from "../../components/ui/Button";
import { cn } from "../../lib/cn";
import type {
  SchemaSummary,
  TableDetails,
  TableSummary,
} from "../../lib/types";

interface Props {
  activeConnectionId: string;
  inspectingTable: TableSummary | null;
  schemas: SchemaSummary[];
  tablesBySchema: Record<string, TableSummary[]>;
  selectedTable: TableSummary | null;
  tableDetails: TableDetails | null;
  onRefresh(): Promise<void>;
  onInspectTable(table: TableSummary): Promise<TableDetails | null>;
  onPrefetchTableDetails(table: TableSummary): Promise<void>;
}

export function SchemaBrowser({
  activeConnectionId,
  inspectingTable,
  schemas,
  tablesBySchema,
  selectedTable,
  tableDetails,
  onRefresh,
  onInspectTable,
  onPrefetchTableDetails,
}: Props) {
  const [filter, setFilter] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const filteredSchemas = useMemo(
    () => filterSchemas(schemas, tablesBySchema, filter),
    [filter, schemas, tablesBySchema],
  );
  const rows = useMemo(
    () =>
      buildBrowserRows({
        filteredSchemas,
        selectedTable,
        tableDetails,
      }),
    [filteredSchemas, selectedTable, tableDetails],
  );
  const selectedForeignKeys = useMemo(
    () => (tableDetails ? foreignKeyColumns(tableDetails) : new Set<string>()),
    [tableDetails],
  );
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => estimatedRowHeight(rows[index]),
    overscan: 14,
  });
  const virtualItems = rowVirtualizer.getVirtualItems();
  const virtualRowIndexes = virtualItems.map((item) => item.index);
  const virtualRowIndexKey = virtualRowIndexes.join("|");
  const visibleTableRows = useMemo(
    () => visibleTables(rows, virtualRowIndexes),
    [rows, virtualRowIndexKey],
  );
  const visibleTableKeys = useMemo(
    () =>
      visibleTableRows
        .map((table) => `${table.schema}.${table.name}`)
        .join("|"),
    [visibleTableRows],
  );

  useEffect(() => {
    if (!activeConnectionId || visibleTableRows.length === 0) return;
    for (const table of visibleTableRows.slice(0, maxPrefetchTablesPerRange)) {
      void onPrefetchTableDetails(table);
    }
  }, [activeConnectionId, onPrefetchTableDetails, visibleTableKeys, visibleTableRows]);

  return (
    <aside className="flex min-h-0 w-full min-w-0 flex-1 flex-col bg-transparent">
      {/* <div className="flex h-12 items-center justify-between px-3">
        <Button
          className="text-zinc-500"
          size="icon"
          disabled={!activeConnectionId}
          onClick={() => void onRefresh()}
          title="Refresh metadata"
        >
          <RefreshCw size={14} />
        </Button>
      </div> */}

      <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 py-3">
        <label className="relative block">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500"
            size={14}
          />
          <input
            className="h-8 rounded-md border-white/[0.08] bg-white/[0.03] pl-8 pr-2 text-sm text-zinc-200 placeholder:text-zinc-600"
            disabled={!activeConnectionId}
            placeholder="Explorer..."
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

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
          <div
            className="relative w-full"
            style={{ height: rowVirtualizer.getTotalSize() }}
          >
            {virtualItems.map((virtualRow) => {
              const row = rows[virtualRow.index];
              return (
                <div
                  key={row.key}
                  className="absolute left-0 top-0 w-full"
                  style={{
                    height: virtualRow.size,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <BrowserRow
                    row={row}
                    selectedForeignKeys={selectedForeignKeys}
                    inspectingTable={inspectingTable}
                    selectedTable={selectedTable}
                    onInspectTable={onInspectTable}
                  />
                </div>
              );
            })}
          </div>
          {activeConnectionId && filteredSchemas.length === 0 ? (
            <p className="text-sm text-muted">No matching tables.</p>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

type BrowserRow =
  | { kind: "schema"; key: string; schema: SchemaSummary }
  | { kind: "table"; key: string; table: TableSummary }
  | {
      kind: "column";
      key: string;
      column: TableDetails["columns"][number];
    };

const maxPrefetchTablesPerRange = 36;

function buildBrowserRows({
  filteredSchemas,
  selectedTable,
  tableDetails,
}: {
  filteredSchemas: Array<{ schema: SchemaSummary; tables: TableSummary[] }>;
  selectedTable: TableSummary | null;
  tableDetails: TableDetails | null;
}) {
  const rows: BrowserRow[] = [];
  for (const { schema, tables } of filteredSchemas) {
    rows.push({ kind: "schema", key: `schema:${schema.name}`, schema });
    for (const table of tables) {
      rows.push({
        kind: "table",
        key: `table:${table.schema}.${table.name}`,
        table,
      });
      if (
        selectedTable?.schema === table.schema &&
        selectedTable.name === table.name &&
        tableDetails
      ) {
        for (const column of tableDetails.columns) {
          rows.push({
            kind: "column",
            key: `column:${table.schema}.${table.name}.${column.name}`,
            column,
          });
        }
      }
    }
  }
  return rows;
}

function estimatedRowHeight(row: BrowserRow | undefined) {
  if (!row) return 32;
  if (row.kind === "schema") return 28;
  return 32;
}

function visibleTables(rows: BrowserRow[], indexes: number[]) {
  const seen = new Set<string>();
  const tables: TableSummary[] = [];
  for (const index of indexes) {
    const row = rows[index];
    if (row?.kind !== "table") continue;
    const key = `${row.table.schema}.${row.table.name}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tables.push(row.table);
  }
  return tables;
}

function BrowserRow({
  row,
  selectedForeignKeys,
  inspectingTable,
  selectedTable,
  onInspectTable,
}: {
  row: BrowserRow;
  selectedForeignKeys: Set<string>;
  inspectingTable: TableSummary | null;
  selectedTable: TableSummary | null;
  onInspectTable(table: TableSummary): Promise<TableDetails | null>;
}) {
  if (row.kind === "schema") {
    return (
      <div className="flex h-7 items-center px-2 text-[11px] font-semibold uppercase text-muted">
        {row.schema.name}
      </div>
    );
  }

  if (row.kind === "column") {
    return (
      <ColumnRow
        column={row.column}
        isForeign={selectedForeignKeys.has(row.column.name)}
      />
    );
  }

  const table = row.table;
  const active =
    selectedTable?.schema === table.schema && selectedTable.name === table.name;
  const loading =
    inspectingTable?.schema === table.schema &&
    inspectingTable.name === table.name;

  return (
    <div className="py-0.5">
      <Button
        size="row"
        className={cn(
          "w-full justify-start rounded-md text-left",
          active
            ? "bg-white/[0.07] text-zinc-100"
            : "text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200",
        )}
        onClick={() => void onInspectTable(table)}
      >
        <Table2 size={14} />
        <span className="min-w-0 flex-1 truncate">{table.name}</span>
        <span className="text-[11px] text-muted">
          {table.type.replace("BASE ", "")}
        </span>
        {loading ? (
          <Loader2
            aria-label="Loading table metadata"
            className="animate-spin text-zinc-300"
            size={14}
          />
        ) : null}
      </Button>
    </div>
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

function ColumnRow({
  column,
  isForeign,
}: {
  column: TableDetails["columns"][number];
  isForeign: boolean;
}) {
  return (
    <div className="ml-6 border-l border-white/[0.06] py-0.5 pl-2">
      <Button
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
