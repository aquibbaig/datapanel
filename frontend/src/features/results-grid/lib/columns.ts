import type { QueryResult, TableSummary } from "../../../lib/types";
import { postgresRowLocatorColumn } from "../constants";

export function columnKey(
  column: QueryResult["columns"][number],
  index: number,
) {
  return `${index}:${column.name}:${column.sourceTable || ""}:${column.sourceColumn || ""}`;
}

export function columnTitle(column: QueryResult["columns"][number]) {
  const source =
    column.sourceTable && column.sourceColumn
      ? `\nSource: ${column.sourceSchema}.${column.sourceTable}.${column.sourceColumn}`
      : "";
  return `${column.name}${source}`;
}

export function columnBelongsToSelectedTable(
  column: QueryResult["columns"][number],
  selectedTable: TableSummary | null | undefined,
) {
  if (!selectedTable) return false;
  if (!column.sourceTable) return true;
  return (
    namesEqual(column.sourceTable, selectedTable.name) &&
    (!column.sourceSchema ||
      namesEqual(column.sourceSchema, selectedTable.schema))
  );
}

export function isWritableColumn(
  column: QueryResult["columns"][number],
  selectedTable: TableSummary | null | undefined,
) {
  if (column.name === postgresRowLocatorColumn) return false;
  if (!columnBelongsToSelectedTable(column, selectedTable)) return false;
  return Boolean(mutationColumnName(column));
}

export function mutationColumnName(column: QueryResult["columns"][number]) {
  return column.sourceColumn || column.name;
}

export function namesEqual(left: string, right: string) {
  return left.toLowerCase() === right.toLowerCase();
}
