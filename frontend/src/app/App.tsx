import { Bot, Clock3, PanelRight, Search } from "lucide-react";
import { useState } from "react";
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
import { cn } from "../lib/cn";
import type { ConnectionProfile } from "../lib/types";
import { RightActionPanel, type RightPanel } from "./RightActionPanel";
import { useSequelState } from "./useSequelState";
import { EmptyWorkspace, WorkspaceLoader } from "./WorkspaceStates";

export function App() {
  const model = useSequelState();
  const [connectionModalOpen, setConnectionModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rightPanel, setRightPanel] = useState<RightPanel | null>(null);
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

  return (
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
        onSelectTable={model.inspectTable}
      />

      <SidebarInset className={cn("grid grid-rows-[56px_minmax(0,1fr)_28px]")}>
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
              <span className="truncate">Search tables, columns, queries</span>
              <kbd className="ml-auto rounded-md border border-line bg-surface-700 px-1.5 py-0.5 text-[11px] text-zinc-300">
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
                busy={Boolean(model.runningRequestId)}
                settings={model.settings}
                onCancel={model.cancelQuery}
                onRun={model.runQuery}
              />
              <ResultsGrid result={model.queryResult} />
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

        <footer
          className={cn(
            "flex items-center justify-between border-t border-line px-3 text-xs",
            statusTone(model.status.tone),
          )}
        >
          <span>{model.status.text}</span>
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
  );
}

function statusTone(tone: string) {
  if (tone === "success") return "text-green-200";
  if (tone === "warning") return "text-yellow-200";
  if (tone === "danger") return "text-red-200";
  return "text-zinc-400";
}
