import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  Check,
  ChevronDown,
  Download,
  FileJson,
  FileSpreadsheet,
  KeyRound,
  Loader2,
  RotateCcw,
  TableProperties,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { cn } from "../../lib/cn";
import type {
  ColumnSummary,
  ConnectionProfile,
  QueryResult,
  TableDetails,
  TableSummary,
} from "../../lib/types";

interface Props {
  result: QueryResult | null;
  activeProfile?: ConnectionProfile | null;
  isLoading?: boolean;
  selectedTable?: TableSummary | null;
  tableDetails?: TableDetails | null;
  onCommitSQL?(sql: string, summary: ChangeSummary): Promise<unknown>;
}

interface CellDraft {
  value: string;
  isNull: boolean;
  typedNull?: boolean;
}

type RowChanges = Record<string, CellDraft>;
type ChangeMap = Record<string, RowChanges>;

interface ChangeSummary {
  cells: number;
  rows: number;
  total: number;
  items: ChangeItem[];
}

interface ChangeItem {
  rowKey: string;
  label: string;
  columns: string[];
}

const postgresRowLocatorColumn = "__datapanel_internal_ctid__";

export function ResultsGrid({
  activeProfile,
  isLoading = false,
  onCommitSQL,
  result,
  selectedTable,
  tableDetails,
}: Props) {
  const [displayRows, setDisplayRows] = useState<unknown[][]>([]);
  const [changes, setChanges] = useState<ChangeMap>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDisplayRows(result?.rows || []);
    setChanges({});
  }, [result]);

  const driver = normalizeDriver(activeProfile?.driver);
  const primaryColumns = useMemo(
    () => (tableDetails?.columns || []).filter((column) => column.isPrimary),
    [tableDetails],
  );
  const primaryKeyColumnSet = new Set(
    primaryColumns.map((column) => column.name.toLowerCase()),
  );
  const columnDetails = useMemo(() => {
    return new Map(
      (tableDetails?.columns || []).map((column) => [column.name, column]),
    );
  }, [tableDetails]);
  const columnIndexes = useMemo(() => {
    return new Map(
      (result?.columns || []).map((column, index) => [column.name, index]),
    );
  }, [result]);
  const visibleColumns = useMemo(
    () =>
      (result?.columns || []).filter(
        (column) => column.name !== postgresRowLocatorColumn,
      ),
    [result],
  );
  const rowLocatorIndex = columnIndexes.get(postgresRowLocatorColumn);
  const hasPrimaryKeyLocator =
    primaryColumns.length > 0 &&
    primaryColumns.every((column) => columnIndexes.has(column.name));
  const hasPostgresRowLocator =
    driver === "postgres" && rowLocatorIndex !== undefined;
  const editable = Boolean(
    result &&
    selectedTable &&
    tableDetails &&
    tableDetails.type.toUpperCase().includes("TABLE") &&
    (hasPrimaryKeyLocator || hasPostgresRowLocator) &&
    onCommitSQL,
  );
  const pendingChanges = useMemo(() => summarizeChanges(changes), [changes]);
  const showChangeReview = editable && pendingChanges.total > 0;
  const generatedSQL = useMemo(() => {
    if (!editable || !result || !selectedTable) return "";
    return buildMutationSQL({
      changes,
      columnDetails,
      columnIndexes,
      driver,
      primaryColumns,
      rowLocatorIndex,
      rows: displayRows,
      selectedTable,
    });
  }, [
    changes,
    columnDetails,
    columnIndexes,
    displayRows,
    driver,
    editable,
    primaryColumns,
    result,
    rowLocatorIndex,
    selectedTable,
  ]);

  function updateCell(
    row: unknown[],
    rowIndex: number,
    columnName: string,
    draft: CellDraft,
  ) {
    if (!result) return;
    const rowKey = getRowKey(
      row,
      primaryColumns,
      columnIndexes,
      rowIndex,
      rowLocatorIndex,
    );
    const original = getOriginalDraft(row, columnName, columnIndexes);

    setChanges((current) => {
      const next = { ...current };
      const rowChanges = { ...(next[rowKey] || {}) };
      if (sameDraft(original, draft)) {
        delete rowChanges[columnName];
      } else {
        rowChanges[columnName] = draft;
      }
      if (Object.keys(rowChanges).length === 0) {
        delete next[rowKey];
      } else {
        next[rowKey] = rowChanges;
      }
      return next;
    });
  }

  async function commitChanges() {
    if (!generatedSQL || !onCommitSQL || pendingChanges.total === 0) return;
    setSaving(true);
    try {
      await onCommitSQL(generatedSQL, pendingChanges);
      setDisplayRows((current) =>
        current.map((row, rowIndex) => {
          const rowKey = getRowKey(
            row,
            primaryColumns,
            columnIndexes,
            rowIndex,
            rowLocatorIndex,
          );
          const rowChanges = changes[rowKey];
          if (!rowChanges) return row;
          const next = [...row];
          for (const [columnName, draft] of Object.entries(rowChanges)) {
            const index = columnIndexes.get(columnName);
            if (index !== undefined) {
              next[index] = isNullDraft(draft) ? null : draft.value;
            }
          }
          return next;
        }),
      );
      setChanges({});
    } catch {
      // The shared commit path already reports database permission/query errors.
    } finally {
      setSaving(false);
    }
  }

  function discardChanges() {
    setChanges({});
  }

  const rows = displayRows;

  const exportResult = result
    ? {
        ...result,
        columns: visibleColumns,
        rows: rows.map((row) =>
          visibleColumns.map((column) => {
            const index = columnIndexes.get(column.name);
            return index === undefined ? null : row[index];
          }),
        ),
      }
    : null;

  if (isLoading) {
    return (
      <section className="grid min-h-0 place-items-center gap-2 bg-surface-900 text-muted">
        <div className="flex flex-col items-center justify-center gap-4">
          <Loader2
            aria-label="Query running"
            className="animate-spin text-zinc-300"
            size={24}
          />
          <p>Running query...</p>
        </div>
      </section>
    );
  }

  if (!result) {
    return (
      <section className="grid min-h-0 place-items-center gap-2 bg-surface-900 text-muted">
        <div className="flex flex-col items-center justify-center gap-4">
          <TableProperties size={24} />
          <p>Run a query to see results.</p>
        </div>
      </section>
    );
  }

  if (result.error === "confirmation_required") {
    return (
      <section className="grid min-h-0 place-items-center bg-surface-900 text-yellow-100">
        <p>Destructive query confirmation is required before execution.</p>
      </section>
    );
  }

  return (
    <section
      className={cn(
        "grid min-h-0 overflow-hidden bg-surface-900",
        showChangeReview
          ? "grid-cols-[minmax(0,1fr)_minmax(260px,300px)]"
          : "grid-cols-[minmax(0,1fr)]",
      )}
    >
      <div className="min-h-0 min-w-0 overflow-hidden">
        <div className="flex h-8 items-center justify-between gap-4 border-b border-line px-2 text-xs text-zinc-300">
          <div className="flex min-w-0 items-center gap-4">
            <span>{rows.length} rows</span>
            <span>{result.affectedRows} affected</span>
            <span>{result.durationMs}ms</span>
            {editable ? <span>{pendingChanges.total} pending</span> : null}
            {result.truncated ? (
              <span className="text-yellow-200">truncated</span>
            ) : null}
          </div>
          <div className="flex items-center gap-1">
            {pendingChanges.total > 0 ? (
              <>
                <Button
                  aria-label="Discard changes"
                  disabled={saving}
                  onClick={discardChanges}
                  size="icon"
                  className="!h-5"
                >
                  <RotateCcw size={13} />
                </Button>
                <Button
                  aria-label="Save changes"
                  disabled={saving}
                  onClick={() => void commitChanges()}
                  size="icon"
                  variant="primary"
                  className="!h-5"
                >
                  <Check size={13} />
                </Button>
              </>
            ) : null}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  className="inline-flex h-6 items-center justify-center gap-1.5 rounded-md border border-transparent bg-transparent px-2 text-xs font-medium text-zinc-500 transition hover:bg-surface-700 hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-65 [&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:shrink-0"
                  disabled={visibleColumns.length === 0 || !exportResult}
                  title="Export results"
                >
                  <Download size={13} />
                  Export as
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
                    onSelect={() => exportResult && exportCSV(exportResult)}
                  >
                    <FileSpreadsheet size={13} />
                    CSV
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    className="flex cursor-pointer select-none items-center gap-2 px-2.5 py-1.5 text-xs text-zinc-300 outline-none hover:bg-surface-700 hover:text-zinc-100 data-[highlighted]:bg-surface-700 data-[highlighted]:text-zinc-100"
                    onSelect={() => exportResult && exportJSON(exportResult)}
                  >
                    <FileJson size={13} />
                    JSON
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </div>
        <div className="h-[calc(100%-32px)] overflow-auto">
          <table className="text-xs">
            <thead>
              <tr>
                {visibleColumns.map((column) => (
                  <th
                    className={cn(
                      "sticky top-0 bg-surface-800 py-2 text-left font-medium text-zinc-300",
                      editable ? "px-5" : "px-3",
                    )}
                    key={column.name}
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      {primaryKeyColumnSet.has(column.name.toLowerCase()) ? (
                        <KeyRound
                          aria-label="Primary key"
                          className="text-yellow-200"
                          size={10}
                        />
                      ) : null}
                      <span className="truncate">{column.name}</span>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => {
                const rowKey = getRowKey(
                  row,
                  primaryColumns,
                  columnIndexes,
                  rowIndex,
                  rowLocatorIndex,
                );
                const rowChanged = Boolean(changes[rowKey]);
                return (
                  <tr
                    className={cn(rowChanged && "bg-yellow-900/20")}
                    key={rowKey || rowIndex}
                  >
                    {visibleColumns.map((column) => {
                      const cellIndex = columnIndexes.get(column.name);
                      const cell =
                        cellIndex === undefined ? null : row[cellIndex];
                      const rowChanges = changes[rowKey] || {};
                      const draft =
                        rowChanges[column.name] ||
                        getOriginalDraft(row, column.name, columnIndexes);
                      const changed = Boolean(rowChanges[column.name]);
                      return (
                        <td
                          className="px-3 py-2 text-zinc-300"
                          key={column.name}
                        >
                          {editable ? (
                            <CellEditor
                              changed={changed}
                              disabled={saving}
                              draft={draft}
                              onChange={(nextDraft) =>
                                updateCell(row, rowIndex, column.name, {
                                  value: nextDraft.value,
                                  isNull: nextDraft.isNull,
                                })
                              }
                            />
                          ) : (
                            formatCell(cell)
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {showChangeReview ? (
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
                    <span className="font-medium text-zinc-200">Update</span>
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
              className="min-h-0 resize-none rounded-ui border-line bg-background p-2 text-xs text-zinc-300"
              readOnly
              value={generatedSQL}
            />
          </div>
        </aside>
      ) : null}
    </section>
  );
}

function CellEditor({
  changed,
  disabled,
  draft,
  onChange,
}: {
  changed: boolean;
  disabled: boolean;
  draft: CellDraft;
  onChange(draft: CellDraft): void;
}) {
  return (
    <div
      className={cn(
        "flex h-7 min-w-[176px] items-center rounded-md border border-transparent bg-transparent transition focus-within:border-accent focus-within:bg-surface-850",
        changed &&
          "border-yellow-700/60 bg-yellow-900/35 text-yellow-50 focus-within:border-yellow-500 focus-within:bg-yellow-900/45",
      )}
    >
      <input
        className="h-full min-w-0 flex-1 border-0 bg-transparent px-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-transparent focus:shadow-none"
        disabled={disabled}
        onChange={(event) =>
          onChange({
            value: event.target.value,
            isNull: false,
            typedNull: isTypedNull(event.target.value),
          })
        }
        placeholder={draft.isNull ? "NULL" : ""}
        value={draft.isNull ? "" : draft.value}
      />
    </div>
  );
}

function summarizeChanges(changes: ChangeMap): ChangeSummary {
  const items = Object.entries(changes)
    .map(([rowKey, rowChanges]) => ({
      rowKey,
      label: rowKey,
      columns: Object.keys(rowChanges),
    }))
    .filter((item) => item.columns.length > 0);
  const cells = items.reduce((total, item) => total + item.columns.length, 0);
  return { cells, rows: items.length, total: items.length, items };
}

function buildMutationSQL({
  changes,
  columnDetails,
  columnIndexes,
  driver,
  primaryColumns,
  rowLocatorIndex,
  rows,
  selectedTable,
}: {
  changes: ChangeMap;
  columnDetails: Map<string, ColumnSummary>;
  columnIndexes: Map<string, number>;
  driver: SQLDriver;
  primaryColumns: ColumnSummary[];
  rowLocatorIndex?: number;
  rows: unknown[][];
  selectedTable: TableSummary;
}) {
  const statements: string[] = [];
  const tableName = qualifiedName(
    driver,
    selectedTable.schema,
    selectedTable.name,
  );

  rows.forEach((row, rowIndex) => {
    const rowKey = getRowKey(
      row,
      primaryColumns,
      columnIndexes,
      rowIndex,
      rowLocatorIndex,
    );
    const rowChanges = changes[rowKey];
    if (!rowChanges || Object.keys(rowChanges).length === 0) return;

    const assignments = Object.entries(rowChanges).map(
      ([columnName, draft]) => {
        const column = columnDetails.get(columnName);
        return `${quoteIdentifier(driver, columnName)} = ${sqlValue(draft, column)}`;
      },
    );
    statements.push(
      `update ${tableName} set ${assignments.join(", ")} where ${whereClause(
        row,
        primaryColumns,
        columnIndexes,
        driver,
        rowLocatorIndex,
      )};`,
    );
  });

  if (statements.length === 0) return "";
  return `begin;\n${statements.join("\n")}\ncommit;`;
}

function getRowKey(
  row: unknown[],
  primaryColumns: ColumnSummary[],
  columnIndexes: Map<string, number>,
  rowIndex: number,
  rowLocatorIndex?: number,
) {
  if (primaryColumns.length === 0) {
    if (rowLocatorIndex !== undefined) {
      return `ctid=${formatKeyValue(row[rowLocatorIndex])}`;
    }
    return `row:${rowIndex}`;
  }
  return primaryColumns
    .map((column) => {
      const index = columnIndexes.get(column.name);
      const value = index === undefined ? "" : row[index];
      return `${column.name}=${formatKeyValue(value)}`;
    })
    .join(";");
}

function whereClause(
  row: unknown[],
  primaryColumns: ColumnSummary[],
  columnIndexes: Map<string, number>,
  driver: SQLDriver,
  rowLocatorIndex?: number,
) {
  if (primaryColumns.length === 0 && rowLocatorIndex !== undefined) {
    return `ctid = ${sqlRowLocatorValue(row[rowLocatorIndex])}`;
  }

  return primaryColumns
    .map((column) => {
      const index = columnIndexes.get(column.name);
      const value = index === undefined ? null : row[index];
      return `${quoteIdentifier(driver, column.name)} = ${sqlValue(toDraft(value), column)}`;
    })
    .join(" and ");
}

function getOriginalDraft(
  row: unknown[],
  columnName: string,
  columnIndexes: Map<string, number>,
) {
  const index = columnIndexes.get(columnName);
  return toDraft(index === undefined ? null : row[index]);
}

function toDraft(value: unknown): CellDraft {
  if (value === null || value === undefined) {
    return { value: "", isNull: true };
  }
  return {
    value: typeof value === "object" ? JSON.stringify(value) : String(value),
    isNull: false,
  };
}

function sameDraft(left: CellDraft, right: CellDraft) {
  if (isNullDraft(left) && isNullDraft(right)) return true;
  return left.isNull === right.isNull && left.value === right.value;
}

function sqlValue(draft: CellDraft, column?: ColumnSummary) {
  if (isNullDraft(draft)) return "null";
  const value = draft.value;
  const dataType = column?.dataType.toLowerCase() || "";

  if (isNumericType(dataType) && /^[-+]?\d+(\.\d+)?$/.test(value.trim())) {
    return value.trim();
  }
  if (isBooleanType(dataType)) {
    const normalized = value.trim().toLowerCase();
    if (["true", "t", "1", "yes"].includes(normalized)) return "true";
    if (["false", "f", "0", "no"].includes(normalized)) return "false";
  }
  return `'${value.split("'").join("''")}'`;
}

function isNullDraft(draft: CellDraft) {
  return draft.isNull || draft.typedNull === true;
}

function isTypedNull(value: string) {
  return value.trim().toUpperCase() === "NULL";
}

function sqlRowLocatorValue(value: unknown) {
  return `'${String(value ?? "")
    .split("'")
    .join("''")}'::tid`;
}

function isNumericType(dataType: string) {
  return /\b(int|serial|decimal|numeric|float|double|real|bit)\b/.test(
    dataType,
  );
}

function isBooleanType(dataType: string) {
  return /\b(bool|boolean|tinyint\(1\))\b/.test(dataType);
}

function qualifiedName(
  driver: SQLDriver,
  schema: string,
  table: string,
) {
  return `${quoteIdentifier(driver, schema)}.${quoteIdentifier(driver, table)}`;
}

type SQLDriver = "postgres" | "mysql" | "bigquery";

function normalizeDriver(driver: string | undefined): SQLDriver {
  if (driver === "mysql") return "mysql";
  if (driver === "bigquery") return "bigquery";
  return "postgres";
}

function quoteIdentifier(driver: SQLDriver, identifier: string) {
  if (driver === "mysql" || driver === "bigquery") {
    return `\`${identifier.split("`").join("``")}\``;
  }
  return `"${identifier.split('"').join('""')}"`;
}

function formatKeyValue(value: unknown) {
  if (value === null || value === undefined) return "NULL";
  return String(value);
}

function formatCell(value: unknown) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function exportJSON(result: QueryResult) {
  const columns = result.columns.map((column) => column.name);
  const objects = result.rows.map((row) =>
    Object.fromEntries(
      columns.map((column, index) => [column, row[index] ?? null]),
    ),
  );
  downloadFile("json", JSON.stringify(objects, null, 2), "application/json");
}

function exportCSV(result: QueryResult) {
  const headers = result.columns.map((column) => column.name);
  const rows = result.rows.map((row) => row.map(csvCell).join(","));
  downloadFile(
    "csv",
    [headers.map(csvCell).join(","), ...rows].join("\n"),
    "text/csv;charset=utf-8",
  );
}

function csvCell(value: unknown) {
  if (value === null || value === undefined) return "";
  const text =
    typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadFile(
  extension: "csv" | "json",
  contents: string,
  type: string,
) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `datapanel-results-${new Date().toISOString().replace(/[:.]/g, "-")}.${extension}`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  toast("Export ready", {
    description: `${extension.toUpperCase()} downloaded`,
  });
}
