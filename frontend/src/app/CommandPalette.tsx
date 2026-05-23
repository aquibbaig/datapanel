import { Command } from "cmdk";
import {
  Clock3,
  Database,
  FileQuestion,
  PanelBottom,
  Plus,
  RefreshCw,
  Settings,
  Table2,
} from "lucide-react";
import { useMemo } from "react";
import type { ConnectionProfile, TableSummary } from "../lib/types";

interface Props {
  open: boolean;
  activeProfile: ConnectionProfile | null;
  tablesBySchema: Record<string, TableSummary[]>;
  onClose(): void;
  onAddConnection(): void;
  onEditConnection(): void;
  onOpenHistory(): void;
  onOpenSettings(): void;
  onRefreshMetadata(): void;
  onShowResults(): void;
  onSelectTable(table: TableSummary): void;
}

export function CommandPalette({
  open,
  activeProfile,
  tablesBySchema,
  onClose,
  onAddConnection,
  onEditConnection,
  onOpenHistory,
  onOpenSettings,
  onRefreshMetadata,
  onShowResults,
  onSelectTable,
}: Props) {
  const tables = useMemo(
    () =>
      Object.entries(tablesBySchema).flatMap(([schema, schemaTables]) =>
        schemaTables.map((table) => ({ ...table, schema: table.schema || schema })),
      ),
    [tablesBySchema],
  );

  if (!open) return null;

  function run(action: () => void) {
    action();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/45 p-[14vh_16px_16px]"
      onMouseDown={onClose}
    >
      <Command
        className="mx-auto flex max-h-[68vh] w-full max-w-[640px] flex-col overflow-hidden rounded-ui border border-line bg-surface-900 shadow-2xl"
        loop
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <Command.Input
          autoFocus
          className="h-12 border-0 border-b border-line bg-surface-900 px-4 text-sm outline-none focus:border-line focus:shadow-none"
          placeholder="Jump to tables or run actions..."
        />
        <Command.List className="max-h-[calc(68vh-48px)] overflow-y-auto p-2">
          <Command.Empty className="px-3 py-6 text-center text-sm text-muted">
            No commands found.
          </Command.Empty>

          <Command.Group heading="Actions">
            <Command.Item
              value="refresh metadata reload schemas tables"
              disabled={!activeProfile}
              onSelect={() => run(onRefreshMetadata)}
            >
              <RefreshCw size={14} />
              <span>Refresh metadata</span>
            </Command.Item>
            <Command.Item
              value="query history recent sql"
              onSelect={() => run(onOpenHistory)}
            >
              <Clock3 size={14} />
              <span>Open query history</span>
            </Command.Item>
            <Command.Item
              value="results query output grid"
              onSelect={() => run(onShowResults)}
            >
              <PanelBottom size={14} />
              <span>Show query results</span>
            </Command.Item>
            <Command.Item value="settings preferences" onSelect={() => run(onOpenSettings)}>
              <Settings size={14} />
              <span>Open settings</span>
            </Command.Item>
            <Command.Item value="add new connection database" onSelect={() => run(onAddConnection)}>
              <Plus size={14} />
              <span>Add connection</span>
            </Command.Item>
            <Command.Item
              value="edit active connection database"
              disabled={!activeProfile}
              onSelect={() => run(onEditConnection)}
            >
              <Database size={14} />
              <span>Edit active connection</span>
            </Command.Item>
          </Command.Group>

          <Command.Group heading="Tables">
            {tables.map((table) => (
              <Command.Item
                key={`${table.schema}.${table.name}`}
                value={`${table.schema}.${table.name}`}
                keywords={[table.schema, table.name, table.type]}
                onSelect={() => run(() => onSelectTable(table))}
              >
                {table.type.includes("VIEW") ? <FileQuestion size={14} /> : <Table2 size={14} />}
                <span className="min-w-0 flex-1 truncate">{table.name}</span>
                <span className="truncate text-xs text-muted">{table.schema}</span>
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}
