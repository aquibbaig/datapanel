export interface CellDraft {
  value: string;
  isNull: boolean;
  typedNull?: boolean;
}

export type RowChanges = Record<string, CellDraft>;
export type ChangeMap = Record<string, RowChanges>;

export interface PendingInsertRow {
  id: string;
  values: RowChanges;
}

export interface EditSnapshot {
  changes: ChangeMap;
  deletedRowKeys: string[];
  insertedRows: PendingInsertRow[];
  selectedRowKeys: string[];
}

export interface ChangeSummary {
  cells: number;
  rows: number;
  total: number;
  items: ChangeItem[];
}

export interface ChangeItem {
  rowKey: string;
  kind: "delete" | "insert" | "update";
  label: string;
  columns: string[];
}

export type FindMatch =
  | { kind: "column"; columnIndex: number }
  | { kind: "cell"; rowIndex: number; columnIndex: number };

export type SQLDriver = "postgres" | "mysql" | "bigquery";
