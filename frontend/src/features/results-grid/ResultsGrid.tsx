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
import { FinderBar } from "./components/FinderBar";
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
  const [scrollLeft, setScrollLeft] = useState(0);
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
  const visibleColumns = useMemo(
    () =>
      (result?.columns || []).filter(
        (column) => column.name !== postgresRowLocatorColumn,
      ),
    [result],
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
  const selectedRowEntries = useMemo(
    () => rowEntries.filter(({ rowKey }) => selectedRowKeys.has(rowKey)),
    [rowEntries, selectedRowKeys],
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
  const canAddRow = mutationEnabled && !saving && visibleColumns.length > 0;
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
      visibleColumns,
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
    visibleColumns,
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
    if (!mutationEnabled || saving || visibleColumns.length === 0) return;
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
    if (!mutationEnabled || saving || visibleColumns.length === 0) return;
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

  const rows = displayRows;
  const rowsForExport =
    selectedRowCount > 0
      ? selectedRowEntries.map(({ row }) => row)
      : rows;

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
    count: rowEntries.length,
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
  const normalizedFinderQuery = finderQuery.trim().toLowerCase();
  const findMatches = useMemo(
    () =>
      buildFindMatches({
        query: normalizedFinderQuery,
        rows: rowEntries,
        visibleColumns,
        columnIndexes,
      }),
    [columnIndexes, normalizedFinderQuery, rowEntries, visibleColumns],
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
      <div className="grid min-h-0 min-w-0 grid-rows-[32px_auto_minmax(0,1fr)] overflow-hidden">
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
          rowCount={rowEntries.length}
          saving={saving}
          selectedRowCount={selectedRowCount}
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
        <div className="grid min-h-0 grid-rows-[34px_minmax(0,1fr)] overflow-hidden">
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
                const highlighted =
                  activeColumnMatchIndexes.has(virtualColumn.index) ||
                  (activeFindMatch?.kind === "cell" &&
                    activeFindMatch.columnIndex === virtualColumn.index);
                return (
                  <div
                    className={cn(
                      "absolute top-0 flex items-center border-r border-line px-3 font-medium text-zinc-300",
                      highlighted && "bg-accent/20 text-zinc-50",
                    )}
                    key={columnKey(column, virtualColumn.index)}
                    style={{
                      height: resultHeaderHeight,
                      left: virtualColumn.start - scrollLeft,
                      width: virtualColumn.size,
                    }}
                    title={columnTitle(column)}
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
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
                  </div>
                );
              })}
            </div>
          </div>
          <div
            ref={scrollRef}
            className="datapanel-results-scroll min-h-0 overflow-auto"
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
                const rowEntry = rowEntries[virtualRow.index];
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
