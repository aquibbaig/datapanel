import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  Check,
  ChevronsUpDown,
  Database,
  Plus,
  Search,
  Settings,
} from "lucide-react";
import { useState } from "react";
import logoMarkUrl from "../../assets/logo-mark.png";
import { SchemaBrowser } from "../features/schema-browser/SchemaBrowser";
import { cn } from "../lib/cn";
import type {
  ConnectionProfile,
  SchemaSummary,
  TableDetails,
  TableSummary,
} from "../lib/types";
import { useSidebar } from "./ui/sidebar";

interface Props {
  activeConnectionId: string;
  activeProfile: ConnectionProfile | null;
  profiles: ConnectionProfile[];
  schemas: SchemaSummary[];
  inspectingTable: TableSummary | null;
  selectedTable: TableSummary | null;
  tableDetails: TableDetails | null;
  tablesBySchema: Record<string, TableSummary[]>;
  onAddConnection(): void;
  onConnect(profile: ConnectionProfile): Promise<void>;
  onEditConnection(): void;
  onRefresh(): Promise<void>;
  onInspectTable(table: TableSummary): Promise<TableDetails | null>;
  onPrefetchTableDetails(table: TableSummary): Promise<void>;
}

export function AppSidebar({
  activeConnectionId,
  activeProfile,
  profiles,
  schemas,
  inspectingTable,
  selectedTable,
  tableDetails,
  tablesBySchema,
  onAddConnection,
  onConnect,
  onEditConnection,
  onRefresh,
  onInspectTable,
  onPrefetchTableDetails,
}: Props) {
  const sidebar = useSidebar();

  return (
    <aside
      className={cn(
        "h-full shrink-0 overflow-hidden bg-sidebar transition-[width] duration-150",
        sidebar.open ? "w-[320px]" : "w-0",
      )}
    >
      {sidebar.open ? (
        <div className="flex h-full min-h-0 min-w-0 flex-col">
          <WorkspaceSelector
            activeConnectionId={activeConnectionId}
            activeProfile={activeProfile}
            profiles={profiles}
            onAddConnection={onAddConnection}
            onConnect={onConnect}
            onEditActive={onEditConnection}
          />
          <SchemaBrowser
            activeConnectionId={activeConnectionId}
            inspectingTable={inspectingTable}
            schemas={schemas}
            selectedTable={selectedTable}
            tableDetails={tableDetails}
            tablesBySchema={tablesBySchema}
            onInspectTable={onInspectTable}
            onPrefetchTableDetails={onPrefetchTableDetails}
            onRefresh={onRefresh}
          />
        </div>
      ) : null}
    </aside>
  );
}

function WorkspaceSelector({
  activeConnectionId,
  activeProfile,
  profiles,
  onAddConnection,
  onConnect,
  onEditActive,
}: {
  activeConnectionId: string;
  activeProfile: ConnectionProfile | null;
  profiles: ConnectionProfile[];
  onAddConnection(): void;
  onConnect(profile: ConnectionProfile): Promise<void>;
  onEditActive(): void;
}) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const filteredProfiles = profiles.filter((profile) =>
    [
      profile.name,
      profile.driver,
      profile.host,
      profile.database,
      profile.username,
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery),
  );

  return (
    <div className="flex shrink-0 items-center px-1 py-2">
      <DropdownMenu.Root onOpenChange={(open) => !open && setQuery("")}>
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-2 text-left transition">
          <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg border border-line bg-control/[0.04]">
            <img
              alt="DataPanel"
              className="h-full w-full object-cover"
              src={logoMarkUrl}
            />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-zinc-100">
              {activeProfile ? activeProfile.name : "No workspace"}
            </span>
            <span className="block truncate text-[11px] text-muted">
              {activeProfile
                ? `${driverLabel(activeProfile.driver)} · ${activeProfile.database || activeProfile.host}`
                : "Select a connection"}
            </span>
          </span>
          <DropdownMenu.Trigger asChild>
            <button
              className="ml-auto grid h-7 w-7 shrink-0 place-items-center rounded-md text-zinc-500 transition hover:bg-control/[0.03] hover:text-zinc-200"
              title="Switch workspace"
              type="button"
            >
              <ChevronsUpDown size={13} />
            </button>
          </DropdownMenu.Trigger>
        </div>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            side="right"
            className="z-50 mt-1 w-[320px] overflow-hidden rounded-lg border border-line bg-surface-850 p-2 text-sm text-zinc-200 shadow-2xl"
          >
            <div className="relative mb-2">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500"
                size={14}
              />
              <input
                autoFocus
                className="h-8 rounded-md border-line bg-surface-900 pl-8 pr-2 text-sm text-zinc-200 placeholder:text-zinc-600"
                placeholder="Search workspaces"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
              />
            </div>

            <div className="max-h-[260px] overflow-auto">
              {filteredProfiles.map((profile) => {
                const active = profile.id === activeConnectionId;
                return (
                  <DropdownMenu.Item
                    key={profile.id}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 outline-none transition hover:bg-control/[0.03] data-[highlighted]:bg-control/[0.03]"
                    onSelect={() => void onConnect(profile)}
                  >
                    <Database size={14} className="-mt-5" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-zinc-100">
                        {profile.name}
                      </span>
                      <span className="block truncate text-[11px] text-muted">
                        {profile.host}:{profile.port} · {profile.database}
                      </span>
                    </span>
                    {active ? (
                      <Check size={14} className="shrink-0 text-accent" />
                    ) : null}
                  </DropdownMenu.Item>
                );
              })}
              {filteredProfiles.length === 0 ? (
                <div className="px-2 py-6 text-center text-xs text-muted">
                  No matching workspaces.
                </div>
              ) : null}
            </div>

            <DropdownMenu.Separator className="my-2 h-px bg-line" />
            <DropdownMenu.Item
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 outline-none transition hover:bg-control/[0.03] data-[highlighted]:bg-control/[0.03]"
              onSelect={onAddConnection}
            >
              <Plus size={14} className="text-zinc-500" />
              Add workspace
            </DropdownMenu.Item>
            {activeProfile ? (
              <DropdownMenu.Item
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-muted outline-none transition hover:bg-control/[0.03] data-[highlighted]:bg-control/[0.03]"
                onSelect={onEditActive}
              >
                <Settings size={14} className="text-zinc-500" />
                Edit current workspace
              </DropdownMenu.Item>
            ) : null}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}

function driverLabel(driver: string) {
  if (driver === "mysql") return "MySQL";
  if (driver === "bigquery") return "BigQuery";
  return "Postgres";
}
