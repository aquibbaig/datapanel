import type { QueryResult } from "../../../lib/types";
import type { FindMatch } from "../types";
import { formatCell } from "./value-format";

export function buildFindMatches({
  query,
  rows,
  visibleColumns,
  columnIndexes,
}: {
  query: string;
  rows: Array<{ row: unknown[] }>;
  visibleColumns: QueryResult["columns"];
  columnIndexes: Map<string, number>;
}): FindMatch[] {
  if (!query) return [];
  const matches = visibleColumns.reduce<FindMatch[]>(
    (items, column, columnIndex) => {
      const haystack = [
        column.name,
        column.sourceSchema || "",
        column.sourceTable || "",
        column.sourceColumn || "",
      ]
        .join(" ")
        .toLowerCase();
      if (haystack.includes(query)) {
        items.push({ kind: "column", columnIndex });
      }
      return items;
    },
    [],
  );

  for (const [rowIndex, rowEntry] of rows.entries()) {
    for (const [columnIndex, column] of visibleColumns.entries()) {
      const valueIndex = columnIndexes.get(column.name);
      const value =
        valueIndex === undefined ? null : rowEntry.row[valueIndex];
      if (formatCell(value).toLowerCase().includes(query)) {
        matches.push({ kind: "cell", rowIndex, columnIndex });
        if (matches.length >= 500) {
          return matches;
        }
      }
    }
  }
  return matches;
}
