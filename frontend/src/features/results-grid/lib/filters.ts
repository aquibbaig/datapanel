import type { ResultFilter, ResultSort } from "../types";
import { formatCell } from "./value-format";

export function applyResultFilters<T>(
  rows: T[],
  filters: ResultFilter[],
  valueAt: (row: T, columnName: string) => unknown,
) {
  if (filters.length === 0) return rows;
  return rows.filter((row) =>
    filters.every((filter) =>
      filterMatches(filter, valueAt(row, filter.columnName)),
    ),
  );
}

export function sortResultRows<T>(
  rows: T[],
  sort: ResultSort | null,
  valueAt: (row: T, columnName: string) => unknown,
) {
  if (!sort) return rows;
  const direction = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((left, right) => {
    const result = compareValues(
      valueAt(left, sort.columnName),
      valueAt(right, sort.columnName),
    );
    return result * direction;
  });
}

export function filterLabel(filter: ResultFilter) {
  switch (filter.operator) {
    case "contains":
      return `${filter.columnName} contains "${filter.value}"`;
    case "equals":
      return `${filter.columnName} = "${filter.value}"`;
    case "notEquals":
      return `${filter.columnName} != "${filter.value}"`;
    case "empty":
      return `${filter.columnName} is empty`;
    case "notEmpty":
      return `${filter.columnName} is not empty`;
  }
}

function filterMatches(filter: ResultFilter, value: unknown) {
  const text = formatCell(value).trim();
  const normalized = text.toLowerCase();
  const query = filter.value.trim().toLowerCase();
  const empty = value === null || value === undefined || text === "";

  switch (filter.operator) {
    case "contains":
      return query === "" || normalized.includes(query);
    case "equals":
      return normalized === query;
    case "notEquals":
      return normalized !== query;
    case "empty":
      return empty;
    case "notEmpty":
      return !empty;
  }
}

function compareValues(left: unknown, right: unknown) {
  if (left === right) return 0;
  if (left === null || left === undefined) return 1;
  if (right === null || right === undefined) return -1;
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }
  return formatCell(left).localeCompare(formatCell(right), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}
