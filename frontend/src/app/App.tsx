import { Bot, Clock3, PanelRight, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Toaster } from "sonner";
import { AppSidebar } from "../components/AppSidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "../components/ui/breadcrumb";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { Separator } from "../components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "../components/ui/sidebar";
import { ConnectionPanel } from "../features/connections/ConnectionPanel";
import { QueryEditor } from "../features/query-editor/QueryEditor";
import { ResultsGrid } from "../features/results-grid/ResultsGrid";
import { SettingsPanel } from "../features/settings/SettingsPanel";
import { TableDataEditor } from "../features/table-editor/TableDataEditor";
import { cn } from "../lib/cn";
import type { ConnectionProfile, TableDetails } from "../lib/types";
import { CommandPalette } from "./CommandPalette";
import { RightActionPanel, type RightPanel } from "./RightActionPanel";
import { useDataPanelState } from "./useDataPanelState";
import { EmptyWorkspace, WorkspaceLoader } from "./WorkspaceStates";

const rightPanelStorageKey = "datapanel.rightPanel";
const multiQueryWorkspacesEnabled = true;
const maxQueryWorkspaces = 3;
const initialQueryWorkspace = {
  id: "query-1",
  title: "Query 1",
  sql: "",
};

interface QueryWorkspace {
  id: string;
  title: string;
  sql: string;
}

export function App() {
  const model = useDataPanelState();
  const [connectionModalOpen, setConnectionModalOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rightPanel, setRightPanel] = useState<RightPanel | null>(() =>
    loadLastRightPanel(),
  );
  const [bottomView, setBottomView] = useState<"results" | "table">("results");
  const [queryWorkspaces, setQueryWorkspaces] = useState<QueryWorkspace[]>([
    initialQueryWorkspace,
  ]);
  const [activeQueryWorkspaceId, setActiveQueryWorkspaceId] = useState(
    initialQueryWorkspace.id,
  );
  const [renamingQueryWorkspaceId, setRenamingQueryWorkspaceId] = useState<
    string | null
  >(null);
  const [queryWorkspaceTitleDraft, setQueryWorkspaceTitleDraft] = useState("");
  const [editingProfile, setEditingProfile] =
    useState<ConnectionProfile | null>(null);
  const activeQueryWorkspace =
    queryWorkspaces.find((workspace) => workspace.id === activeQueryWorkspaceId) ??
    queryWorkspaces[0];
  const sqlDraft = activeQueryWorkspace?.sql ?? "";

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  function openNewConnection() {
    setEditingProfile(null);
    setConnectionModalOpen(true);
  }

  function openEditConnection(profile: ConnectionProfile | null) {
    setEditingProfile(profile);
    setConnectionModalOpen(true);
  }

  async function connectProfile(profile: ConnectionProfile) {
    try {
      await model.connect(profile.id);
    } catch {
      openEditConnection(profile);
    }
  }

  function openRightPanel(panel: RightPanel) {
    saveLastRightPanel(panel);
    setRightPanel(panel);
  }

  function toggleRightPanel(panel: RightPanel) {
    setRightPanel((current) => {
      if (current === panel) return null;
      saveLastRightPanel(panel);
      return panel;
    });
  }

  function toggleLastRightPanel() {
    setRightPanel((current) => {
      if (current) return null;
      const panel = loadLastRightPanel() ?? "history";
      saveLastRightPanel(panel);
      return panel;
    });
  }

  async function selectTableForEditing(
    table: Parameters<typeof model.inspectTable>[0],
  ) {
    if (
      model.selectedTable?.schema === table.schema &&
      model.selectedTable.name === table.name &&
      model.tableDetails
    ) {
      setBottomView("table");
      return;
    }
    await model.inspectTable(table);
    setBottomView("table");
  }

  async function runTypedSQL(sql: string, confirmDestructive = false) {
    setBottomView("results");
    return model.runQuery(sql, confirmDestructive, {
      historyMode: "query",
      recordHistory: true,
    });
  }

  async function explainTypedSQL(sql: string) {
    setBottomView("results");
    return model.explainQuery(sql, {
      historyMode: "explain",
      recordHistory: true,
    });
  }

  async function executeAISQL(sql: string) {
    setBottomView("results");
    return model.runQuery(sql, true, {
      historyMode: "query",
      recordHistory: true,
    });
  }

  function loadHistoryQuery(sql: string) {
    setSqlDraft(sql);
    setRightPanel(null);
  }

  function loadSQL(sql: string) {
    setSqlDraft(sql);
  }

  function setSqlDraft(sql: string) {
    setQueryWorkspaces((current) =>
      current.map((workspace) =>
        workspace.id === activeQueryWorkspaceId ? { ...workspace, sql } : workspace,
      ),
    );
  }

  function createQueryWorkspace() {
    if (queryWorkspaces.length >= maxQueryWorkspaces) return;
    const nextNumber = queryWorkspaces.length + 1;
    const workspace = {
      id: crypto.randomUUID(),
      title: `Query ${nextNumber}`,
      sql: "",
    };
    setQueryWorkspaces((current) => [...current, workspace]);
    setActiveQueryWorkspaceId(workspace.id);
  }

  function renameQueryWorkspace(workspace: QueryWorkspace, title: string) {
    const normalized = title.trim() || "Untitled query";
    setRenamingQueryWorkspaceId(null);
    setQueryWorkspaceTitleDraft("");
    if (normalized === workspace.title) return;
    setQueryWorkspaces((current) =>
      current.map((item) =>
        item.id === workspace.id ? { ...item, title: normalized } : item,
      ),
    );
  }

  function deleteQueryWorkspace(workspace: QueryWorkspace) {
    const deletedIndex = queryWorkspaces.findIndex(
      (item) => item.id === workspace.id,
    );
    let remaining = queryWorkspaces.filter((item) => item.id !== workspace.id);
    let nextActiveId = activeQueryWorkspaceId;

    if (remaining.length === 0) {
      const replacement = {
        id: crypto.randomUUID(),
        title: "Query 1",
        sql: "",
      };
      remaining = [replacement];
      nextActiveId = replacement.id;
    } else if (workspace.id === activeQueryWorkspaceId) {
      nextActiveId =
        remaining[Math.min(Math.max(deletedIndex, 0), remaining.length - 1)]?.id ??
        remaining[0].id;
    }

    setQueryWorkspaces(remaining);
    setActiveQueryWorkspaceId(nextActiveId);
  }

  return (
    <>
      <Toaster closeButton position="top-right" theme="dark" />
      <CommandPalette
        activeProfile={model.activeProfile}
        open={commandOpen}
        tablesBySchema={model.tablesBySchema}
        onAddConnection={openNewConnection}
        onClose={() => setCommandOpen(false)}
        onEditConnection={() => openEditConnection(model.activeProfile)}
        onOpenHistory={() => openRightPanel("history")}
        onOpenSettings={() => setSettingsOpen(true)}
        onRefreshMetadata={() => void model.refreshMetadata()}
        onSelectTable={(table) => void selectTableForEditing(table)}
        onShowResults={() => setBottomView("results")}
      />
      <SidebarProvider>
        <AppSidebar
          activeConnectionId={model.activeConnectionId}
          activeProfile={model.activeProfile}
          profiles={model.profiles}
          schemas={model.schemas}
          selectedTable={model.selectedTable}
          tableDetails={model.tableDetails}
          tablesBySchema={model.tablesBySchema}
          onAddConnection={openNewConnection}
          onConnect={connectProfile}
          onEditConnection={() => openEditConnection(model.activeProfile)}
          onOpenSettings={() => setSettingsOpen(true)}
          onRefresh={model.refreshMetadata}
          onSelectTable={selectTableForEditing}
        />

        <SidebarInset
          className={cn("grid grid-rows-[56px_minmax(0,1fr)_28px]")}
        >
          <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-line px-4">
            <div className="flex min-w-0 items-center gap-2">
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="mr-1" />
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbPage>
                      {model.selectedTable
                        ? model.selectedTable.name
                        : "Query workspace"}
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </div>

            <div className="flex min-w-0 items-center gap-2">
              <div
                className="hidden h-7 w-[320px] cursor-pointer items-center gap-2 rounded-full border border-line bg-surface-850 px-2 text-sm text-muted transition hover:border-zinc-600 hover:text-zinc-300 lg:flex"
                role="button"
                tabIndex={0}
                onClick={() => setCommandOpen(true)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setCommandOpen(true);
                  }
                }}
              >
                <Search size={14} />
                <span className="truncate">
                  Search tables, columns, queries
                </span>
                <kbd className="ml-auto h-5 flex flex-col justify-center items-center rounded-md border border-line bg-surface-700 px-1.5 py-0.5 text-[11px] text-zinc-300">
                  Cmd K
                </kbd>
              </div>
              <Button
                className={cn(
                  rightPanel === "ai" && "bg-surface-700 text-zinc-200",
                )}
                size="icon"
                onClick={() => toggleRightPanel("ai")}
                title="AI assistant"
              >
                <Bot size={14} />
              </Button>
              <Button
                className={cn(
                  rightPanel === "history" && "bg-surface-700 text-zinc-200",
                )}
                size="icon"
                onClick={() => toggleRightPanel("history")}
                title="Query history"
              >
                <Clock3 size={14} />
              </Button>
              <Button
                className={cn(rightPanel && "bg-surface-700 text-zinc-200")}
                size="icon"
                onClick={toggleLastRightPanel}
                title="Panels"
              >
                <PanelRight size={14} />
              </Button>
            </div>
          </header>

          <section className="flex min-h-0 overflow-hidden">
            {model.initializing ? (
              <WorkspaceLoader />
            ) : model.activeProfile ? (
              <div className="grid min-h-0 min-w-0 flex-1 grid-rows-[48%_minmax(0,1fr)]">
                <QueryEditor
                  activeConnectionId={model.activeConnectionId}
                  activeProfile={model.activeProfile}
                  activeWorkspaceId={activeQueryWorkspaceId}
                  busy={Boolean(model.runningRequestId)}
                  multiWorkspaceEnabled={multiQueryWorkspacesEnabled}
                  renamingWorkspaceId={renamingQueryWorkspaceId}
                  schemas={model.schemas}
                  settings={model.settings}
                  tablesBySchema={model.tablesBySchema}
                  titleDraft={queryWorkspaceTitleDraft}
                  onCancel={model.cancelQuery}
                  onCreateWorkspace={createQueryWorkspace}
                  onDeleteWorkspace={deleteQueryWorkspace}
                  onRenameCommit={renameQueryWorkspace}
                  onRenameStart={(workspace) => {
                    setRenamingQueryWorkspaceId(workspace.id);
                    setQueryWorkspaceTitleDraft(workspace.title);
                  }}
                  onSelectWorkspace={setActiveQueryWorkspaceId}
                  onTitleDraftChange={setQueryWorkspaceTitleDraft}
                  value={sqlDraft}
                  workspaces={queryWorkspaces}
                  onChange={setSqlDraft}
                  onExplain={explainTypedSQL}
                  onRun={runTypedSQL}
                />
                <section className="grid min-h-0 grid-rows-[44px_minmax(0,1fr)] bg-surface-900">
                  <div className="flex h-11 shrink-0 items-center justify-between border-b border-line px-2">
                    <div className="flex items-center gap-1">
                      <Button
                        className="h-7"
                        variant={bottomView === "results" ? "primary" : "ghost"}
                        onClick={() => setBottomView("results")}
                      >
                        Results
                      </Button>
                      <Button
                        className="h-7"
                        disabled={!model.selectedTable}
                        variant={bottomView === "table" ? "primary" : "ghost"}
                        onClick={() => setBottomView("table")}
                      >
                        Table data
                      </Button>
                    </div>
                    {model.selectedTable ? (
                      <span className="truncate px-2 text-xs text-muted">
                        {model.selectedTable.schema}.{model.selectedTable.name}
                      </span>
                    ) : null}
                  </div>
                  {bottomView === "table" ? (
                    <TableDataEditor
                      activeConnectionId={model.activeConnectionId}
                      activeProfile={model.activeProfile}
                      selectedTable={model.selectedTable}
                      settings={model.settings}
                      tableDetails={model.tableDetails}
                      onCommitSQL={(sql, summary) =>
                        model.runQuery(sql, true, {
                          successMessage: `${summary.total} row(s) changed`,
                          successTitle: "Query successful",
                        })
                      }
                    />
                  ) : (
                    <ResultsGrid
                      primaryKeyColumns={primaryKeyColumns(model.tableDetails)}
                      result={model.queryResult}
                    />
                  )}
                </section>
              </div>
            ) : (
              <EmptyWorkspace onCreateConnection={openNewConnection} />
            )}

            <aside
              className={cn(
                "min-h-0 shrink-0 overflow-hidden border-l border-line bg-surface-900 transition-[width] duration-200 ease-out",
                rightPanel ? rightPanelWidth(rightPanel) : "w-0 border-l-0",
              )}
            >
              {rightPanel ? (
                <div className={cn("h-full", rightPanelInnerWidth(rightPanel))}>
                  <RightActionPanel
                    panel={rightPanel}
                    activeProfile={model.activeProfile}
                    queryHistory={model.queryHistory}
                    schemas={model.schemas}
                    tableDetails={model.tableDetails}
                    tablesBySchema={model.tablesBySchema}
                    onExecuteSQL={executeAISQL}
                    onLoadSQL={loadSQL}
                    onUseQuery={loadHistoryQuery}
                  />
                </div>
              ) : null}
            </aside>
          </section>

          <footer className="flex items-center justify-between border-t border-line px-3 text-xs text-zinc-400">
            <span className="group relative flex min-w-0 items-center gap-2">
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  statusDot(model.status.tone, Boolean(model.activeProfile)),
                )}
              />
              <span className="truncate">
                {model.activeProfile
                  ? model.activeProfile.name
                  : "No connection"}
              </span>
              <span className="pointer-events-none absolute bottom-6 left-0 z-40 hidden min-w-[260px] rounded-ui border border-line bg-surface-800 p-3 text-left text-xs text-zinc-300 shadow-xl group-hover:block">
                {connectionTooltip(model)}
              </span>
            </span>
            <span>
              {model.activeProfile
                ? `${model.activeProfile.host}:${model.activeProfile.port}`
                : ""}
            </span>
          </footer>
        </SidebarInset>

        <Modal
          title={editingProfile ? "Edit connection" : "Add connection"}
          open={connectionModalOpen}
          onClose={() => setConnectionModalOpen(false)}
        >
          <ConnectionPanel
            busy={model.busy}
            initialProfile={editingProfile}
            onConnect={model.connect}
            onSave={model.saveConnection}
            onTest={model.testConnection}
            onDone={() => setConnectionModalOpen(false)}
          />
        </Modal>

        <Modal
          title="Settings"
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
        >
          <SettingsPanel
            settings={model.settings}
            onUpdate={model.updateSettings}
          />
        </Modal>
      </SidebarProvider>
    </>
  );
}

function statusDot(tone: string, connected: boolean) {
  if (tone === "danger") return "bg-red-400";
  if (tone === "warning") return "bg-yellow-300";
  if (connected) return "bg-green-400";
  return "bg-zinc-600";
}

function primaryKeyColumns(tableDetails: TableDetails | null) {
  return (
    tableDetails?.columns
      .filter((column) => column.isPrimary)
      .map((column) => column.name) ?? []
  );
}

function rightPanelWidth(panel: RightPanel) {
  return panel === "ai" ? "w-[460px]" : "w-[320px]";
}

function rightPanelInnerWidth(panel: RightPanel) {
  return panel === "ai" ? "w-[460px]" : "w-[320px]";
}

function loadLastRightPanel(): RightPanel | null {
  try {
    const stored = localStorage.getItem(rightPanelStorageKey);
    return stored === "ai" || stored === "history" ? stored : null;
  } catch {
    return null;
  }
}

function saveLastRightPanel(panel: RightPanel) {
  if (panel !== "ai" && panel !== "history") return;
  try {
    localStorage.setItem(rightPanelStorageKey, panel);
  } catch {
    // Ignore storage failures; the panel still opens for this session.
  }
}

function connectionTooltip(model: ReturnType<typeof useDataPanelState>) {
  const profile = model.activeProfile;
  if (!profile) {
    return (
      <div className="flex flex-col gap-1">
        <b className="font-medium text-zinc-100">No active connection</b>
        <span>{model.status.text}</span>
      </div>
    );
  }

  const health = model.connectionHealth;
  return (
    <div className="flex flex-col gap-1">
      <b className="font-medium text-zinc-100">
        {profile.driver === "mysql" ? "MySQL" : "Postgres"} / {profile.database}
      </b>
      <span>
        {health.connected ? "Connected" : health.error || model.status.text}
      </span>
      <span>
        Last ping{" "}
        {health.latencyMs !== undefined
          ? `${health.latencyMs}ms`
          : "not available"}
        {health.lastPingAt ? ` at ${formatClock(health.lastPingAt)}` : ""}
      </span>
      {health.connectedAt ? (
        <span>Connected {relativeTime(health.connectedAt)}</span>
      ) : null}
      <span className="truncate text-muted">
        {profile.host}:{profile.port}
      </span>
    </div>
  );
}

function formatClock(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function relativeTime(value: string) {
  const elapsedSeconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 1000),
  );
  if (elapsedSeconds < 60) return "just now";
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}h ago`;
  return `${Math.floor(elapsedHours / 24)}d ago`;
}
