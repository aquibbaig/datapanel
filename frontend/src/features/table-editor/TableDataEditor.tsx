import {
  AlertTriangle,
  Check,
  PencilLine,
  RefreshCw,
  RotateCcw,
  TableProperties,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "../../components/ui/Button";
import { queryService } from "../../lib/backend";
import { cn } from "../../lib/cn";
import type {
  AppSettings,
  ColumnSummary,
  ConnectionProfile,
  QueryResult,
  TableDetails,
  TableSummary,
} from "../../lib/types";

interface Props {
  activeConnectionId: string;
  activeProfile: ConnectionProfile | null;
  selectedTable: TableSummary | null;
  tableDetails: TableDetails | null;
  settings: AppSettings | null;
  onCommitSQL(sql: string, summary: ChangeSummary): Promise<unknown>;
}

interface CellDraft {
  value: string;
  isNull: boolean;
}

type RowChanges = Record<string, CellDraft>;
type ChangeMap = Record<string, RowChanges>;
type DeletedMap = Record<string, boolean>;

interface ChangeSummary {
  cells: number;
  deletes: number;
  updates: number;
  total: number;
}

const rowLimit = 100;

export function TableDataEditor({
  activeConnectionId,
  activeProfile,
  selectedTable,
  tableDetails,
  settings,
  onCommitSQL,
}: Props) {
  const [result, setResult] = useState<QueryResult | null>(null);
  const [changes, setChanges] = useState<ChangeMap>({});
  const [deletedRows, setDeletedRows] = useState<DeletedMap>({});
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState("");

  const driver = activeProfile?.driver === "mysql" ? "mysql" : "postgres";
  const primaryColumns = useMemo(
    () => (tableDetails?.columns || []).filter((column) => column.isPrimary),
    [tableDetails],
  );
  const columnDetails = useMemo(() => {
    return new Map(
      (tableDetails?.columns || []).map((column) => [column.name, column]),
    );
  }, [tableDetails]);
  const qualifiedTable = useMemo(() => {
    if (!selectedTable) return "";
    return qualifiedName(driver, selectedTable.schema, selectedTable.name);
  }, [driver, selectedTable]);

  const loadRows = useCallback(async () => {
    if (!activeConnectionId || !selectedTable || !qualifiedTable) return;
    setLoading(true);
    setError("");
    try {
      const nextResult = await queryService.execute({
        requestId: crypto.randomUUID(),
        connectionId: activeConnectionId,
        sql: `select * from ${qualifiedTable} limit ${rowLimit};`,
        maxRows: rowLimit,
        timeoutSeconds: settings?.queryTimeoutSeconds ?? 30,
        confirmDestructive: true,
      });
      setResult(nextResult);
    } catch (loadError) {
      setResult(null);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load table rows",
      );
    } finally {
      setLoading(false);
    }
  }, [
    activeConnectionId,
    qualifiedTable,
    selectedTable,
    settings?.queryTimeoutSeconds,
  ]);

  useEffect(() => {
    setResult(null);
    setChanges({});
    setDeletedRows({});
    setError("");
    void loadRows();
  }, [loadRows]);

  const columnIndexes = useMemo(() => {
    return new Map(
      (result?.columns || []).map((column, index) => [column.name, index]),
    );
  }, [result]);

  const rows = result?.rows || [];
  const editable = Boolean(
    selectedTable &&
    tableDetails &&
    tableDetails.type.toUpperCase().includes("TABLE") &&
    primaryColumns.length > 0,
  );

  const pendingChanges = useMemo(
    () => summarizeChanges(changes, deletedRows),
    [changes, deletedRows],
  );
  const showChangeReview = pendingChanges.total > 0;
  const generatedSQL = useMemo(() => {
    if (!result || !selectedTable || primaryColumns.length === 0) return "";
    return buildMutationSQL({
      changes,
      columnDetails,
      columnIndexes,
      deletedRows,
      driver,
      primaryColumns,
      result,
      selectedTable,
    });
  }, [
    changes,
    columnDetails,
    columnIndexes,
    deletedRows,
    driver,
    primaryColumns,
    result,
    selectedTable,
  ]);

  function updateCell(row: unknown[], columnName: string, draft: CellDraft) {
    if (!result) return;
    const rowKey = getRowKey(row, primaryColumns, columnIndexes);
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

  function toggleDeleted(row: unknown[]) {
    const rowKey = getRowKey(row, primaryColumns, columnIndexes);
    setDeletedRows((current) => {
      const next = { ...current };
      if (next[rowKey]) {
        delete next[rowKey];
      } else {
        next[rowKey] = true;
      }
      return next;
    });
  }

  function discardChanges() {
    setChanges({});
    setDeletedRows({});
  }

  async function commitChanges() {
    if (!generatedSQL || pendingChanges.total === 0) return;
    setCommitting(true);
    setError("");
    try {
      await onCommitSQL(generatedSQL, pendingChanges);
      discardChanges();
      await loadRows();
    } catch (commitError) {
      setError(
        commitError instanceof Error
          ? commitError.message
          : "Could not commit table changes",
      );
    } finally {
      setCommitting(false);
    }
  }

  if (!selectedTable) {
    return (
      <section className="grid min-h-0 place-items-center bg-surface-900 text-muted">
        <div className="flex flex-col items-center justify-center gap-4">
          <TableProperties size={24} />
          <p>Select a table to edit rows.</p>
        </div>
      </section>
    );
  }

  if (!tableDetails) {
    return (
      <section className="grid min-h-0 place-items-center bg-surface-900 text-muted">
        <div className="flex flex-col items-center justify-center gap-4">
          <RefreshCw className="animate-spin" size={20} />
          <p>Loading table metadata.</p>
        </div>
      </section>
    );
  }

  return (
    <section
      className={cn(
        "grid min-h-0 min-w-0 bg-surface-900",
        showChangeReview
          ? "grid-cols-[minmax(0,1fr)_minmax(260px,300px)]"
          : "grid-cols-[minmax(0,1fr)]",
      )}
    >
      <div className="grid min-h-0 min-w-0 grid-rows-[38px_minmax(0,1fr)]">
        <div className="flex items-center justify-between border-b border-line px-3">
          <div className="flex min-w-0 items-center gap-2">
            <PencilLine size={14} className="text-zinc-400" />
            <span className="truncate text-sm font-medium text-zinc-200">
              {selectedTable.schema}.{selectedTable.name}
            </span>
            <span className="rounded-sm border border-line bg-surface-850 px-1.5 py-0.5 text-[11px] uppercase text-muted">
              {driver}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">
              {pendingChanges.total} pending
            </span>
            <Button
              disabled={loading || committing}
              onClick={() => void loadRows()}
              size="icon"
              title="Reload rows"
            >
              <RefreshCw size={14} />
            </Button>
            <Button
              disabled={pendingChanges.total === 0 || committing}
              onClick={discardChanges}
              size="icon"
              title="Discard changes"
            >
              <RotateCcw size={14} />
            </Button>
            <Button
              disabled={!editable || pendingChanges.total === 0 || committing}
              onClick={() => void commitChanges()}
              size="icon"
              title="Commit changes"
              variant="primary"
            >
              <Check size={14} />
            </Button>
          </div>
        </div>

        {!editable ? (
          <div className="grid min-h-0 place-items-center p-6 text-center text-sm text-muted">
            <div className="flex max-w-md flex-col items-center gap-3">
              <AlertTriangle size={20} className="text-yellow-200" />
              <p>
                This table is read-only here because it does not expose a
                primary key or is not a base table.
              </p>
            </div>
          </div>
        ) : loading ? (
          <div className="grid min-h-0 place-items-center text-muted">
            <RefreshCw className="animate-spin" size={20} />
          </div>
        ) : error ? (
          <div className="grid min-h-0 place-items-center p-6 text-center text-sm text-red-100">
            {error}
          </div>
        ) : (
          <div className="min-h-0 overflow-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 top-0 z-20 w-16 bg-surface-800 px-2 py-2 text-left font-medium text-zinc-300">
                    Row
                  </th>
                  {result?.columns.map((column) => (
                    <th
                      className="sticky top-0 z-10 min-w-[160px] bg-surface-800 px-2 py-2 text-left font-medium text-zinc-300"
                      key={column.name}
                    >
                      <div className="flex items-center gap-2">
                        <span className="truncate">{column.name}</span>
                        {columnDetails.get(column.name)?.isPrimary ? (
                          <span className="rounded-sm bg-accent/20 px-1 text-[10px] text-indigo-100">
                            PK
                          </span>
                        ) : null}
                      </div>
                    </th>
                  ))}
                  <th className="sticky right-0 top-0 z-20 w-12 bg-surface-800 px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => {
                  const rowKey = getRowKey(row, primaryColumns, columnIndexes);
                  const deleted = Boolean(deletedRows[rowKey]);
                  return (
                    <tr
                      className={cn(deleted && "bg-red-500/10 opacity-75")}
                      key={rowKey}
                    >
                      <td className="sticky left-0 z-10 bg-surface-900 px-2 py-1 text-muted">
                        {rowIndex + 1}
                      </td>
                      {result?.columns.map((column) => {
                        const rowChanges = changes[rowKey] || {};
                        const draft =
                          rowChanges[column.name] ||
                          getOriginalDraft(row, column.name, columnIndexes);
                        const changed = Boolean(rowChanges[column.name]);
                        return (
                          <td className="px-2 py-1" key={column.name}>
                            <input
                              className={cn(
                                "h-7 min-w-[144px] border-transparent bg-transparent px-2 text-xs text-zinc-200 focus:border-accent focus:bg-surface-850",
                                changed &&
                                  "border-accent/40 bg-accent/10 text-white",
                                deleted && "line-through",
                              )}
                              disabled={deleted}
                              onChange={(event) =>
                                updateCell(row, column.name, {
                                  value: event.target.value,
                                  isNull: false,
                                })
                              }
                              placeholder={draft.isNull ? "NULL" : ""}
                              value={draft.isNull ? "" : draft.value}
                            />
                          </td>
                        );
                      })}
                      <td className="sticky right-0 z-10 bg-surface-900 px-2 py-1">
                        <Button
                          className={cn(
                            deleted && "bg-red-500/25 text-red-100",
                          )}
                          onClick={() => toggleDeleted(row)}
                          size="icon"
                          title={deleted ? "Restore row" : "Delete row"}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showChangeReview ? (
        <aside className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)_minmax(120px,36%)] border-l border-line bg-surface-950">
          <div className="border-b border-line p-3">
            <div className="mb-2 text-sm font-medium text-zinc-200">
              Changed rows
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <div className="text-lg font-semibold text-zinc-100">
                  {pendingChanges.updates}
                </div>
                <div className="text-muted">updates</div>
              </div>
              <div>
                <div className="text-lg font-semibold text-red-100">
                  {pendingChanges.deletes}
                </div>
                <div className="text-muted">deletes</div>
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
                    <span
                      className={cn(
                        "font-medium",
                        item.kind === "delete"
                          ? "text-red-100"
                          : "text-zinc-200",
                      )}
                    >
                      {item.kind === "delete" ? "Delete" : "Update"}
                    </span>
                    <code className="truncate text-muted">{item.label}</code>
                  </div>
                  {item.columns.length > 0 ? (
                    <div className="truncate text-muted">
                      {item.columns.join(", ")}
                    </div>
                  ) : null}
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
              className="min-h-0 resize-none rounded-ui border-line bg-[#080808] p-2 text-xs text-zinc-300"
              readOnly
              value={generatedSQL}
            />
          </div>
        </aside>
      ) : null}
    </section>
  );
}

function summarizeChanges(changes: ChangeMap, deletedRows: DeletedMap) {
  const items: Array<{
    rowKey: string;
    kind: "update" | "delete";
    label: string;
    columns: string[];
  }> = [];
  let cells = 0;

  for (const rowKey of Object.keys(deletedRows)) {
    items.push({
      rowKey: `delete:${rowKey}`,
      kind: "delete",
      label: rowKey,
      columns: [],
    });
  }

  for (const [rowKey, rowChanges] of Object.entries(changes)) {
    if (deletedRows[rowKey]) continue;
    const columns = Object.keys(rowChanges);
    cells += columns.length;
    if (columns.length > 0) {
      items.push({
        rowKey: `update:${rowKey}`,
        kind: "update",
        label: rowKey,
        columns,
      });
    }
  }

  const deletes = Object.keys(deletedRows).length;
  const updates = items.filter((item) => item.kind === "update").length;
  return { cells, deletes, updates, total: deletes + updates, items };
}

function buildMutationSQL({
  changes,
  columnDetails,
  columnIndexes,
  deletedRows,
  driver,
  primaryColumns,
  result,
  selectedTable,
}: {
  changes: ChangeMap;
  columnDetails: Map<string, ColumnSummary>;
  columnIndexes: Map<string, number>;
  deletedRows: DeletedMap;
  driver: "postgres" | "mysql";
  primaryColumns: ColumnSummary[];
  result: QueryResult;
  selectedTable: TableSummary;
}) {
  const statements: string[] = [];
  const tableName = qualifiedName(
    driver,
    selectedTable.schema,
    selectedTable.name,
  );

  for (const row of result.rows) {
    const rowKey = getRowKey(row, primaryColumns, columnIndexes);
    if (deletedRows[rowKey]) {
      statements.push(
        `delete from ${tableName} where ${whereClause(row, primaryColumns, columnIndexes, driver)};`,
      );
    }
  }

  for (const row of result.rows) {
    const rowKey = getRowKey(row, primaryColumns, columnIndexes);
    if (deletedRows[rowKey]) continue;

    const rowChanges = changes[rowKey];
    if (!rowChanges || Object.keys(rowChanges).length === 0) continue;

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
      )};`,
    );
  }

  if (statements.length === 0) return "";
  return `begin;\n${statements.join("\n")}\ncommit;`;
}

function getRowKey(
  row: unknown[],
  primaryColumns: ColumnSummary[],
  columnIndexes: Map<string, number>,
) {
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
  driver: "postgres" | "mysql",
) {
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
  return left.isNull === right.isNull && left.value === right.value;
}

function sqlValue(draft: CellDraft, column?: ColumnSummary) {
  if (draft.isNull) return "null";
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

function isNumericType(dataType: string) {
  return /\b(int|serial|decimal|numeric|float|double|real|bit)\b/.test(
    dataType,
  );
}

function isBooleanType(dataType: string) {
  return /\b(bool|boolean|tinyint\(1\))\b/.test(dataType);
}

function qualifiedName(
  driver: "postgres" | "mysql",
  schema: string,
  table: string,
) {
  return `${quoteIdentifier(driver, schema)}.${quoteIdentifier(driver, table)}`;
}

function quoteIdentifier(driver: "postgres" | "mysql", identifier: string) {
  if (driver === "mysql") {
    return `\`${identifier.split("`").join("``")}\``;
  }
  return `"${identifier.split('"').join('""')}"`;
}

function formatKeyValue(value: unknown) {
  if (value === null || value === undefined) return "NULL";
  return String(value);
}
