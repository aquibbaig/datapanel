import type { ColumnSummary, QueryResult } from "../../../lib/types";
import { postgresRowLocatorColumn } from "../constants";
import type {
  ChangeMap,
  ChangeSummary,
  EditSnapshot,
  PendingInsertRow,
  RowChanges,
} from "../types";
import { isNullDraft, isTypedNull } from "./drafts";
import { mutationColumnName } from "./columns";

export function insertRowKey(row: PendingInsertRow) {
  return `insert:${row.id}`;
}

export function insertedRowToResultRow(
  insertedRow: PendingInsertRow,
  columns: QueryResult["columns"],
) {
  return columns.map((column) => {
    if (column.name === postgresRowLocatorColumn) return null;
    const draft = insertedRow.values[column.name];
    if (!draft) return null;
    return isNullDraft(draft) ? null : draft.value;
  });
}

export function parseClipboardRows(
  contents: string,
  visibleColumns: QueryResult["columns"],
  columnDetails: Map<string, ColumnSummary>,
  primaryKeyColumnSet: Set<string>,
): PendingInsertRow[] {
  const rows = parseDelimitedRows(contents).filter((row) =>
    row.some((cell) => cell.trim() !== ""),
  );
  if (rows.length === 0) return [];

  const headerIndexes = columnHeaderIndexes(rows[0], visibleColumns);
  const dataRows = headerIndexes ? rows.slice(1) : rows;

  return dataRows.map((row) => {
    const values: RowChanges = {};
    visibleColumns.forEach((column, columnIndex) => {
      if (primaryKeyColumnSet.has(mutationColumnName(column).toLowerCase())) {
        return;
      }
      const sourceIndex = headerIndexes
        ? headerIndexes.get(column.name.toLowerCase())
        : columnIndex;
      if (sourceIndex === undefined || sourceIndex >= row.length) return;
      const schemaColumn = getColumnDetail(
        columnDetails,
        mutationColumnName(column),
      );
      values[column.name] = draftFromClipboardCell(
        row[sourceIndex],
        schemaColumn?.dataType || column.dataType,
      );
    });
    return { id: createPendingInsertId(), values };
  });
}

export function getColumnDetail(
  columnDetails: Map<string, ColumnSummary>,
  columnName: string,
) {
  return (
    columnDetails.get(columnName) ||
    Array.from(columnDetails.values()).find(
      (column) => column.name.toLowerCase() === columnName.toLowerCase(),
    )
  );
}

export function createPendingInsertId() {
  return crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
}

export function cloneEditSnapshot(snapshot: EditSnapshot): EditSnapshot {
  return {
    changes: cloneChangeMap(snapshot.changes),
    deletedRowKeys: [...snapshot.deletedRowKeys],
    insertedRows: snapshot.insertedRows.map((row) => ({
      id: row.id,
      values: cloneRowChanges(row.values),
    })),
    selectedRowKeys: [...snapshot.selectedRowKeys],
  };
}

export function summarizeChanges(
  changes: ChangeMap,
  deletedRowKeys: Set<string>,
  insertedRows: PendingInsertRow[],
): ChangeSummary {
  const deleteItems = Array.from(deletedRowKeys).map((rowKey) => ({
    rowKey: `delete:${rowKey}`,
    kind: "delete" as const,
    label: rowKey,
    columns: [],
  }));
  const updateItems = Object.entries(changes)
    .filter(([rowKey]) => !deletedRowKeys.has(rowKey))
    .map(([rowKey, rowChanges]) => ({
      rowKey,
      kind: "update" as const,
      label: rowKey,
      columns: Object.keys(rowChanges),
    }))
    .filter((item) => item.columns.length > 0);
  const insertItems = insertedRows.map((row, index) => ({
    rowKey: insertRowKey(row),
    kind: "insert" as const,
    label: `new row ${index + 1}`,
    columns: Object.keys(row.values),
  }));
  const items = [...deleteItems, ...updateItems, ...insertItems];
  const cells = items.reduce((total, item) => total + item.columns.length, 0);
  return { cells, rows: items.length, total: items.length, items };
}

function cloneChangeMap(changes: ChangeMap): ChangeMap {
  return Object.fromEntries(
    Object.entries(changes).map(([rowKey, rowChanges]) => [
      rowKey,
      cloneRowChanges(rowChanges),
    ]),
  );
}

function cloneRowChanges(rowChanges: RowChanges): RowChanges {
  return Object.fromEntries(
    Object.entries(rowChanges).map(([columnName, draft]) => [
      columnName,
      { ...draft },
    ]),
  );
}

function columnHeaderIndexes(
  row: string[],
  visibleColumns: QueryResult["columns"],
) {
  const columnNames = new Set(
    visibleColumns.map((column) => column.name.toLowerCase()),
  );
  const headerIndexes = new Map<string, number>();
  for (const [index, cell] of row.entries()) {
    const normalized = cell.trim().toLowerCase();
    if (!columnNames.has(normalized)) return null;
    headerIndexes.set(normalized, index);
  }
  return headerIndexes.size > 0 ? headerIndexes : null;
}

function draftFromClipboardCell(value: string, dataType: string) {
  if (value.trim() === "" && !isTextType(dataType.toLowerCase())) {
    return { value: "", isNull: true };
  }
  if (isTypedNull(value)) {
    return { value: "", isNull: true, typedNull: true };
  }
  return { value, isNull: false };
}

function parseDelimitedRows(contents: string) {
  const trimmed = contents.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (trimmed.includes("\t")) {
    return trimmed.split("\n").map((line) => line.split("\t"));
  }
  return trimmed.split("\n").map(parseCSVLine);
}

function parseCSVLine(line: string) {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      cells.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells;
}

function isTextType(dataType: string) {
  return /\b(char|character|varchar|text|string)\b/.test(dataType);
}
