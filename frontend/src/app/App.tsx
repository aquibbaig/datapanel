import {
  Bot,
  Clock3,
  KeyRound,
  Maximize2,
  Minimize2,
  PanelRight,
  RefreshCw,
  Search,
  Settings,
} from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { Toaster } from "sonner";
import { EventsOn } from "../../wailsjs/runtime/runtime";
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
import { QueryPlanView } from "../features/query-plan/QueryPlanView";
import { ResultsGrid } from "../features/results-grid/ResultsGrid";
import { SettingsPanel } from "../features/settings/SettingsPanel";
import { appDataService } from "../lib/backend";
import { cn } from "../lib/cn";
import type { ConnectionProfile, TableDetails, TableSummary } from "../lib/types";
import type { AISQLAssistantRequest } from "../features/ai-assistant/AiAssistantPanel";
import { CommandPalette } from "./CommandPalette";
import { RightActionPanel, type RightPanel } from "./RightActionPanel";
import { useDataPanelState } from "./useDataPanelState";
import {
  EmptyWorkspace,
  WorkspaceLoader,
  WorkspaceSwitchOverlay,
} from "./WorkspaceStates";

const rightPanelStorageKey = "datapanel.rightPanel";
const multiQueryWorkspacesEnabled = true;
const maxQueryWorkspaces = 3;
const postgresRowLocatorColumn = "__datapanel_internal_ctid__";
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

interface WailsRuntimeWindow extends Window {
  runtime?: {
    EventsOn?: unknown;
  };
}

function createInitialQueryWorkspaces(): QueryWorkspace[] {
  return [{ ...initialQueryWorkspace }];
}

function restoreQueryWorkspaceDrafts(draft: {
  activeWorkspaceId: string;
  workspaces: Array<{ id: string; title: string; sql: string }>;
}) {
  const seen = new Set<string>();
  const workspaces = draft.workspaces.reduce<QueryWorkspace[]>((items, item, index) => {
    if (items.length >= maxQueryWorkspaces) return items;
    const id = item.id?.trim() || crypto.randomUUID();
    if (seen.has(id)) return items;
    seen.add(id);
    items.push({
      id,
      title: item.title?.trim() || `Query ${index + 1}`,
      sql: typeof item.sql === "string" ? item.sql : "",
    });
    return items;
  }, []);
  const nextWorkspaces =
    workspaces.length > 0 ? workspaces : createInitialQueryWorkspaces();
  const activeWorkspaceId = nextWorkspaces.some(
    (workspace) => workspace.id === draft.activeWorkspaceId,
  )
    ? draft.activeWorkspaceId
    : nextWorkspaces[0].id;
  return { activeWorkspaceId, workspaces: nextWorkspaces };
}

function persistQueryWorkspaceDrafts(
  connectionId: string | null,
  activeWorkspaceId: string,
  workspaces: QueryWorkspace[],
) {
  if (!connectionId) return;
  void appDataService
    .saveQueryWorkspaceDrafts({
      connectionId,
      activeWorkspaceId,
      workspaces: workspaces.slice(0, maxQueryWorkspaces).map((workspace) => ({
        id: workspace.id,
        title: workspace.title,
        sql: workspace.sql,
      })),
    })
    .catch((error) => {
      console.warn("Could not save query workspace drafts", error);
    });
}

export function App() {
  const model = useDataPanelState();
  const resolvedTheme = useResolvedTheme(model.settings?.theme);
  const [connectionModalOpen, setConnectionModalOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rightPanel, setRightPanel] = useState<RightPanel | null>(null);
  const [assistantRequest, setAssistantRequest] =
    useState<AISQLAssistantRequest | null>(null);
  const [bottomView, setBottomView] = useState<"results" | "plan">(
    "results",
  );
  const [bottomPanelExpanded, setBottomPanelExpanded] = useState(true);
  const [bottomPanelHeight, setBottomPanelHeight] = useState<number | null>(
    null,
  );
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
  const [deletingProfile, setDeletingProfile] =
    useState<ConnectionProfile | null>(null);
  const [editableResultTable, setEditableResultTable] =
    useState<TableSummary | null>(null);
  const [editableResultTableDetails, setEditableResultTableDetails] =
    useState<TableDetails | null>(null);
  const previousConnectionIdRef = useRef<string | null>(null);
  const queryDraftHydratedConnectionIdRef = useRef<string | null>(null);
  const queryDraftLoadSequenceRef = useRef(0);
  const workspaceGridRef = useRef<HTMLDivElement | null>(null);
  const bottomPanelRef = useRef<HTMLElement | null>(null);
  const activeQueryWorkspaceIdRef = useRef(activeQueryWorkspaceId);
  const queryWorkspacesRef = useRef(queryWorkspaces);
  const activeQueryWorkspace =
    queryWorkspaces.find((workspace) => workspace.id === activeQueryWorkspaceId) ??
    queryWorkspaces[0];
  const sqlDraft = activeQueryWorkspace?.sql ?? "";

  useEffect(() => {
    activeQueryWorkspaceIdRef.current = activeQueryWorkspaceId;
  }, [activeQueryWorkspaceId]);

  useEffect(() => {
    queryWorkspacesRef.current = queryWorkspaces;
  }, [queryWorkspaces]);

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

  useEffect(() => {
    if (!(window as WailsRuntimeWindow).runtime?.EventsOn) return undefined;
    return EventsOn("datapanel:open-settings", () => setSettingsOpen(true));
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
  }, [resolvedTheme]);

  useEffect(() => {
    const previousConnectionId = previousConnectionIdRef.current;
    const nextConnectionId = model.activeConnectionId;

    if (
      previousConnectionId &&
      previousConnectionId !== nextConnectionId &&
      queryDraftHydratedConnectionIdRef.current === previousConnectionId
    ) {
      persistQueryWorkspaceDrafts(
        previousConnectionId,
        activeQueryWorkspaceIdRef.current,
        queryWorkspacesRef.current,
      );
    }

    previousConnectionIdRef.current = nextConnectionId;
    queryDraftHydratedConnectionIdRef.current = null;
    const nextWorkspaces = createInitialQueryWorkspaces();
    setQueryWorkspaces(nextWorkspaces);
    setActiveQueryWorkspaceId(nextWorkspaces[0].id);
    setRenamingQueryWorkspaceId(null);
    setQueryWorkspaceTitleDraft("");
    setEditableResultTable(null);
    setEditableResultTableDetails(null);
    setBottomView("results");
    setBottomPanelExpanded(true);

    if (!nextConnectionId) {
      queryDraftLoadSequenceRef.current += 1;
      return;
    }

    const loadSequence = queryDraftLoadSequenceRef.current + 1;
    queryDraftLoadSequenceRef.current = loadSequence;
    void appDataService
      .getQueryWorkspaceDrafts(nextConnectionId)
      .then((draft) => {
        if (queryDraftLoadSequenceRef.current !== loadSequence) return;
        const restored = restoreQueryWorkspaceDrafts(draft);
        setQueryWorkspaces(restored.workspaces);
        setActiveQueryWorkspaceId(restored.activeWorkspaceId);
      })
      .catch((error) => {
        console.warn("Could not load query workspace drafts", error);
      })
      .finally(() => {
        if (queryDraftLoadSequenceRef.current !== loadSequence) return;
        queryDraftHydratedConnectionIdRef.current = nextConnectionId;
      });
  }, [model.activeConnectionId]);

  useEffect(() => {
    const connectionId = model.activeConnectionId;
    if (
      !connectionId ||
      queryDraftHydratedConnectionIdRef.current !== connectionId
    ) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      persistQueryWorkspaceDrafts(
        connectionId,
        activeQueryWorkspaceId,
        queryWorkspaces,
      );
    }, 400);
    return () => window.clearTimeout(timeoutId);
  }, [activeQueryWorkspaceId, model.activeConnectionId, queryWorkspaces]);

  function openNewConnection() {
    setEditingProfile(null);
    setConnectionModalOpen(true);
  }

  function openEditConnection(profile: ConnectionProfile | null) {
    setEditingProfile(profile);
    setConnectionModalOpen(true);
  }

  async function confirmDeleteConnection() {
    if (!deletingProfile) return;
    const profile = deletingProfile;
    setDeletingProfile(null);
    await model.deleteConnection(profile).catch(() => {
      // The shared delete path already surfaces the error toast/status.
    });
  }

  async function setTheme(theme: "light" | "dark" | "system") {
    if (!model.settings) return;
    await model.updateSettings({ ...model.settings, theme });
  }

  async function connectProfile(profile: ConnectionProfile) {
    try {
      await model.connect(profile.id);
    } catch (error) {
      if (isKeychainAccessIssue(appErrorMessage(error))) return;
      openEditConnection(profile);
    }
  }

  async function reconnectKeychain() {
    if (!model.activeProfile) return;
    try {
      await model.connect(model.activeProfile.id, "", {
        reconnectKeychain: true,
        suppressErrorToast: true,
      });
    } catch {
      // Keep the footer action visible so the user can approve the next prompt.
    }
  }

  async function retryActiveConnection() {
    if (!model.activeProfile) return;
    try {
      await model.connect(model.activeProfile.id);
    } catch {
      // The shared connection path already surfaces the error toast/status.
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
    const driver = normalizeDriver(model.activeProfile?.driver);
    const detailsPromise = model.inspectTable(table, { force: true }).catch(() => null);
    const selectList =
      driver === "postgres" && isPostgresBaseTable(table.type)
        ? `ctid::text as "${postgresRowLocatorColumn}", *`
        : "*";
    const sql = `select ${selectList} from ${qualifiedName(driver, table.schema, table.name)} limit ${
      model.settings?.queryLimit ?? 500
    };`;
    const result = await model.runQuery(sql, true, {
      historyMode: "query",
      recordHistory: true,
    });
    if (result) {
      const details = await detailsPromise;
      if (details && !result.error) {
        setEditableResultTable(table);
        setEditableResultTableDetails(details);
      } else {
        setEditableResultTable(null);
        setEditableResultTableDetails(null);
      }
      setBottomView("results");
      setBottomPanelExpanded(true);
    }
  }

  async function runTypedSQL(sql: string, confirmDestructive = false) {
    const editableTarget = resolveEditableSelectTable(
      sql,
      model.tablesBySchema,
    );
    const driver = normalizeDriver(model.activeProfile?.driver);
    let editableTable: TableSummary | null = null;
    let editableDetailsPromise: Promise<TableDetails | null> | null = null;
    let sqlToRun = sql;

    setEditableResultTable(null);
    setEditableResultTableDetails(null);
    setBottomView(isExplainSQL(sql) ? "plan" : "results");
    setBottomPanelExpanded(true);

    if (editableTarget && !isExplainSQL(sql)) {
      editableTable = editableTarget;
      editableDetailsPromise = model.loadTableDetails(editableTarget, { force: true }).catch(
        () => null,
      );
      if (driver === "postgres" && isPostgresBaseTable(editableTarget.type)) {
        sqlToRun = addPostgresRowLocator(sql);
      }
    }

    const result = await model.runQuery(sqlToRun, confirmDestructive, {
      historySQL: sql,
      historyMode: "query",
      recordHistory: true,
    });
    if (result) {
      const editableDetails = editableDetailsPromise
        ? await editableDetailsPromise
        : null;
      if (editableTable && editableDetails && !result.error) {
        setEditableResultTable(editableTable);
        setEditableResultTableDetails(editableDetails);
      } else {
        setEditableResultTable(null);
        setEditableResultTableDetails(null);
      }
      setBottomView(isExplainSQL(sql) ? "plan" : "results");
      setBottomPanelExpanded(true);
    }
    return result;
  }

  async function explainTypedSQL(sql: string) {
    setEditableResultTable(null);
    setEditableResultTableDetails(null);
    setBottomView("plan");
    setBottomPanelExpanded(true);
    const result = await model.explainQuery(sql, {
      historyMode: "explain",
      recordHistory: true,
    });
    if (result) {
      setEditableResultTable(null);
      setEditableResultTableDetails(null);
      setBottomView("plan");
      setBottomPanelExpanded(true);
    }
    return result;
  }

  async function executeAISQL(sql: string) {
    setEditableResultTable(null);
    setEditableResultTableDetails(null);
    setBottomView(isExplainSQL(sql) ? "plan" : "results");
    setBottomPanelExpanded(true);
    const result = await model.runQuery(sql, true, {
      historyMode: "query",
      recordHistory: true,
    });
    if (result) {
      setEditableResultTable(null);
      setEditableResultTableDetails(null);
      setBottomView(isExplainSQL(sql) ? "plan" : "results");
      setBottomPanelExpanded(true);
    }
    return result;
  }

  function explainSelectedSQLWithAI(sql: string) {
    const selectedSQL = sql.trim();
    if (!selectedSQL) return;

    setAssistantRequest({
      id: crypto.randomUUID(),
      displayPrompt: buildSQLExplanationDisplayPrompt(selectedSQL),
      prompt: buildSQLExplanationPrompt(selectedSQL, model.activeProfile?.driver),
      autoSubmit: true,
    });
    openRightPanel("ai");
  }

  function loadHistoryQuery(sql: string) {
    setSqlDraft(sql);
    setRightPanel(null);
  }

  function loadSQL(sql: string) {
    setSqlDraft(sql);
  }

  const hasPlanResult =
    model.queryResultMode === "explain" && Boolean(model.queryResult);
  const hasRowResult =
    model.queryResultMode === "query" && Boolean(model.queryResult);
  const rowResult = hasRowResult ? model.queryResult : null;

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

  function startBottomPanelResize(event: ReactMouseEvent<HTMLDivElement>) {
    if (!bottomPanelExpanded) return;
    const container = workspaceGridRef.current;
    if (!container) return;

    event.preventDefault();
    const containerHeight = container.getBoundingClientRect().height;
    const startY = event.clientY;
    const startHeight =
      bottomPanelRef.current?.getBoundingClientRect().height ||
      bottomPanelHeight ||
      Math.round(containerHeight * 0.52);
    const minBottomHeight = 120;
    const minEditorHeight = 180;
    const maxBottomHeight = Math.max(
      minBottomHeight,
      containerHeight - minEditorHeight - 6,
    );

    function handleMouseMove(moveEvent: MouseEvent) {
      const nextHeight = clamp(
        startHeight + startY - moveEvent.clientY,
        minBottomHeight,
        maxBottomHeight,
      );
      setBottomPanelHeight(nextHeight);
    }

    function stopResize() {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", stopResize);
    }

    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", stopResize);
  }

  const cursorMode =
    model.settings?.cursorMode === "pointer" ? "pointer" : "default";
  const activeKeychainAccessHint = currentKeychainAccessHint(model);

  return (
    <div className="contents bg-background text-foreground" data-cursor-mode={cursorMode}>
      <Toaster
        closeButton
        position="top-right"
        theme={resolvedTheme}
        toastOptions={{
          classNames: {
            toast: "items-start",
            icon: "mt-0.5",
          },
        }}
      />
      <CommandPalette
        activeProfile={model.activeProfile}
        currentTheme={model.settings?.theme || "system"}
        open={commandOpen}
        tablesBySchema={model.tablesBySchema}
        onAddConnection={openNewConnection}
        onClose={() => setCommandOpen(false)}
        onEditConnection={() => openEditConnection(model.activeProfile)}
        onOpenAI={() => openRightPanel("ai")}
        onOpenHistory={() => openRightPanel("history")}
        onOpenSettings={() => setSettingsOpen(true)}
        onRefreshMetadata={() => void model.refreshMetadata()}
        onSetTheme={(theme) => void setTheme(theme)}
        onSelectTable={(table) => void selectTableForEditing(table)}
        onShowResults={() => setBottomView("results")}
      />
      <SidebarProvider>
        <AppSidebar
          activeConnectionId={model.activeConnectionId}
          activeProfile={model.activeProfile}
          switchingWorkspaceName={model.workspaceSwitching?.name}
          profiles={model.profiles}
          inspectingTable={model.inspectingTable}
          schemas={model.schemas}
          selectedTable={model.selectedTable}
          tableDetails={model.tableDetails}
          tablesBySchema={model.tablesBySchema}
          onAddConnection={openNewConnection}
          onConnect={connectProfile}
          onEditConnection={() => openEditConnection(model.activeProfile)}
          onInspectTable={model.inspectTable}
          onPrefetchTableDetails={model.prefetchTableDetails}
          onRefresh={model.refreshMetadata}
        />

        <SidebarInset
          className={cn("grid grid-rows-[48px_minmax(0,1fr)_28px]")}
        >
          <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-line bg-surface-950 px-3">
            <div className="flex min-w-0 items-center gap-2">
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="mr-1 bg-line" />
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbPage>
                      {activeQueryWorkspace?.title || "Query workspace"}
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </div>

            <div className="flex min-w-0 items-center gap-2">
              <div
                className="hidden h-7 w-[320px] cursor-pointer items-center gap-2 rounded-md border border-line bg-control/[0.03] px-2 text-sm text-muted transition hover:border-zinc-700 hover:bg-control/[0.05] hover:text-zinc-300 lg:flex"
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
                <kbd className="ml-auto flex h-5 flex-col items-center justify-center rounded-md border border-line bg-control/[0.04] px-1.5 py-0.5 text-[11px] text-zinc-300">
                  Cmd K
                </kbd>
              </div>
              <Button
                className="text-zinc-500"
                size="icon"
                onClick={() => setSettingsOpen(true)}
                title="Settings"
              >
                <Settings size={14} />
              </Button>
              <Button
                className={cn(
                  rightPanel === "ai" && "bg-selection text-selection-foreground",
                )}
                size="icon"
                onClick={() => toggleRightPanel("ai")}
                title="AI assistant"
              >
                <Bot size={14} />
              </Button>
              <Button
                className={cn(
                  rightPanel === "history" && "bg-selection text-selection-foreground",
                )}
                size="icon"
                onClick={() => toggleRightPanel("history")}
                title="Query history"
              >
                <Clock3 size={14} />
              </Button>
              <Button
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
              <div
                className="grid min-h-0 min-w-0 flex-1"
                ref={workspaceGridRef}
                style={{
                  gridTemplateRows: bottomPanelExpanded
                    ? bottomPanelHeight
                      ? `minmax(180px, 1fr) minmax(120px, ${bottomPanelHeight}px)`
                      : "48% minmax(0, 1fr)"
                    : "minmax(0, 1fr) 44px",
                }}
              >
                <QueryEditor
                  activeConnectionId={model.activeConnectionId}
                  activeProfile={model.activeProfile}
                  activeWorkspaceId={activeQueryWorkspaceId}
                  busy={Boolean(model.runningRequestId)}
                  multiWorkspaceEnabled={multiQueryWorkspacesEnabled}
                  renamingWorkspaceId={renamingQueryWorkspaceId}
                  resizeEnabled={bottomPanelExpanded}
                  schemas={model.schemas}
                  settings={model.settings}
                  tablesBySchema={model.tablesBySchema}
                  theme={resolvedTheme}
                  titleDraft={queryWorkspaceTitleDraft}
                  onCancel={model.cancelQuery}
                  onCreateWorkspace={createQueryWorkspace}
                  onDeleteWorkspace={deleteQueryWorkspace}
                  onRenameCommit={renameQueryWorkspace}
                  onRenameStart={(workspace) => {
                    setRenamingQueryWorkspaceId(workspace.id);
                    setQueryWorkspaceTitleDraft(workspace.title);
                  }}
                  onResizeStart={startBottomPanelResize}
                  onSelectWorkspace={setActiveQueryWorkspaceId}
                  onTitleDraftChange={setQueryWorkspaceTitleDraft}
                  value={sqlDraft}
                  workspaces={queryWorkspaces}
                  onChange={setSqlDraft}
                  onExplain={explainTypedSQL}
                  onExplainWithAI={explainSelectedSQLWithAI}
                  onRun={runTypedSQL}
                />
                <section
                  className={cn(
                    "grid min-h-0 overflow-hidden bg-surface-900",
                    bottomPanelExpanded
                      ? "grid-rows-[44px_minmax(0,1fr)]"
                      : "grid-rows-[44px_0px]",
                  )}
                  ref={bottomPanelRef}
                >
                  <div className="flex h-11 shrink-0 items-center justify-between border-b border-line px-2">
                    <div className="flex items-center gap-1">
                      <Button
                        className="h-7"
                        disabled={!hasRowResult}
                        variant={bottomView === "results" ? "primary" : "ghost"}
                        onClick={() => {
                          setBottomView("results");
                          setBottomPanelExpanded(true);
                        }}
                      >
                        Results
                      </Button>
                      <Button
                        className="h-7"
                        disabled={!hasPlanResult}
                        variant={bottomView === "plan" ? "primary" : "ghost"}
                        onClick={() => {
                          setBottomView("plan");
                          setBottomPanelExpanded(true);
                        }}
                      >
                        Plan
                      </Button>
                    </div>
                    <div className="flex min-w-0 items-center gap-2">
                      {editableResultTable ? (
                        <span className="truncate px-2 text-xs text-muted">
                          {editableResultTable.schema}.{editableResultTable.name}
                        </span>
                      ) : null}
                      <Button
                        size="icon"
                        title={
                          bottomPanelExpanded
                            ? "Collapse bottom panel"
                            : "Expand bottom panel"
                        }
                        onClick={() =>
                          setBottomPanelExpanded((expanded) => !expanded)
                        }
                      >
                        {bottomPanelExpanded ? (
                          <Minimize2 size={14} />
                        ) : (
                          <Maximize2 size={14} />
                        )}
                      </Button>
                    </div>
                  </div>
                  {bottomView === "plan" ? (
                    <QueryPlanView
                      driver={model.activeProfile?.driver}
                      result={model.queryResult}
                    />
                  ) : (
                    <ResultsGrid
                      activeProfile={model.activeProfile}
                      isLoading={Boolean(model.runningRequestId)}
                      selectedTable={editableResultTable}
                      tableDetails={editableResultTableDetails}
                      result={rowResult}
                      onCommitSQL={(sql, summary) =>
                        model.commitSQL(sql, `${summary.total} row(s) changed`)
                      }
                    />
                  )}
                </section>
              </div>
            ) : model.workspaceSwitching ? (
              <div className="min-h-0 min-w-0 flex-1 bg-surface-900" />
            ) : (
              <EmptyWorkspace onCreateConnection={openNewConnection} />
            )}

            <aside
              className={cn(
                "min-h-0 shrink-0 overflow-hidden border-l border-line bg-surface-950 transition-[width] duration-200 ease-out",
                rightPanel ? rightPanelWidth(rightPanel) : "w-0 border-l-0",
              )}
            >
              {rightPanel ? (
                <div className={cn("h-full", rightPanelInnerWidth(rightPanel))}>
                  <RightActionPanel
                    panel={rightPanel}
                    activeProfile={model.activeProfile}
                    assistantRequest={assistantRequest}
                    queryHistory={model.queryHistory}
                    schemas={model.schemas}
                    settings={model.settings}
                    tableDetails={model.tableDetails}
                    tablesBySchema={model.tablesBySchema}
                    onExecuteSQL={executeAISQL}
                    onAssistantRequestConsumed={(id) => {
                      setAssistantRequest((current) =>
                        current?.id === id ? null : current,
                      );
                    }}
                    onEnsureSchemaFresh={model.ensureFreshSchema}
                    onLoadSQL={loadSQL}
                    onUseQuery={loadHistoryQuery}
                  />
                </div>
              ) : null}
            </aside>
          </section>

          <footer className="flex items-center justify-between border-t border-line bg-surface-950 px-3 text-xs text-zinc-200">
            <div className="flex min-w-0 items-center gap-2">
              <div className="group relative flex min-w-0 items-center gap-2">
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    statusDot(
                      model.status.tone,
                      model.connectionHealth.connected,
                    ),
                  )}
                />
                <span className="truncate">
                  {model.activeProfile
                    ? model.activeProfile.name
                    : "No connection"}
                </span>
                <div className="pointer-events-auto absolute bottom-6 left-0 z-40 hidden min-w-[280px] rounded-ui border border-line bg-surface-800 p-3 text-left text-xs text-zinc-300 shadow-xl group-hover:block">
                  {connectionTooltip(model)}
                </div>
              </div>
              {activeKeychainAccessHint ? (
                <button
                  className="group relative grid h-5 w-5 shrink-0 place-items-center rounded text-yellow-200 transition hover:bg-yellow-500/10 hover:text-yellow-100"
                  title="Reconnect Keychain"
                  type="button"
                  onClick={() => void reconnectKeychain()}
                >
                  <KeyRound size={12} />
                  <span className="pointer-events-none absolute bottom-6 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-yellow-500/25 bg-surface-800 px-2 py-1 text-[11px] font-medium text-yellow-100 shadow-xl group-hover:block">
                    Reconnect Keychain
                  </span>
                </button>
              ) : null}
              {canRetryConnection(model) ? (
                <button
                  className="inline-flex h-5 shrink-0 items-center gap-1 rounded border border-red-400/30 bg-red-500/10 px-1.5 text-[11px] font-medium text-red-100 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-65 [&>svg]:h-3 [&>svg]:w-3 [&>svg]:shrink-0"
                  disabled={model.busy}
                  onClick={() => void retryActiveConnection()}
                  title="Retry connection"
                  type="button"
                >
                  <RefreshCw className={cn(model.busy && "animate-spin")} />
                  Retry
                </button>
              ) : null}
            </div>
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
            onDelete={(profile) => {
              setConnectionModalOpen(false);
              setEditingProfile(null);
              setDeletingProfile(profile);
            }}
            onSave={model.saveConnection}
            onTest={model.testConnection}
            onDone={() => setConnectionModalOpen(false)}
          />
        </Modal>

        <Modal
          title="Delete Workspace"
          open={Boolean(deletingProfile)}
          onClose={() => setDeletingProfile(null)}
        >
          <div className="grid gap-4">
            <div className="grid gap-2 text-sm leading-6 text-zinc-300">
              <p>
                Delete{" "}
                <span className="font-medium text-zinc-100">
                  {deletingProfile?.name}
                </span>
                ?
              </p>
              <p className="text-muted">
                This removes the saved connection profile and any stored
                password for it. The database itself is not modified.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                disabled={model.busy}
                type="button"
                onClick={() => setDeletingProfile(null)}
              >
                Cancel
              </Button>
              <Button
                disabled={model.busy}
                type="button"
                variant="danger"
                onClick={() => void confirmDeleteConnection()}
              >
                Delete workspace
              </Button>
            </div>
          </div>
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
      {model.workspaceSwitching ? (
        <WorkspaceSwitchOverlay
          workspaceName={model.workspaceSwitching.name}
        />
      ) : null}
    </div>
  );
}

function statusDot(tone: string, connected: boolean) {
  if (tone === "danger") return "bg-red-400";
  if (tone === "warning") return "bg-yellow-300";
  if (connected) return "bg-green-400";
  return "bg-zinc-600";
}

function useResolvedTheme(theme = "system"): "dark" | "light" {
  const [systemTheme, setSystemTheme] = useState<"dark" | "light">(() =>
    window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark",
  );

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: light)");
    const updateSystemTheme = () =>
      setSystemTheme(query.matches ? "light" : "dark");

    updateSystemTheme();
    query.addEventListener("change", updateSystemTheme);
    return () => query.removeEventListener("change", updateSystemTheme);
  }, []);

  if (theme === "light" || theme === "dark") return theme;
  return systemTheme;
}

function canRetryConnection(model: ReturnType<typeof useDataPanelState>) {
  const message = model.connectionHealth.error || model.status.text;
  return Boolean(
    model.activeProfile &&
      !model.connectionHealth.connected &&
      model.connectionHealth.error &&
      !isKeychainAccessIssue(message),
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

function isExplainSQL(sql: string) {
  return sql.trim().toLowerCase().startsWith("explain");
}

function resolveEditableSelectTable(
  sql: string,
  tablesBySchema: Record<string, TableSummary[]>,
) {
  const target = parseSimpleSelectStarTarget(sql);
  if (!target) return null;

  if (target.schema) {
    return findTableInSchema(tablesBySchema, target.schema, target.table);
  }

  const matches = Object.entries(tablesBySchema).flatMap(([schema, tables]) =>
    tables
      .filter((table) => namesEqual(table.name, target.table))
      .map((table) => ({ schema, table })),
  );
  const publicMatch = matches.find((match) => match.schema === "public");
  if (publicMatch) return publicMatch.table;
  return matches.length === 1 ? matches[0].table : null;
}

function parseSimpleSelectStarTarget(sql: string) {
  const identifier = String.raw`(?:"(?:[^"]|"")+"|[A-Za-z_][\w$]*)`;
  const pattern = new RegExp(
    String.raw`^\s*select\s+\*\s+from\s+(${identifier})(?:\s*\.\s*(${identifier}))?([\s\S]*)$`,
    "i",
  );
  const match = sql.match(pattern);
  if (!match) return null;

  const rest = match[3].trimStart().toLowerCase();
  if (/^(,|join\b|inner\b|left\b|right\b|full\b|cross\b)/.test(rest)) {
    return null;
  }

  if (match[2]) {
    return {
      schema: unquoteIdentifier(match[1]),
      table: unquoteIdentifier(match[2]),
    };
  }

  return { schema: "", table: unquoteIdentifier(match[1]) };
}

function findTableInSchema(
  tablesBySchema: Record<string, TableSummary[]>,
  schemaName: string,
  tableName: string,
) {
  const schemaEntry = Object.entries(tablesBySchema).find(([schema]) =>
    namesEqual(schema, schemaName),
  );
  return (
    schemaEntry?.[1].find((table) => namesEqual(table.name, tableName)) || null
  );
}

function addPostgresRowLocator(sql: string) {
  return sql.replace(
    /^(\s*select\s+)\*(\s+from\s+)/i,
    `$1ctid::text as "${postgresRowLocatorColumn}", *$2`,
  );
}

function unquoteIdentifier(identifier: string) {
  if (identifier.startsWith('"') && identifier.endsWith('"')) {
    return identifier.slice(1, -1).replace(/""/g, '"');
  }
  return identifier;
}

function namesEqual(left: string, right: string) {
  return left.toLowerCase() === right.toLowerCase();
}

function isPostgresBaseTable(tableType: string) {
  return tableType.trim().toUpperCase() === "BASE TABLE";
}

function qualifiedName(
  driver: SQLDriver,
  schema: string,
  table: string,
) {
  return `${quoteIdentifier(driver, schema)}.${quoteIdentifier(driver, table)}`;
}

type SQLDriver = "postgres" | "mysql" | "bigquery";

function normalizeDriver(driver: string | undefined): SQLDriver {
  if (driver === "mysql") return "mysql";
  if (driver === "bigquery") return "bigquery";
  return "postgres";
}

function quoteIdentifier(driver: SQLDriver, identifier: string) {
  if (driver === "mysql" || driver === "bigquery") {
    return `\`${identifier.split("`").join("``")}\``;
  }
  return `"${identifier.split('"').join('""')}"`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function buildSQLExplanationPrompt(sql: string, driver: string | undefined) {
  const dialect = driver || "the active database";
  return [
    `Explain this ${dialect} SQL query in plain English.`,
    "Use the existing chat context and available schema context when they help disambiguate tables, columns, or intent.",
    "Focus on what it returns or changes, the joins, filters, grouping, ordering, and any obvious correctness or performance risks.",
    "Do not rewrite the query unless a change is needed to explain an issue.",
    "",
    "```sql",
    sql,
    "```",
  ].join("\n");
}

function buildSQLExplanationDisplayPrompt(sql: string) {
  return ["explain this query:", "", sql].join("\n");
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
  const keychainAccessHint = currentKeychainAccessHint(model);
  return (
    <div className="flex flex-col gap-2">
      <b className="font-medium text-zinc-100">
        {driverLabel(profile.driver)} / {profile.database || profile.host}
      </b>
      <div className="flex flex-col gap-1">
        <span>
          {health.connected ? "Connected" : health.error || model.status.text}
        </span>
        {keychainAccessHint ? (
          <span className="text-zinc-100">
            Approve the macOS prompt to let DataPanel read saved secrets.
          </span>
        ) : null}
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
          {profile.driver === "bigquery" ? profile.host : `${profile.host}:${profile.port}`}
        </span>
      </div>
    </div>
  );
}

function driverLabel(driver: string) {
  if (driver === "mysql") return "MySQL";
  if (driver === "bigquery") return "BigQuery";
  return "Postgres";
}

function currentKeychainAccessHint(
  model: ReturnType<typeof useDataPanelState>,
) {
  const message = model.connectionHealth.error || model.status.text;
  if (!isKeychainAccessIssue(message)) return "";
  return "Keychain access required";
}

function isKeychainAccessIssue(message = "") {
  const normalized = message.toLowerCase();
  return normalized.includes("keychain access required") ||
    normalized.includes("could not unlock saved secrets") ||
    normalized.includes("saved password not found") ||
    normalized.includes("user interaction") ||
    normalized.includes("passphrase") ||
    normalized.includes("access control");
}

function appErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const shaped = error as { message?: unknown; error?: unknown };
    if (typeof shaped.message === "string") return shaped.message;
    if (typeof shaped.error === "string") return shaped.error;
  }
  return "";
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
