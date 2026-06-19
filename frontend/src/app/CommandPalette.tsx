import { Command } from "cmdk";
import {
  Bot,
  Clock3,
  Database,
  FileQuestion,
  Monitor,
  Moon,
  PanelBottom,
  Plus,
  RefreshCw,
  Settings,
  Sun,
  Table2,
} from "lucide-react";
import { useMemo } from "react";
import type { ConnectionProfile, TableSummary } from "../lib/types";

type ThemeMode = "light" | "dark" | "system";

interface Props {
  open: boolean;
  activeProfile: ConnectionProfile | null;
  currentTheme: string;
  tablesBySchema: Record<string, TableSummary[]>;
  onClose(): void;
  onAddConnection(): void;
  onEditConnection(): void;
  onOpenAI(): void;
  onOpenHistory(): void;
  onOpenSettings(): void;
  onRefreshMetadata(): void;
  onSetTheme(theme: ThemeMode): void;
  onShowResults(): void;
  onSelectTable(table: TableSummary): void;
}

export function CommandPalette({
  open,
  activeProfile,
  currentTheme,
  tablesBySchema,
  onClose,
  onAddConnection,
  onEditConnection,
  onOpenAI,
  onOpenHistory,
  onOpenSettings,
  onRefreshMetadata,
  onSetTheme,
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

  function run(action: () => void | Promise<void>) {
    void Promise.resolve(action()).catch((error) => {
      console.warn("Command failed", error);
    });
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-overlay/45 p-[14vh_16px_16px]"
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
          className="h-12 w-full appearance-none rounded-none border-x-0 border-b border-t-0 border-line bg-surface-900 px-4 text-sm outline-none focus:border-line focus:shadow-none"
          placeholder="Jump to tables or run actions..."
        />
        <Command.List className="max-h-[calc(68vh-48px)] overflow-y-auto p-2">
          <Command.Empty className="px-3 py-6 text-center text-sm text-muted">
            No commands found.
          </Command.Empty>

          <Command.Group heading="Actions">
            <Command.Item
              value="open ai panel assistant chat"
              onSelect={() => run(onOpenAI)}
            >
              <Bot size={14} />
              <span>Open AI panel</span>
            </Command.Item>
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

          <Command.Group heading="Theme">
            {themeCommands.map((item) => (
              <Command.Item
                key={item.value}
                value={`theme ${item.value} appearance ${item.label}`}
                onSelect={() => run(() => onSetTheme(item.value))}
              >
                {item.icon}
                <span>{item.label}</span>
                {(currentTheme || "system") === item.value ? (
                  <span className="ml-auto text-xs text-muted">Current</span>
                ) : null}
              </Command.Item>
            ))}
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

const themeCommands: Array<{
  value: ThemeMode;
  label: string;
  icon: JSX.Element;
}> = [
  { value: "light", label: "Light theme", icon: <Sun size={14} /> },
  { value: "dark", label: "Dark theme", icon: <Moon size={14} /> },
  { value: "system", label: "System theme", icon: <Monitor size={14} /> },
];
