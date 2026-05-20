import { Database, Plus, Settings } from "lucide-react";
import { SchemaBrowser } from "../features/schema-browser/SchemaBrowser";
import { cn } from "../lib/cn";
import type {
  ConnectionProfile,
  SchemaSummary,
  TableDetails,
  TableSummary,
} from "../lib/types";
import { Button } from "./ui/Button";
import { useSidebar } from "./ui/sidebar";

interface Props {
  activeConnectionId: string;
  activeProfile: ConnectionProfile | null;
  profiles: ConnectionProfile[];
  schemas: SchemaSummary[];
  selectedTable: TableSummary | null;
  tableDetails: TableDetails | null;
  tablesBySchema: Record<string, TableSummary[]>;
  onAddConnection(): void;
  onConnect(profile: ConnectionProfile): Promise<void>;
  onEditConnection(): void;
  onOpenSettings(): void;
  onRefresh(): Promise<void>;
  onSelectTable(table: TableSummary): Promise<void>;
}

export function AppSidebar({
  activeConnectionId,
  activeProfile,
  profiles,
  schemas,
  selectedTable,
  tableDetails,
  tablesBySchema,
  onAddConnection,
  onConnect,
  onEditConnection,
  onOpenSettings,
  onRefresh,
  onSelectTable,
}: Props) {
  const sidebar = useSidebar();

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 bg-surface-800 transition-[width] duration-150",
        sidebar.open ? "w-[368px]" : "w-12",
      )}
    >
      <div className="flex w-12 flex-col items-center gap-2 border-r border-line px-2 py-3">
        <div className="mb-2 flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
        </div>

        <div className="grid h-7 w-7 place-items-center rounded-full bg-blue-500 text-[11px] font-semibold text-white">
          SQ
        </div>

        <div className="flex flex-1 flex-col gap-2">
          {profiles.map((profile) => (
            <Button
              key={profile.id}
              size="icon"
              className={cn(
                activeConnectionId === profile.id
                  ? "border-line bg-surface-700 text-white"
                  : "text-zinc-500",
              )}
              onClick={() => void onConnect(profile)}
              title={profile.name}
            >
              <Database size={14} style={{ color: profile.color }} />
            </Button>
          ))}

          <Button
            className="border-dashed border-line text-zinc-500"
            size="icon"
            onClick={onAddConnection}
            title="Add connection"
          >
            <Plus size={14} />
          </Button>
        </div>

        <Button
          className="text-zinc-500"
          size="icon"
          onClick={onOpenSettings}
          title="Settings"
        >
          <Settings size={14} />
        </Button>
      </div>

      {sidebar.open ? (
        <SchemaBrowser
          activeConnectionId={activeConnectionId}
          activeProfile={activeProfile}
          schemas={schemas}
          selectedTable={selectedTable}
          tableDetails={tableDetails}
          tablesBySchema={tablesBySchema}
          onEditConnection={onEditConnection}
          onRefresh={onRefresh}
          onSelectTable={onSelectTable}
        />
      ) : null}
    </aside>
  );
}
