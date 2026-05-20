import { ChevronDown, Columns3, Database, Pencil, Table2 } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { cn } from "../../lib/cn";
import type {
  ConnectionProfile,
  SchemaSummary,
  TableDetails,
  TableSummary,
} from "../../lib/types";

interface Props {
  activeConnectionId: string;
  activeProfile: ConnectionProfile | null;
  schemas: SchemaSummary[];
  tablesBySchema: Record<string, TableSummary[]>;
  selectedTable: TableSummary | null;
  tableDetails: TableDetails | null;
  onEditConnection(): void;
  onRefresh(): Promise<void>;
  onSelectTable(table: TableSummary): Promise<void>;
}

export function SchemaBrowser({
  activeConnectionId,
  activeProfile,
  schemas,
  tablesBySchema,
  selectedTable,
  tableDetails,
  onEditConnection,
  onRefresh,
  onSelectTable,
}: Props) {
  return (
    <aside className="flex min-w-0 flex-col bg-surface-800 w-full pt-[11px] ml-2">
      <div className="flex h-[54px] items-center justify-between border-b border-line px-4">
        <div className="min-w-0">
          <p className="mb-0.5 text-[11px] font-semibold uppercase text-muted">
            Workspace
          </p>
          <h1 className="truncate text-lg font-semibold text-zinc-100">
            {activeProfile ? activeProfile.name : "No database"}
          </h1>
        </div>
        <Button
          className="text-zinc-400"
          size="icon"
          disabled={!activeProfile}
          onClick={onEditConnection}
          title="Edit connection"
        >
          <Pencil size={14} />
        </Button>
      </div>

      <div className="border-b border-line p-4">
        {activeProfile ? (
          <details className="group" open>
            <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-zinc-200">
              <ChevronDown
                size={14}
                className="transition group-open:rotate-0 -rotate-90"
              />
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: activeProfile.color }}
              />
              Connection
            </summary>
            <div className="mt-2 grid gap-2 rounded-ui border border-line bg-surface-850 p-2 text-xs text-zinc-400">
              <div className="flex items-center justify-between gap-2">
                <span>Host</span>
                <code className="truncate text-zinc-200">
                  {activeProfile.host}:{activeProfile.port}
                </code>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span>Database</span>
                <code className="truncate text-zinc-200">
                  {activeProfile.database}
                </code>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span>User</span>
                <code className="truncate text-zinc-200">
                  {activeProfile.username}
                </code>
              </div>
            </div>
          </details>
        ) : (
          <div className="flex flex-col gap-2 rounded-ui border border-dashed border-line bg-surface-850 p-3 text-sm text-muted">
            <Database size={14} />
            <p>Select a database from the activity bar or add a connection.</p>
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
            <Columns3 size={14} />
            Tables
          </div>
          <Button
            className="text-zinc-400"
            disabled={!activeConnectionId}
            onClick={() => void onRefresh()}
            title="Refresh metadata"
          >
            Refresh
          </Button>
        </div>

        {!activeConnectionId ? (
          <p className="text-sm text-muted">Connect to browse tables.</p>
        ) : null}

        <div className="flex flex-col gap-4">
          {schemas.map((schema) => (
            <div className="flex flex-col gap-2" key={schema.name}>
              <div className="text-xs font-semibold uppercase text-muted">
                {schema.name}
              </div>
              <div className="flex flex-col gap-1">
                {(tablesBySchema[schema.name] || []).map((table) => {
                  const active =
                    selectedTable?.schema === table.schema &&
                    selectedTable.name === table.name;
                  return (
                    <div
                      className="flex flex-col gap-2"
                      key={`${table.schema}.${table.name}`}
                    >
                      <Button
                        size="row"
                        className={cn(
                          "w-full justify-start text-left",
                          active
                            ? "bg-surface-700 text-zinc-100"
                            : "text-zinc-500 hover:bg-surface-800 hover:text-zinc-200",
                        )}
                        onClick={() => void onSelectTable(table)}
                      >
                        <Table2 size={14} />
                        <span className="min-w-0 flex-1 truncate">
                          {table.name}
                        </span>
                        <span className="text-[11px] text-muted">
                          {table.type.replace("BASE ", "")}
                        </span>
                      </Button>
                      {active && tableDetails ? (
                        <div className="ml-6 flex flex-col gap-1 border-l border-line pl-2">
                          {tableDetails.columns.map((column) => (
                            <Button
                              key={column.name}
                              size="row"
                              className="w-full justify-between text-left text-xs text-zinc-400 hover:bg-surface-800 hover:text-zinc-100"
                            >
                              <span className="min-w-0 truncate">
                                {column.name}
                              </span>
                              <code className="text-[11px] text-muted">
                                {column.dataType}
                              </code>
                            </Button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
