import type {
  ColumnSummary,
  QueryResult,
  TableSummary,
} from "../../../lib/types";
import type { CellDraft, ChangeMap, PendingInsertRow, SQLDriver } from "../types";
import { columnBelongsToSelectedTable, mutationColumnName } from "./columns";
import { isNullDraft, toDraft } from "./drafts";
import { getColumnDetail } from "./rows";

export function buildMutationSQL({
  changes,
  columnDetails,
  deletedRowKeys,
  driver,
  insertedRows,
  primaryColumns,
  rowLocatorIndex,
  rows,
  selectedTable,
  sourceColumnIndexes,
  visibleColumns,
}: {
  changes: ChangeMap;
  columnDetails: Map<string, ColumnSummary>;
  deletedRowKeys: Set<string>;
  driver: SQLDriver;
  insertedRows: PendingInsertRow[];
  primaryColumns: ColumnSummary[];
  rowLocatorIndex?: number;
  rows: unknown[][];
  selectedTable: TableSummary;
  sourceColumnIndexes: Map<string, number>;
  visibleColumns: QueryResult["columns"];
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
      sourceColumnIndexes,
      rowIndex,
      rowLocatorIndex,
    );
    if (!deletedRowKeys.has(rowKey)) return;

    statements.push(
      `delete from ${tableName} where ${whereClause(
        row,
        primaryColumns,
        sourceColumnIndexes,
        driver,
        rowLocatorIndex,
      )};`,
    );
  });

  rows.forEach((row, rowIndex) => {
    const rowKey = getRowKey(
      row,
      primaryColumns,
      sourceColumnIndexes,
      rowIndex,
      rowLocatorIndex,
    );
    if (deletedRowKeys.has(rowKey)) return;
    const rowChanges = changes[rowKey];
    if (!rowChanges || Object.keys(rowChanges).length === 0) return;

    const assignments = Object.entries(rowChanges).map(
      ([columnName, draft]) => {
        const resultColumn = visibleColumns.find(
          (candidate) => candidate.name === columnName,
        );
        const mutationName = resultColumn
          ? mutationColumnName(resultColumn)
          : columnName;
        const column = getColumnDetail(columnDetails, mutationName);
        return `${quoteIdentifier(driver, mutationName)} = ${sqlValue(draft, column)}`;
      },
    );
    statements.push(
      `update ${tableName} set ${assignments.join(", ")} where ${whereClause(
        row,
        primaryColumns,
        sourceColumnIndexes,
        driver,
        rowLocatorIndex,
      )};`,
    );
  });

  insertedRows.forEach((insertedRow) => {
    const columns = visibleColumns.filter(
      (column) =>
        insertedRow.values[column.name] !== undefined &&
        columnBelongsToSelectedTable(column, selectedTable),
    );
    if (columns.length === 0) {
      statements.push(`insert into ${tableName} default values;`);
      return;
    }
    const columnList = columns
      .map((column) => quoteIdentifier(driver, mutationColumnName(column)))
      .join(", ");
    const values = columns
      .map((column) =>
        sqlValue(
          insertedRow.values[column.name],
          getColumnDetail(columnDetails, mutationColumnName(column)),
        ),
      )
      .join(", ");
    statements.push(
      `insert into ${tableName} (${columnList}) values (${values});`,
    );
  });

  if (statements.length === 0) return "";
  return `begin;\n${statements.join("\n")}\ncommit;`;
}

export function getRowKey(
  row: unknown[],
  primaryColumns: ColumnSummary[],
  columnIndexes: Map<string, number>,
  rowIndex: number,
  rowLocatorIndex?: number,
) {
  const hasPrimaryKeyValues =
    primaryColumns.length > 0 &&
    primaryColumns.every((column) =>
      columnIndexes.has(column.name.toLowerCase()),
    );
  if (!hasPrimaryKeyValues && rowLocatorIndex !== undefined) {
    return `ctid=${formatKeyValue(row[rowLocatorIndex])}`;
  }
  if (!hasPrimaryKeyValues) {
    return `row:${rowIndex}`;
  }
  return primaryColumns
    .map((column) => {
      const index = columnIndexes.get(column.name.toLowerCase());
      const value = index === undefined ? "" : row[index];
      return `${column.name}=${formatKeyValue(value)}`;
    })
    .join(";");
}

export function normalizeDriver(driver: string | undefined): SQLDriver {
  if (driver === "mysql") return "mysql";
  if (driver === "bigquery") return "bigquery";
  return "postgres";
}

function whereClause(
  row: unknown[],
  primaryColumns: ColumnSummary[],
  columnIndexes: Map<string, number>,
  driver: SQLDriver,
  rowLocatorIndex?: number,
) {
  const hasPrimaryKeyValues =
    primaryColumns.length > 0 &&
    primaryColumns.every((column) =>
      columnIndexes.has(column.name.toLowerCase()),
    );
  if (!hasPrimaryKeyValues && rowLocatorIndex !== undefined) {
    return `ctid = ${sqlRowLocatorValue(row[rowLocatorIndex])}`;
  }

  return primaryColumns
    .map((column) => {
      const index = columnIndexes.get(column.name.toLowerCase());
      const value = index === undefined ? null : row[index];
      return `${quoteIdentifier(driver, column.name)} = ${sqlValue(toDraft(value), column)}`;
    })
    .join(" and ");
}

function sqlValue(draft: CellDraft, column?: ColumnSummary) {
  if (isNullDraft(draft)) return "null";
  const value = draft.value;
  const dataType = column?.dataType.toLowerCase() || "";

  if (value.trim() === "" && dataType && !isTextType(dataType)) {
    return "null";
  }
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

function sqlRowLocatorValue(value: unknown) {
  return `'${String(value ?? "").split("'").join("''")}'::tid`;
}

function qualifiedName(driver: SQLDriver, schema: string, table: string) {
  return `${quoteIdentifier(driver, schema)}.${quoteIdentifier(driver, table)}`;
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

function isNumericType(dataType: string) {
  return /\b(int|serial|decimal|numeric|float|double|real|bit)\b/.test(
    dataType,
  );
}

function isBooleanType(dataType: string) {
  return /\b(bool|boolean|tinyint\(1\))\b/.test(dataType);
}

function isTextType(dataType: string) {
  return /\b(char|character|varchar|text|string)\b/.test(dataType);
}
