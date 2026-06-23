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
  const [scrollbarState, setScrollbarState] = useState({
    scrollTop: 0,
    viewportSize: 0,
  });
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
  const totalRowSize = rowVirtualizer.getTotalSize();
  const hasSidebarOverflow =
    scrollbarState.viewportSize > 0 &&
    totalRowSize > scrollbarState.viewportSize;
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
    setFilter("");
  }, [activeConnectionId]);

  useEffect(() => {
    if (!activeConnectionId || visibleTableRows.length === 0) return;
    for (const table of visibleTableRows.slice(0, maxPrefetchTablesPerRange)) {
      void onPrefetchTableDetails(table);
    }
  }, [activeConnectionId, onPrefetchTableDetails, visibleTableKeys, visibleTableRows]);

  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) return undefined;

    const updateScrollbarState = () => {
      setScrollbarState({
        scrollTop: scrollElement.scrollTop,
        viewportSize: scrollElement.clientHeight,
      });
    };

    updateScrollbarState();
    scrollElement.addEventListener("scroll", updateScrollbarState, {
      passive: true,
    });
    const resizeObserver = new ResizeObserver(updateScrollbarState);
    resizeObserver.observe(scrollElement);

    return () => {
      scrollElement.removeEventListener("scroll", updateScrollbarState);
      resizeObserver.disconnect();
    };
  }, [totalRowSize]);

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

      <div className="flex min-h-0 flex-1 flex-col gap-3 py-3 pl-3">
        <label className="relative mr-3 block">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500"
            size={14}
          />
          <input
            className="h-8 rounded-md border-line bg-control/[0.03] pl-8 pr-2 text-sm text-zinc-200 placeholder:text-zinc-600"
            disabled={!activeConnectionId}
            placeholder="Explorer..."
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        </label>

        {!activeConnectionId ? (
          <div className="mr-3 flex items-center gap-2 rounded-ui border border-dashed border-line bg-surface-850 p-3 text-sm text-muted">
            <Database size={14} />
            <p>Choose a workspace above to browse tables.</p>
          </div>
        ) : null}

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_12px]">
          <div
            ref={scrollRef}
            className="datapanel-sidebar-scroll min-h-0 overflow-auto"
          >
            <div
              className="relative w-full"
              style={{ height: totalRowSize }}
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
          <div
            className={cn(
              "pointer-events-none flex min-h-0 justify-center",
              hasSidebarOverflow ? "bg-sidebar/70" : "bg-transparent",
            )}
          >
            {hasSidebarOverflow ? (
              <div
                className="mt-1 w-1 rounded-full bg-scrollbar-thumb"
                style={{
                  height: sidebarScrollbarThumbHeight(
                    totalRowSize,
                    scrollbarState.viewportSize,
                  ),
                  transform: `translateY(${sidebarScrollbarThumbOffset(
                    totalRowSize,
                    scrollbarState.viewportSize,
                    scrollbarState.scrollTop,
                  )}px)`,
                }}
              />
            ) : null}
          </div>
        </div>
      </div>
    </aside>
  );
}

type BrowserRow =
  | { kind: "schema"; key: string; schema: SchemaSummary }
  | {
      kind: "table";
      key: string;
      table: TableSummary;
      firstInSchema: boolean;
    }
  | {
      kind: "column";
      key: string;
      column: TableDetails["columns"][number];
    };

const maxPrefetchTablesPerRange = 36;

function sidebarScrollbarThumbHeight(totalSize: number, viewportSize: number) {
  if (totalSize <= viewportSize || viewportSize <= 0) return 0;
  return Math.max(32, Math.round((viewportSize / totalSize) * viewportSize));
}

function sidebarScrollbarThumbOffset(
  totalSize: number,
  viewportSize: number,
  scrollTop: number,
) {
  if (totalSize <= viewportSize || viewportSize <= 0) return 0;
  const thumbHeight = sidebarScrollbarThumbHeight(totalSize, viewportSize);
  const maxOffset = Math.max(0, viewportSize - thumbHeight - 8);
  const maxScroll = Math.max(1, totalSize - viewportSize);
  return Math.round((scrollTop / maxScroll) * maxOffset);
}

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
    for (const [index, table] of tables.entries()) {
      rows.push({
        kind: "table",
        key: `table:${table.schema}.${table.name}`,
        table,
        firstInSchema: index === 0,
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
  if (row.kind === "schema") return 40;
  if (row.kind === "table" && row.firstInSchema) return 38;
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
      <div className="flex h-10 items-end border-t border-line/60 px-2 text-[11px] font-bold uppercase tracking-wide text-zinc-400">
        <Database className="mr-1.5 text-zinc-600" size={12} />
        <span className="min-w-0 truncate">{row.schema.name}</span>
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
    <div className={cn("pb-0.5 pl-4 pr-1", row.firstInSchema ? "pt-2" : "pt-0.5")}>
      <div className="border-l border-line/70 pl-2">
        <Button
          size="row"
          className={cn(
            "w-full justify-start rounded-md text-left",
            active
              ? "bg-selection text-selection-foreground"
              : "text-zinc-500 hover:bg-selection-hover hover:text-zinc-200",
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

      const schemaMatches = schema.name.toLowerCase().includes(query);
      return {
        schema,
        tables: schemaMatches
          ? tables
          : tables.filter((table) =>
              [schema.name, table.schema, table.name, table.type]
                .join(" ")
                .toLowerCase()
                .includes(query),
            ),
      };
    })
    .filter(
      (entry) =>
        !query ||
        entry.tables.length > 0 ||
        entry.schema.name.toLowerCase().includes(query),
    );
}

function ColumnRow({
  column,
  isForeign,
}: {
  column: TableDetails["columns"][number];
  isForeign: boolean;
}) {
  const displayType = formatDisplayDataType(column.dataType);

  return (
    <div className="ml-12 border-l border-line/70 py-0.5 pl-2">
      <div
        className="grid h-7 w-full grid-cols-[minmax(0,1fr)_minmax(4.75rem,auto)] items-center gap-2 rounded-md px-2 text-left text-xs font-medium text-zinc-400 hover:bg-control/[0.05] hover:text-zinc-100"
        title={`${column.name}: ${displayType}`}
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
