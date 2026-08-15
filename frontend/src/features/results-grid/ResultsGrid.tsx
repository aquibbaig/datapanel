import {
  KeyRound,
  Loader2,
  TableProperties,
} from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "../../lib/cn";
import type {
  ConnectionProfile,
  QueryResult,
  TableDetails,
  TableSummary,
} from "../../lib/types";
import { ChangeReviewPanel } from "./components/ChangeReviewPanel";
import { CellEditor } from "./components/CellEditor";
import { CellValue } from "./components/CellValue";
import { ColumnActionsMenu } from "./components/ColumnActionsMenu";
import { FinderBar } from "./components/FinderBar";
import { ResultViewBar } from "./components/ResultViewBar";
import { ResultsToolbar } from "./components/ResultsToolbar";
import { ValueInspector } from "./components/ValueInspector";
import {
  postgresRowLocatorColumn,
  resultColumnWidth,
  resultHeaderHeight,
  resultRowHeight,
} from "./constants";
import {
  columnBelongsToSelectedTable,
  columnKey,
  columnTitle,
  isWritableColumn,
  mutationColumnName,
} from "./lib/columns";
import {
  readClipboardText,
  writeClipboardText,
} from "./lib/clipboard";
import {
  draftValue,
  isNullDraft,
  sameDraft,
  toDraft,
} from "./lib/drafts";
import {
  exportCSV,
  exportJSON,
  serializeRowsAsTSV,
} from "./lib/export";
import {
  applyResultFilters,
  sortResultRows,
} from "./lib/filters";
import {
  cloneEditSnapshot,
  createPendingInsertId,
  insertedRowToResultRow,
  insertRowKey,
  parseClipboardRows,
  summarizeChanges,
} from "./lib/rows";
import { buildFindMatches } from "./lib/search";
import {
  buildMutationSQL,
  getRowKey,
  normalizeDriver,
} from "./lib/sql";
import { isInspectableValue } from "./lib/value-format";
import type {
  CellDraft,
  ChangeMap,
  ChangeSummary,
  EditSnapshot,
  PendingInsertRow,
  ResultFilter,
  ResultFilterOperator,
  ResultSort,
} from "./types";

interface Props {
  result: QueryResult | null;
  activeProfile?: ConnectionProfile | null;
  isLoading?: boolean;
  selectedTable?: TableSummary | null;
  tableDetails?: TableDetails | null;
  onCommitSQL?(sql: string, summary: ChangeSummary): Promise<unknown>;
}

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
  const [deletedRowKeys, setDeletedRowKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [insertedRows, setInsertedRows] = useState<PendingInsertRow[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [editingCell, setEditingCell] = useState<{
    rowKey: string;
    columnName: string;
  } | null>(null);
  const [finderOpen, setFinderOpen] = useState(false);
  const [finderQuery, setFinderQuery] = useState("");
  const [activeFindIndex, setActiveFindIndex] = useState(0);
  const [filters, setFilters] = useState<ResultFilter[]>([]);
  const [sortState, setSortState] = useState<ResultSort | null>(null);
  const [hiddenColumnNames, setHiddenColumnNames] = useState<Set<string>>(
    () => new Set(),
  );
  const [openColumnMenuIndex, setOpenColumnMenuIndex] = useState<number | null>(
    null,
  );
  const [scrollLeft, setScrollLeft] = useState(0);
  const [maxScrollLeft, setMaxScrollLeft] = useState(0);
  const [scrollViewportWidth, setScrollViewportWidth] = useState(0);
  const [inspectedCell, setInspectedCell] = useState<{
    columnName: string;
    value: unknown;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const gridRef = useRef<HTMLElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const finderInputRef = useRef<HTMLInputElement | null>(null);
  const changesRef = useRef<ChangeMap>({});
  const deletedRowKeysRef = useRef<Set<string>>(new Set());
  const insertedRowsRef = useRef<PendingInsertRow[]>([]);
  const selectedRowKeysRef = useRef<Set<string>>(new Set());
  const undoStackRef = useRef<EditSnapshot[]>([]);
  const redoStackRef = useRef<EditSnapshot[]>([]);

  useEffect(() => {
    setDisplayRows(result?.rows || []);
    setChanges({});
    setDeletedRowKeys(new Set());
    setInsertedRows([]);
    setSelectedRowKeys(new Set());
    setEditingCell(null);
    setFinderOpen(false);
    setFinderQuery("");
    setActiveFindIndex(0);
    setFilters([]);
    setSortState(null);
    setHiddenColumnNames(new Set());
    setOpenColumnMenuIndex(null);
    setInspectedCell(null);
    changesRef.current = {};
    deletedRowKeysRef.current = new Set();
    insertedRowsRef.current = [];
    selectedRowKeysRef.current = new Set();
    undoStackRef.current = [];
    redoStackRef.current = [];
  }, [result]);

  useEffect(() => {
    changesRef.current = changes;
  }, [changes]);

  useEffect(() => {
    deletedRowKeysRef.current = deletedRowKeys;
  }, [deletedRowKeys]);

  useEffect(() => {
    insertedRowsRef.current = insertedRows;
  }, [insertedRows]);

  useEffect(() => {
    selectedRowKeysRef.current = selectedRowKeys;
  }, [selectedRowKeys]);

  useEffect(() => {
    function clearSelectionOutsideRows(event: MouseEvent) {
      if (selectedRowKeysRef.current.size === 0) return;
      const target = event.target;
      if (target instanceof Element && target.closest("[data-results-row]")) {
        return;
      }
      setSelectedRowKeys(new Set());
    }

    document.addEventListener("click", clearSelectionOutsideRows);
    return () => document.removeEventListener("click", clearSelectionOutsideRows);
  }, []);

  const driver = normalizeDriver(activeProfile?.driver);
  const primaryColumns = useMemo(
    () => (tableDetails?.columns || []).filter((column) => column.isPrimary),
    [tableDetails],
  );
  const primaryKeyColumnSet = useMemo(
    () => new Set(primaryColumns.map((column) => column.name.toLowerCase())),
    [primaryColumns],
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
  const resultColumns = useMemo(
    () =>
      (result?.columns || []).filter(
        (column) => column.name !== postgresRowLocatorColumn,
      ),
    [result],
  );
  const visibleColumns = useMemo(
    () =>
      resultColumns.filter((column) => !hiddenColumnNames.has(column.name)),
    [hiddenColumnNames, resultColumns],
  );
  const rowLocatorIndex = columnIndexes.get(postgresRowLocatorColumn);
  const sourceColumnIndexes = useMemo(() => {
    const indexes = new Map<string, number>();
    if (!result || !selectedTable) return indexes;
    result.columns.forEach((column, index) => {
      if (!columnBelongsToSelectedTable(column, selectedTable)) return;
      const sourceColumnName = mutationColumnName(column);
      if (!sourceColumnName || indexes.has(sourceColumnName.toLowerCase())) {
        return;
      }
      indexes.set(sourceColumnName.toLowerCase(), index);
    });
    return indexes;
  }, [result, selectedTable]);
  const hasPrimaryKeyLocator =
    primaryColumns.length > 0 &&
    primaryColumns.every((column) =>
      sourceColumnIndexes.has(column.name.toLowerCase()),
    );
  const hasPostgresRowLocator =
    driver === "postgres" && rowLocatorIndex !== undefined;
  const mutationEnabled = Boolean(
    result &&
    selectedTable &&
    tableDetails &&
    tableDetails.type.toUpperCase().includes("TABLE") &&
    onCommitSQL,
  );
  const editable = Boolean(
    mutationEnabled &&
    (hasPrimaryKeyLocator || hasPostgresRowLocator) &&
    onCommitSQL,
  );
  const pendingChanges = useMemo(
    () => summarizeChanges(changes, deletedRowKeys, insertedRows),
    [changes, deletedRowKeys, insertedRows],
  );
  const showChangeReview = mutationEnabled && pendingChanges.total > 0;
  const rowEntries = useMemo(
    () => [
      ...displayRows.map((row, rowIndex) => ({
        kind: "result" as const,
        row,
        rowIndex,
        rowKey: getRowKey(
          row,
          primaryColumns,
          sourceColumnIndexes,
          rowIndex,
          rowLocatorIndex,
        ),
      })),
      ...insertedRows.map((insertedRow, insertIndex) => ({
        kind: "insert" as const,
        insertedRow,
        row: insertedRowToResultRow(insertedRow, result?.columns || []),
        rowIndex: displayRows.length + insertIndex,
        rowKey: insertRowKey(insertedRow),
      })),
    ],
    [
      displayRows,
      insertedRows,
      primaryColumns,
      result?.columns,
      rowLocatorIndex,
      sourceColumnIndexes,
    ],
  );
  function cellValueForView(
    rowEntry: (typeof rowEntries)[number],
    columnName: string,
  ) {
    const rowChanges =
      rowEntry.kind === "insert"
        ? rowEntry.insertedRow.values
        : changes[rowEntry.rowKey] || {};
    const draft = rowChanges[columnName];
    if (draft) return draftValue(draft);
    const index = columnIndexes.get(columnName);
    return index === undefined ? null : rowEntry.row[index];
  }

  const filteredRowEntries = useMemo(
    () =>
      applyResultFilters(rowEntries, filters, (entry, columnName) =>
        cellValueForView(entry, columnName),
      ),
    [changes, columnIndexes, filters, rowEntries],
  );
  const viewRowEntries = useMemo(
    () =>
      sortResultRows(filteredRowEntries, sortState, (entry, columnName) =>
        cellValueForView(entry, columnName),
      ),
    [changes, columnIndexes, filteredRowEntries, sortState],
  );
  const selectedRowEntries = useMemo(
    () => viewRowEntries.filter(({ rowKey }) => selectedRowKeys.has(rowKey)),
    [selectedRowKeys, viewRowEntries],
  );
  const selectedRowCount = selectedRowEntries.length;
  const selectedExistingRowsWithoutLocator =
    selectedRowEntries.some((entry) => entry.kind === "result") && !editable;
  const selectedExistingRowKeys = useMemo(
    () =>
      selectedRowEntries
        .filter((entry) => entry.kind === "result")
        .map((entry) => entry.rowKey),
    [selectedRowEntries],
  );
  const selectedRowsAreStagedForDelete =
    selectedExistingRowKeys.length > 0 &&
    selectedExistingRowKeys.every((rowKey) => deletedRowKeys.has(rowKey));
  const canAddRow = mutationEnabled && !saving && resultColumns.length > 0;
  const canDeleteSelectedRows =
    mutationEnabled &&
    !saving &&
    selectedRowCount > 0 &&
    !selectedExistingRowsWithoutLocator;
  const editUnavailableTitle = !mutationEnabled
    ? "Run a single-table SELECT or open a table to stage row edits"
    : undefined;
  const deleteUnavailableTitle = selectedExistingRowsWithoutLocator
    ? "This result cannot identify selected rows to delete"
    : editUnavailableTitle;
  const deleteButtonTitle = selectedRowsAreStagedForDelete
    ? "Restore selected row"
    : deleteUnavailableTitle || "Delete selected row";
  const generatedSQL = useMemo(() => {
    if (!mutationEnabled || !result || !selectedTable) return "";
    return buildMutationSQL({
      changes,
      columnDetails,
      deletedRowKeys,
      driver,
      insertedRows,
      primaryColumns,
      rowLocatorIndex,
      rows: displayRows,
      selectedTable,
      sourceColumnIndexes,
      visibleColumns: resultColumns,
    });
  }, [
    changes,
    columnDetails,
    columnIndexes,
    deletedRowKeys,
    displayRows,
    driver,
    insertedRows,
    mutationEnabled,
    primaryColumns,
    result,
    rowLocatorIndex,
    selectedTable,
    sourceColumnIndexes,
    resultColumns,
  ]);

  function updateCell(
    row: unknown[],
    rowIndex: number,
    columnName: string,
    draft: CellDraft,
  ) {
    if (!result) return;
    pushUndoSnapshot();
    const rowKey = getRowKey(
      row,
      primaryColumns,
      sourceColumnIndexes,
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
      changesRef.current = next;
      return next;
    });
  }

  function updateInsertedCell(
    rowId: string,
    columnName: string,
    draft: CellDraft,
  ) {
    pushUndoSnapshot();
    setInsertedRows((current) => {
      const next = current.map((row) =>
        row.id === rowId
          ? {
              ...row,
              values: {
                ...row.values,
                [columnName]: draft,
              },
            }
          : row,
      );
      insertedRowsRef.current = next;
      return next;
    });
  }

  async function commitChanges() {
    if (!generatedSQL || !onCommitSQL || pendingChanges.total === 0) return;
    setSaving(true);
    try {
      await onCommitSQL(generatedSQL, pendingChanges);
      setDisplayRows((current) =>
        current.flatMap((row, rowIndex) => {
          const rowKey = getRowKey(
            row,
            primaryColumns,
            sourceColumnIndexes,
            rowIndex,
            rowLocatorIndex,
          );
          if (deletedRowKeys.has(rowKey)) return [];
          const rowChanges = changes[rowKey];
          if (!rowChanges) return [row];
          const next = [...row];
          for (const [columnName, draft] of Object.entries(rowChanges)) {
            const index = columnIndexes.get(columnName);
            if (index !== undefined) {
              next[index] = isNullDraft(draft) ? null : draft.value;
            }
          }
          return [next];
        }),
      );
      setDisplayRows((current) => [
        ...current,
        ...insertedRows.map((row) =>
          insertedRowToResultRow(row, result?.columns || []),
        ),
      ]);
      setChanges({});
      setDeletedRowKeys(new Set());
      setInsertedRows([]);
      setSelectedRowKeys(new Set());
      setEditingCell(null);
      changesRef.current = {};
      deletedRowKeysRef.current = new Set();
      insertedRowsRef.current = [];
      selectedRowKeysRef.current = new Set();
      undoStackRef.current = [];
      redoStackRef.current = [];
    } catch {
      // The shared commit path already reports database permission/query errors.
    } finally {
      setSaving(false);
    }
  }

  function discardChanges() {
    if (pendingChanges.total > 0) {
      pushUndoSnapshot();
    }
    setChanges({});
    setDeletedRowKeys(new Set());
    setInsertedRows([]);
    changesRef.current = {};
    deletedRowKeysRef.current = new Set();
    insertedRowsRef.current = [];
  }

  function deleteSelectedRows() {
    if (selectedRowCount === 0) return;

    const selectedInsertIds = new Set(
      selectedRowEntries
        .filter((entry) => entry.kind === "insert")
        .map((entry) => entry.insertedRow.id),
    );

    if (selectedInsertIds.size === 0 && selectedExistingRowKeys.length === 0) {
      return;
    }
    if (selectedExistingRowKeys.length > 0 && !editable) {
      toast.error("This result cannot identify rows to delete");
      return;
    }

    pushUndoSnapshot();

    if (
      selectedInsertIds.size === 0 &&
      selectedExistingRowKeys.length > 0 &&
      selectedExistingRowKeys.every((rowKey) => deletedRowKeys.has(rowKey))
    ) {
      setDeletedRowKeys((current) => {
        const next = new Set(current);
        for (const rowKey of selectedExistingRowKeys) {
          next.delete(rowKey);
        }
        deletedRowKeysRef.current = next;
        return next;
      });
      gridRef.current?.focus();
      return;
    }

    if (selectedInsertIds.size > 0) {
      setInsertedRows((current) => {
        const next = current.filter((row) => !selectedInsertIds.has(row.id));
        insertedRowsRef.current = next;
        return next;
      });
    }

    if (selectedExistingRowKeys.length > 0) {
      setDeletedRowKeys((current) => {
        const next = new Set(current);
        for (const rowKey of selectedExistingRowKeys) {
          next.add(rowKey);
        }
        deletedRowKeysRef.current = next;
        return next;
      });
      setChanges((current) => {
        const next = { ...current };
        for (const rowKey of selectedExistingRowKeys) {
          delete next[rowKey];
        }
        changesRef.current = next;
        return next;
      });
    }

    const nextSelection = new Set<string>();
    selectedRowKeysRef.current = nextSelection;
    setSelectedRowKeys(nextSelection);
    setEditingCell(null);
    gridRef.current?.focus();
  }

  async function copySelectedRows() {
    if (!exportResult || selectedRowCount === 0) return;
    const contents = serializeRowsAsTSV(exportResult);
    try {
      await writeClipboardText(contents);
      toast("Rows copied", {
        description: `${selectedRowCount} ${selectedRowCount === 1 ? "row" : "rows"} copied to the clipboard`,
      });
    } catch {
      toast.error("Could not copy rows");
    }
  }

  async function pasteRowsFromClipboard() {
    if (!mutationEnabled || saving || resultColumns.length === 0) return;
    try {
      const contents = await readClipboardText();
      const nextRows = parseClipboardRows(
        contents,
        visibleColumns,
        columnDetails,
        primaryKeyColumnSet,
      );
      if (nextRows.length === 0) {
        toast.error("Clipboard does not contain rows");
        return;
      }
      pushUndoSnapshot();
      setInsertedRows((current) => {
        const next = [...current, ...nextRows];
        insertedRowsRef.current = next;
        return next;
      });
      const selectedRows = new Set(nextRows.map(insertRowKey));
      selectedRowKeysRef.current = selectedRows;
      setSelectedRowKeys(selectedRows);
      gridRef.current?.focus();
      toast("Rows pasted", {
        description: `${nextRows.length} ${nextRows.length === 1 ? "row" : "rows"} staged for insert`,
      });
    } catch {
      toast.error("Could not paste rows");
    }
  }

  function addBlankRow() {
    if (!mutationEnabled || saving || resultColumns.length === 0) return;
    const row: PendingInsertRow = {
      id: createPendingInsertId(),
      values: {},
    };
    pushUndoSnapshot();
    setInsertedRows((current) => {
      const next = [...current, row];
      insertedRowsRef.current = next;
      return next;
    });
    const nextSelection = new Set([insertRowKey(row)]);
    selectedRowKeysRef.current = nextSelection;
    setSelectedRowKeys(nextSelection);
    gridRef.current?.focus();
  }

  function selectRow(rowKey: string) {
    const next = new Set([rowKey]);
    selectedRowKeysRef.current = next;
    setSelectedRowKeys(next);
    setEditingCell(null);
    gridRef.current?.focus();
  }

  function editCell(rowKey: string, columnName: string) {
    selectRow(rowKey);
    setEditingCell({ rowKey, columnName });
  }

  function pushUndoSnapshot() {
    undoStackRef.current = [
      ...undoStackRef.current,
      currentEditSnapshot(),
    ].slice(-100);
    redoStackRef.current = [];
  }

  function undoEdit() {
    const previous = undoStackRef.current[undoStackRef.current.length - 1];
    if (!previous) return;
    undoStackRef.current = undoStackRef.current.slice(0, -1);
    redoStackRef.current = [...redoStackRef.current, currentEditSnapshot()];
    applyEditSnapshot(previous);
  }

  function redoEdit() {
    const next = redoStackRef.current[redoStackRef.current.length - 1];
    if (!next) return;
    redoStackRef.current = redoStackRef.current.slice(0, -1);
    undoStackRef.current = [...undoStackRef.current, currentEditSnapshot()];
    applyEditSnapshot(next);
  }

  function currentEditSnapshot(): EditSnapshot {
    return cloneEditSnapshot({
      changes: changesRef.current,
      deletedRowKeys: Array.from(deletedRowKeysRef.current),
      insertedRows: insertedRowsRef.current,
      selectedRowKeys: Array.from(selectedRowKeysRef.current),
    });
  }

  function applyEditSnapshot(snapshot: EditSnapshot) {
    const next = cloneEditSnapshot(snapshot);
    const nextDeletedRows = new Set(next.deletedRowKeys);
    const nextSelectedRows = new Set(next.selectedRowKeys);
    changesRef.current = next.changes;
    deletedRowKeysRef.current = nextDeletedRows;
    insertedRowsRef.current = next.insertedRows;
    selectedRowKeysRef.current = nextSelectedRows;
    setChanges(next.changes);
    setDeletedRowKeys(nextDeletedRows);
    setInsertedRows(next.insertedRows);
    setSelectedRowKeys(nextSelectedRows);
    gridRef.current?.focus();
  }

  function openFinder() {
    setFinderOpen(true);
    window.setTimeout(() => finderInputRef.current?.select(), 0);
  }

  function moveFindMatch(direction: 1 | -1) {
    if (findMatches.length === 0) return;
    setActiveFindIndex((current) =>
      (current + direction + findMatches.length) % findMatches.length,
    );
  }

  function addResultFilter(
    columnName: string,
    operator: ResultFilterOperator,
    value: string,
  ) {
    setFilters((current) => [
      ...current,
      {
        id: `${columnName}:${operator}:${value}:${Date.now()}`,
        columnName,
        operator,
        value,
      },
    ]);
  }

  function clearColumnFilter(columnName: string) {
    setFilters((current) =>
      current.filter((filter) => filter.columnName !== columnName),
    );
  }

  async function copyColumnName(columnName: string) {
    try {
      await writeClipboardText(columnName);
      toast("Column name copied", { description: columnName });
    } catch {
      toast.error("Could not copy column name");
    }
  }

  function hideColumn(columnName: string) {
    if (visibleColumns.length <= 1) {
      toast.error("At least one column must stay visible");
      return;
    }
    setHiddenColumnNames((current) => new Set(current).add(columnName));
    clearColumnFilter(columnName);
    setSortState((current) =>
      current?.columnName === columnName ? null : current,
    );
  }

  function hideEmptyColumns() {
    const emptyColumnNames = visibleColumns
      .filter((column) =>
        rowEntries.every((entry) => {
          const value = cellValueForView(entry, column.name);
          return value === null || value === undefined || value === "";
        }),
      )
      .map((column) => column.name);

    if (emptyColumnNames.length === 0) {
      toast("No empty columns found");
      return;
    }
    if (emptyColumnNames.length >= visibleColumns.length) {
      toast.error("At least one column must stay visible");
      return;
    }
    setHiddenColumnNames((current) => {
      const next = new Set(current);
      for (const columnName of emptyColumnNames) next.add(columnName);
      return next;
    });
  }

  function resetResultView() {
    setFilters([]);
    setSortState(null);
    setHiddenColumnNames(new Set());
    setOpenColumnMenuIndex(null);
  }

  const rowsForExport =
    selectedRowCount > 0
      ? selectedRowEntries.map(({ row }) => row)
      : viewRowEntries.map(({ row }) => row);

  const exportResult = result
    ? {
        ...result,
        columns: visibleColumns,
        rows: rowsForExport.map((row) =>
          visibleColumns.map((column) => {
            const index = columnIndexes.get(column.name);
            return index === undefined ? null : row[index];
          }),
        ),
      }
    : null;
  const rowVirtualizer = useVirtualizer({
    count: viewRowEntries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => resultRowHeight,
    overscan: 18,
  });
  const columnVirtualizer = useVirtualizer({
    count: visibleColumns.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => resultColumnWidth,
    horizontal: true,
    overscan: 4,
  });
  const virtualRows = rowVirtualizer.getVirtualItems();
  const virtualColumns = columnVirtualizer.getVirtualItems();
  const totalColumnWidth = columnVirtualizer.getTotalSize();
  const totalGridHeight = rowVirtualizer.getTotalSize();

  useEffect(() => {
    const viewport = scrollRef.current;
    if (!viewport) return;

    const updateScrollRange = () => {
      const nextMax = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
      setMaxScrollLeft(nextMax);
      setScrollViewportWidth(viewport.clientWidth);
      setScrollLeft(viewport.scrollLeft);
    };
    updateScrollRange();
    const observer = new ResizeObserver(updateScrollRange);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [totalColumnWidth]);
  const scrollbarThumbWidth =
    maxScrollLeft > 0
      ? Math.max(
          5,
          (scrollViewportWidth / (scrollViewportWidth + maxScrollLeft)) * 100,
        )
      : 100;
  const scrollbarThumbLeft =
    maxScrollLeft > 0
      ? (scrollLeft / maxScrollLeft) * (100 - scrollbarThumbWidth)
      : 0;
  const normalizedFinderQuery = finderQuery.trim().toLowerCase();
  const findMatches = useMemo(
    () =>
      buildFindMatches({
        query: normalizedFinderQuery,
        rows: viewRowEntries,
        visibleColumns,
        columnIndexes,
      }),
    [columnIndexes, normalizedFinderQuery, viewRowEntries, visibleColumns],
  );
  const activeFindMatch =
    findMatches.length > 0
      ? findMatches[Math.min(activeFindIndex, findMatches.length - 1)]
      : null;
  const activeColumnMatchIndexes = useMemo(
    () =>
      new Set(
        findMatches
          .filter((match) => match.kind === "column")
          .map((match) => match.columnIndex),
      ),
    [findMatches],
  );

  useEffect(() => {
    setActiveFindIndex(0);
  }, [normalizedFinderQuery]);

  useEffect(() => {
    if (finderOpen) {
      window.setTimeout(() => finderInputRef.current?.focus(), 0);
    }
  }, [finderOpen]);

  useEffect(() => {
    if (!activeFindMatch) return;
    if (activeFindMatch.kind === "cell") {
      rowVirtualizer.scrollToIndex(activeFindMatch.rowIndex, {
        align: "center",
      });
      columnVirtualizer.scrollToIndex(activeFindMatch.columnIndex, {
        align: "center",
      });
      return;
    }
    columnVirtualizer.scrollToIndex(activeFindMatch.columnIndex, {
      align: "center",
    });
  }, [activeFindMatch, columnVirtualizer, rowVirtualizer]);

  useEffect(() => {
    function handleResultsGridShortcut(event: KeyboardEvent) {
      const activeElement = document.activeElement;
      if (
        activeElement &&
        activeElement !== document.body &&
        gridRef.current &&
        !gridRef.current.contains(activeElement)
      ) {
        return;
      }
      const selection = window.getSelection();
      if (selection && selection.toString() !== "") return;

      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && key === "f") {
        event.preventDefault();
        openFinder();
        return;
      }

      if (isEditableTarget(event.target)) return;
      if (
        !event.metaKey &&
        !event.ctrlKey &&
        (key === "delete" || key === "backspace")
      ) {
        event.preventDefault();
        deleteSelectedRows();
        return;
      }

      if (!(event.metaKey || event.ctrlKey)) {
        return;
      }

      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          redoEdit();
        } else {
          undoEdit();
        }
        return;
      }
      if (key === "y") {
        event.preventDefault();
        redoEdit();
        return;
      }

      if (key === "c" && selectedRowCount > 0) {
        event.preventDefault();
        void copySelectedRows();
      }
      if (key === "v") {
        event.preventDefault();
        void pasteRowsFromClipboard();
      }
    }

    window.addEventListener("keydown", handleResultsGridShortcut);
    return () =>
      window.removeEventListener("keydown", handleResultsGridShortcut);
  }, [
    columnDetails,
    editable,
    exportResult,
    findMatches.length,
    mutationEnabled,
    primaryKeyColumnSet,
    saving,
    selectedExistingRowKeys,
    selectedRowCount,
    selectedRowEntries,
    visibleColumns,
  ]);

  const viewControlsOpen =
    finderOpen ||
    filters.length > 0 ||
    Boolean(sortState) ||
    hiddenColumnNames.size > 0;

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
      <section className="grid min-h-0 place-items-center bg-surface-900 text-warning">
        <p>Destructive query confirmation is required before execution.</p>
      </section>
    );
  }

  return (
    <section
      ref={gridRef}
      tabIndex={-1}
      className={cn(
        "grid min-h-0 overflow-hidden bg-surface-900 outline-none focus:outline-none focus-visible:outline-none",
        showChangeReview
          ? "grid-cols-[minmax(0,1fr)_minmax(260px,300px)]"
          : "grid-cols-[minmax(0,1fr)]",
      )}
    >
      <div
        className={cn(
          "grid min-h-0 min-w-0 overflow-hidden",
          viewControlsOpen
            ? "grid-rows-[32px_auto_minmax(0,1fr)]"
            : "grid-rows-[32px_minmax(0,1fr)]",
        )}
      >
        <ResultsToolbar
          affectedRows={result.affectedRows}
          canAddRow={canAddRow}
          canDeleteSelectedRows={canDeleteSelectedRows}
          deleteButtonTitle={deleteButtonTitle}
          durationMs={result.durationMs}
          editUnavailableTitle={editUnavailableTitle}
          exportResult={exportResult}
          mutationEnabled={mutationEnabled}
          pendingChanges={pendingChanges}
          rowCount={viewRowEntries.length}
          saving={saving}
          selectedRowCount={selectedRowCount}
          totalRowCount={rowEntries.length}
          truncated={result.truncated}
          visibleColumnCount={visibleColumns.length}
          onAddRow={addBlankRow}
          onCommitChanges={() => void commitChanges()}
          onDeleteSelectedRows={deleteSelectedRows}
          onDiscardChanges={discardChanges}
          onExportCSV={exportCSV}
          onExportJSON={exportJSON}
          onOpenFinder={openFinder}
        />
        {viewControlsOpen ? (
          <div className="min-w-0">
            {finderOpen ? (
              <FinderBar
                activeIndex={activeFindIndex}
                inputRef={finderInputRef}
                matchCount={findMatches.length}
                query={finderQuery}
                onChange={setFinderQuery}
                onClose={() => {
                  setFinderOpen(false);
                  gridRef.current?.focus();
                }}
                onMoveMatch={moveFindMatch}
              />
            ) : null}
            <ResultViewBar
              filters={filters}
              hiddenColumnCount={hiddenColumnNames.size}
              rowCount={viewRowEntries.length}
              sort={sortState}
              totalRowCount={rowEntries.length}
              onClearAll={resetResultView}
              onClearFilter={(id) =>
                setFilters((current) =>
                  current.filter((filter) => filter.id !== id),
                )
              }
              onClearHiddenColumns={() => setHiddenColumnNames(new Set())}
              onClearSort={() => setSortState(null)}
            />
          </div>
        ) : null}
        <div className="relative grid min-h-0 grid-rows-[34px_minmax(0,1fr)] overflow-hidden">
          <div className="relative overflow-hidden border-b border-line bg-surface-800 text-xs">
            <div
              className="relative"
              style={{
                height: resultHeaderHeight,
                minWidth: totalColumnWidth,
                width: totalColumnWidth,
              }}
            >
              {virtualColumns.map((virtualColumn) => {
                const column = visibleColumns[virtualColumn.index];
                const columnFiltered = filters.some(
                  (filter) => filter.columnName === column.name,
                );
                const columnSorted = sortState?.columnName === column.name;
                const highlighted =
                  columnFiltered ||
                  columnSorted ||
                  activeColumnMatchIndexes.has(virtualColumn.index) ||
                  (activeFindMatch?.kind === "cell" &&
                    activeFindMatch.columnIndex === virtualColumn.index);
                return (
                  <div
                    className={cn(
                      "group absolute top-0 flex items-center gap-2 border-r border-line px-3 font-medium text-zinc-300",
                      highlighted && "bg-accent/20 text-zinc-50",
                    )}
                    key={columnKey(column, virtualColumn.index)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setOpenColumnMenuIndex(virtualColumn.index);
                    }}
                    style={{
                      height: resultHeaderHeight,
                      left: virtualColumn.start - scrollLeft,
                      width: virtualColumn.size,
                    }}
                    title={columnTitle(column)}
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-1.5">
                      {primaryKeyColumnSet.has(
                        mutationColumnName(column).toLowerCase(),
                      ) ? (
                        <KeyRound
                          aria-label="Primary key"
                          className="text-key"
                          size={10}
                        />
                      ) : null}
                      <span className="truncate">{column.name}</span>
                    </span>
                    <ColumnActionsMenu
                      column={column}
                      filtered={columnFiltered}
                      open={openColumnMenuIndex === virtualColumn.index}
                      sort={sortState}
                      onAddFilter={addResultFilter}
                      onClearColumnFilter={clearColumnFilter}
                      onCopyColumnName={(columnName) =>
                        void copyColumnName(columnName)
                      }
                      onHideColumn={hideColumn}
                      onHideEmptyColumns={hideEmptyColumns}
                      onOpenChange={(open) =>
                        setOpenColumnMenuIndex(
                          open ? virtualColumn.index : null,
                        )
                      }
                      onResetView={resetResultView}
                      onSort={setSortState}
                    />
                  </div>
                );
              })}
            </div>
          </div>
          <div
            ref={scrollRef}
            className="datapanel-results-scroll min-h-0 overflow-y-auto overflow-x-auto"
            onScroll={(event) => setScrollLeft(event.currentTarget.scrollLeft)}
          >
            <div
              className="relative text-xs"
              style={{
                height: totalGridHeight,
                minWidth: totalColumnWidth,
                width: totalColumnWidth,
              }}
            >
              {virtualRows.map((virtualRow) => {
                const rowEntry = viewRowEntries[virtualRow.index];
                if (!rowEntry) return null;
                const { row, rowIndex, rowKey } = rowEntry;
                const rowChanges =
                  rowEntry.kind === "insert"
                    ? rowEntry.insertedRow.values
                    : changes[rowKey] || {};
                const rowChanged = Object.keys(rowChanges).length > 0;
                const rowInserted = rowEntry.kind === "insert";
                const rowDeleted = deletedRowKeys.has(rowKey);
                const rowSelected = selectedRowKeys.has(rowKey);
                return (
                  <div
                    data-results-row
                    className={cn(
                      "absolute left-0 cursor-default border-b border-line",
                      rowSelected &&
                        "bg-accent/10 ring-1 ring-inset ring-accent/50",
                      rowChanged && "bg-warning/10",
                      rowInserted && "bg-success/10",
                      rowDeleted && "bg-danger/15 text-danger",
                    )}
                    key={rowKey || rowIndex}
                    onMouseDown={(event) => {
                      if (isInteractiveTarget(event.target)) return;
                      selectRow(rowKey);
                    }}
                    style={{
                      height: virtualRow.size,
                      transform: `translateY(${virtualRow.start}px)`,
                      width: totalColumnWidth,
                    }}
                  >
                    {virtualColumns.map((virtualColumn) => {
                      const column = visibleColumns[virtualColumn.index];
                      const cellIndex = columnIndexes.get(column.name);
                      const cell =
                        cellIndex === undefined ? null : row[cellIndex];
                      const draft =
                        rowChanges[column.name] ||
                        getOriginalDraft(row, column.name, columnIndexes);
                      const changed = Boolean(rowChanges[column.name]);
                      const canEditCell =
                        !rowDeleted &&
                        (rowInserted ||
                          (editable && isWritableColumn(column, selectedTable)));
                      const isEditing =
                        editingCell?.rowKey === rowKey &&
                        editingCell.columnName === column.name;
                      const displayedValue =
                        changed || rowInserted ? draftValue(draft) : cell;
                      const activeCellMatch =
                        activeFindMatch?.kind === "cell" &&
                        activeFindMatch.rowIndex === virtualRow.index &&
                        activeFindMatch.columnIndex === virtualColumn.index;
                      return (
                        <div
                          className={cn(
                            "absolute top-0 flex cursor-default items-center border-r border-line px-3 py-1 align-middle text-zinc-300",
                            changed &&
                              !isEditing &&
                              "bg-warning/15 text-warning",
                            rowInserted &&
                              !isEditing &&
                              "bg-success/15 text-success",
                            rowDeleted &&
                              "bg-danger/15 text-danger line-through",
                            activeCellMatch && "bg-accent/25 text-zinc-50",
                          )}
                          key={columnKey(column, virtualColumn.index)}
                          onDoubleClick={() => {
                            if (canEditCell) editCell(rowKey, column.name);
                          }}
                          style={{
                            height: virtualRow.size,
                            left: virtualColumn.start,
                            width: virtualColumn.size,
                          }}
                        >
                          {isEditing ? (
                            <CellEditor
                              autoFocus
                              changed={changed || rowInserted}
                              disabled={saving}
                              draft={draft}
                              onCancel={() => setEditingCell(null)}
                              onCommit={(nextDraft) => {
                                setEditingCell(null);
                                if (rowEntry.kind === "insert") {
                                  updateInsertedCell(
                                    rowEntry.insertedRow.id,
                                    column.name,
                                    nextDraft,
                                  );
                                  return;
                                }
                                updateCell(row, rowIndex, column.name, {
                                  value: nextDraft.value,
                                  isNull: nextDraft.isNull,
                                  typedNull: nextDraft.typedNull,
                                });
                              }}
                            />
                          ) : (
                            <CellValue
                              value={displayedValue}
                              onInspect={
                                isInspectableValue(displayedValue)
                                  ? () =>
                                      setInspectedCell({
                                        columnName: column.name,
                                        value: displayedValue,
                                      })
                                  : undefined
                              }
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex h-2 items-end px-1">
            {maxScrollLeft > 0 ? (
              <div className="relative h-1.5 w-full rounded-full bg-surface-700">
                <div
                  className="absolute inset-y-0 rounded-full bg-scrollbar-thumb"
                  style={{
                    left: `${scrollbarThumbLeft}%`,
                    width: `${scrollbarThumbWidth}%`,
                  }}
                />
                <input
                  aria-label="Scroll results horizontally"
                  className="datapanel-horizontal-scrollbar pointer-events-auto absolute inset-0 h-full w-full"
                  max={maxScrollLeft}
                  min={0}
                  step={1}
                  type="range"
                  value={Math.min(scrollLeft, maxScrollLeft)}
                  onChange={(event) => {
                    const nextScrollLeft = Number(event.currentTarget.value);
                    if (scrollRef.current) {
                      scrollRef.current.scrollLeft = nextScrollLeft;
                    }
                    setScrollLeft(nextScrollLeft);
                  }}
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {inspectedCell ? (
        <ValueInspector
          columnName={inspectedCell.columnName}
          value={inspectedCell.value}
          onClose={() => setInspectedCell(null)}
        />
      ) : null}
      {showChangeReview ? (
        <ChangeReviewPanel
          generatedSQL={generatedSQL}
          pendingChanges={pendingChanges}
        />
      ) : null}
    </section>
  );
}

function getOriginalDraft(
  row: unknown[],
  columnName: string,
  columnIndexes: Map<string, number>,
) {
  const index = columnIndexes.get(columnName);
  return toDraft(index === undefined ? null : row[index]);
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    target.isContentEditable ||
    Boolean(target.closest(".cm-editor"))
  );
}

function isInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return (
    tagName === "button" ||
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    target.isContentEditable
  );
}
