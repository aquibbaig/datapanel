import { Database, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "../../lib/cn";
import { textInputBehaviorProps } from "../../lib/text-input";
import { DisclosureTriangle } from "./components/DisclosureTriangle";
import { SchemaColumnRow } from "./components/SchemaColumnRow";
import { SchemaTableRow } from "./components/SchemaTableRow";
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
  const [expandedSchemaKeys, setExpandedSchemaKeys] = useState<Set<string>>(
    () => new Set([schemaKey("public")]),
  );
  const orderedSchemas = useMemo(() => orderSchemas(schemas), [schemas]);
  const schemaNamesKey = useMemo(
    () => orderedSchemas.map((schema) => schema.name).join("|"),
    [orderedSchemas],
  );
  const filteredSchemas = useMemo(
    () => filterSchemas(orderedSchemas, tablesBySchema, filter),
    [filter, orderedSchemas, tablesBySchema],
  );
  const rows = useMemo(
    () =>
      buildBrowserRows({
        expandedSchemaKeys,
        filteredSchemas,
        filter,
        selectedTable,
        tableDetails,
      }),
    [expandedSchemaKeys, filter, filteredSchemas, selectedTable, tableDetails],
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
    setExpandedSchemaKeys(defaultExpandedSchemaKeys(orderedSchemas));
  }, [activeConnectionId, orderedSchemas, schemaNamesKey]);

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

      <div className="flex min-h-0 flex-1 flex-col gap-3 pb-3 pt-2 pl-3">
        <label className="relative mr-3 block">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500"
            size={14}
          />
          <input
            {...textInputBehaviorProps}
            className="h-8 rounded-md border-line bg-control/[0.03] pl-8 pr-2 text-sm text-zinc-200 placeholder:text-zinc-600"
            disabled={!activeConnectionId}
            placeholder="Explorer..."
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        </label>

        {!activeConnectionId ? (
          <div className="mx-3 flex items-center gap-2 rounded-ui border border-dashed border-line bg-surface-850 p-3 text-sm text-muted">
            <Database size={14} />
            <p>Choose a connection above to browse tables.</p>
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
                      onToggleSchema={(schemaName) =>
                        setExpandedSchemaKeys((current) =>
                          toggleSchemaExpansion(current, schemaName),
                        )
                      }
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
  | {
      kind: "schema";
      key: string;
      schema: SchemaSummary;
      expanded: boolean;
      tableCount: number;
    }
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

function orderSchemas(schemas: SchemaSummary[]) {
  return schemas
    .map((schema, index) => ({ schema, index }))
    .sort((left, right) => {
      const leftIsPublic = schemaKey(left.schema.name) === schemaKey("public");
      const rightIsPublic = schemaKey(right.schema.name) === schemaKey("public");
      if (leftIsPublic && !rightIsPublic) return -1;
      if (!leftIsPublic && rightIsPublic) return 1;
      return left.index - right.index;
    })
    .map(({ schema }) => schema);
}

function defaultExpandedSchemaKeys(schemas: SchemaSummary[]) {
  const publicSchema = schemas.find(
    (schema) => schemaKey(schema.name) === schemaKey("public"),
  );
  return new Set([schemaKey(publicSchema?.name || "public")]);
}

function toggleSchemaExpansion(current: Set<string>, schemaName: string) {
  const next = new Set(current);
  const key = schemaKey(schemaName);
  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }
  return next;
}

function schemaKey(schemaName: string) {
  return schemaName.toLowerCase();
}

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
  expandedSchemaKeys,
  filteredSchemas,
  filter,
  selectedTable,
  tableDetails,
}: {
  expandedSchemaKeys: Set<string>;
  filteredSchemas: Array<{ schema: SchemaSummary; tables: TableSummary[] }>;
  filter: string;
  selectedTable: TableSummary | null;
  tableDetails: TableDetails | null;
}) {
  const rows: BrowserRow[] = [];
  const searching = filter.trim() !== "";
  for (const { schema, tables } of filteredSchemas) {
    const expanded = searching || expandedSchemaKeys.has(schemaKey(schema.name));
    rows.push({
      kind: "schema",
      key: `schema:${schema.name}`,
      schema,
      expanded,
      tableCount: tables.length,
    });
    if (!expanded) continue;
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
  onToggleSchema,
}: {
  row: BrowserRow;
  selectedForeignKeys: Set<string>;
  inspectingTable: TableSummary | null;
  selectedTable: TableSummary | null;
  onInspectTable(table: TableSummary): Promise<TableDetails | null>;
  onToggleSchema(schemaName: string): void;
}) {
  if (row.kind === "schema") {
    const hasTables = row.tableCount > 0;
    return (
      <button
        aria-expanded={hasTables ? row.expanded : undefined}
        className={cn(
          "flex h-8 w-full appearance-none items-center gap-1 rounded-md border-0 bg-transparent px-2 text-left text-sm font-semibold transition",
          hasTables
            ? "text-zinc-500 hover:bg-control/[0.04] hover:text-zinc-200"
            : "cursor-default text-zinc-500/55 opacity-70",
        )}
        disabled={!hasTables}
        onClick={() => {
          if (hasTables) onToggleSchema(row.schema.name);
        }}
        title={
          hasTables
            ? `${row.expanded ? "Collapse" : "Expand"} ${row.schema.name}`
            : `${row.schema.name} has no tables`
        }
        type="button"
      >
        <Database
          className={cn("shrink-0", hasTables ? "text-zinc-500" : "text-zinc-500/55")}
          size={14}
        />
        <span className="min-w-0 truncate">{row.schema.name}</span>
        {hasTables ? (
          <DisclosureTriangle expanded={row.expanded} className="ml-1 mt-0.5" />
        ) : null}
        <span className="min-w-0 flex-1" />
        {row.tableCount > 0 ? (
          <span className="ml-2 mr-1 text-[10px] font-semibold text-muted">
            {row.tableCount}
          </span>
        ) : null}
      </button>
    );
  }

  if (row.kind === "column") {
    return (
      <SchemaColumnRow
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
    <SchemaTableRow
      active={active}
      loading={loading}
      table={table}
      onInspectTable={onInspectTable}
    />
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
