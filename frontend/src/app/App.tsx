import { Bot, Clock3, PanelRight, Search } from "lucide-react";
import { useState } from "react";
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
import type { ConnectionProfile } from "../lib/types";
import { RightActionPanel, type RightPanel } from "./RightActionPanel";
import { useDataPanelState } from "./useDataPanelState";
import { EmptyWorkspace, WorkspaceLoader } from "./WorkspaceStates";

export function App() {
  const model = useDataPanelState();
  const [connectionModalOpen, setConnectionModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rightPanel, setRightPanel] = useState<RightPanel | null>(null);
  const [bottomView, setBottomView] = useState<"results" | "table">("results");
  const [editingProfile, setEditingProfile] =
    useState<ConnectionProfile | null>(null);

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

  function toggleRightPanel(panel: RightPanel) {
    setRightPanel((current) => (current === panel ? null : panel));
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

  async function runSQL(sql: string, confirmDestructive = false) {
    setBottomView("results");
    return model.runQuery(sql, confirmDestructive);
  }

  return (
    <>
      <Toaster closeButton position="top-right" theme="dark" />
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
              <div className="hidden h-7 w-[320px] items-center gap-2 rounded-full border border-line bg-surface-850 px-2 text-sm text-muted lg:flex">
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
                onClick={() =>
                  setRightPanel((current) => (current ? null : "history"))
                }
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
                  busy={Boolean(model.runningRequestId)}
                  schemas={model.schemas}
                  settings={model.settings}
                  tablesBySchema={model.tablesBySchema}
                  onCancel={model.cancelQuery}
                  onRun={runSQL}
                />
                <section className="grid min-h-0 grid-rows-[34px_minmax(0,1fr)] bg-surface-900">
                  <div className="flex items-center justify-between border-b border-line px-2">
                    <div className="flex items-center gap-1">
                      <Button
                        className={cn(
                          "h-7",
                          bottomView === "results" &&
                            "bg-surface-700 text-zinc-100",
                        )}
                        onClick={() => setBottomView("results")}
                      >
                        Results
                      </Button>
                      <Button
                        className={cn(
                          "h-7",
                          bottomView === "table" &&
                            "bg-surface-700 text-zinc-100",
                        )}
                        disabled={!model.selectedTable}
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
                    <ResultsGrid result={model.queryResult} />
                  )}
                </section>
              </div>
            ) : (
              <EmptyWorkspace onCreateConnection={openNewConnection} />
            )}

            <aside
              className={cn(
                "min-h-0 shrink-0 overflow-hidden border-l border-line bg-surface-900 transition-[width] duration-200 ease-out",
                rightPanel ? "w-[320px]" : "w-0 border-l-0",
              )}
            >
              {rightPanel ? (
                <div className="h-full w-[320px]">
                  <RightActionPanel
                    panel={rightPanel}
                    activeProfileName={model.activeProfile?.name}
                  />
                </div>
              ) : null}
            </aside>
          </section>

          <footer className="flex items-center justify-between border-t border-line px-3 text-xs text-zinc-400">
            <span
              className="flex min-w-0 items-center gap-2"
              title={model.status.text}
            >
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
