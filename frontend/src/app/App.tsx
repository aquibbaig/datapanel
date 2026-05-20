import { Bot, Clock3, Database, PanelRight, Search } from "lucide-react";
import { useState } from "react";
import { AppSidebar } from "../components/AppSidebar";
import { Button } from "../components/ui/Button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "../components/ui/breadcrumb";
import { Modal } from "../components/ui/Modal";
import { Separator } from "../components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "../components/ui/sidebar";
import { ConnectionPanel } from "../features/connections/ConnectionPanel";
import { QueryEditor } from "../features/query-editor/QueryEditor";
import { ResultsGrid } from "../features/results-grid/ResultsGrid";
import { SettingsPanel } from "../features/settings/SettingsPanel";
import type { ConnectionProfile } from "../lib/types";
import { cn } from "../lib/cn";
import { useSequelState } from "./useSequelState";

type RightPanel = "ai" | "history" | "panels" | null;

export function App() {
  const model = useSequelState();
  const [connectionModalOpen, setConnectionModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rightPanel, setRightPanel] = useState<RightPanel>(null);
  const [editingProfile, setEditingProfile] = useState<ConnectionProfile | null>(null);

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

  function toggleRightPanel(panel: Exclude<RightPanel, null>) {
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

      <SidebarInset className={cn("grid grid-rows-[56px_minmax(0,1fr)_28px]", rightPanel ? "mr-0" : "")}>
        <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-line px-4">
          <div className="flex min-w-0 items-center gap-2">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-1" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink>{model.activeProfile ? model.activeProfile.name : "Sequel"}</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:flex" />
                <BreadcrumbItem>
                  <BreadcrumbPage>{model.selectedTable ? model.selectedTable.name : "Query workspace"}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>

          <div className="flex min-w-0 items-center gap-2">
            <div className="hidden h-7 w-[320px] items-center gap-2 rounded-full border border-line bg-surface-850 px-2 text-sm text-muted lg:flex">
              <Search size={14} />
              <span className="truncate">Search tables, columns, queries</span>
              <kbd className="ml-auto rounded-md border border-line bg-surface-700 px-1.5 py-0.5 text-[11px] text-zinc-300">Cmd K</kbd>
            </div>
            <Button
              className={cn(rightPanel === "ai" && "bg-surface-700 text-zinc-200")}
              size="icon"
              onClick={() => toggleRightPanel("ai")}
              title="AI assistant"
            >
              <Bot size={14} />
            </Button>
            <Button
              className={cn(rightPanel === "history" && "bg-surface-700 text-zinc-200")}
              size="icon"
              onClick={() => toggleRightPanel("history")}
              title="Query history"
            >
              <Clock3 size={14} />
            </Button>
            <Button
              className={cn(rightPanel === "panels" && "bg-surface-700 text-zinc-200")}
              size="icon"
              onClick={() => toggleRightPanel("panels")}
              title="Panels"
            >
              <PanelRight size={14} />
            </Button>
          </div>
        </header>

        <section className={cn("grid min-h-0", rightPanel ? "grid-cols-[minmax(0,1fr)_320px]" : "grid-cols-1")}>
          <div className="grid min-h-0 grid-rows-[48%_minmax(0,1fr)]">
            <QueryEditor
              activeConnectionId={model.activeConnectionId}
              busy={Boolean(model.runningRequestId)}
              settings={model.settings}
              onCancel={model.cancelQuery}
              onRun={model.runQuery}
            />
            <ResultsGrid result={model.queryResult} />
          </div>

          {rightPanel ? (
            <aside className="min-h-0 border-l border-line bg-surface-900">
              <RightActionPanel panel={rightPanel} activeProfileName={model.activeProfile?.name} />
            </aside>
          ) : null}
        </section>

        <footer className={cn("flex items-center justify-between border-t border-line px-3 text-xs", statusTone(model.status.tone))}>
          <span>{model.status.text}</span>
          <span>{model.activeProfile ? `${model.activeProfile.host}:${model.activeProfile.port}` : "Local app"}</span>
        </footer>
      </SidebarInset>

      <Modal title={editingProfile ? "Edit connection" : "Add connection"} open={connectionModalOpen} onClose={() => setConnectionModalOpen(false)}>
        <ConnectionPanel
          busy={model.busy}
          initialProfile={editingProfile}
          onConnect={model.connect}
          onSave={model.saveConnection}
          onTest={model.testConnection}
          onDone={() => setConnectionModalOpen(false)}
        />
      </Modal>

      <Modal title="Settings" open={settingsOpen} onClose={() => setSettingsOpen(false)}>
        <SettingsPanel settings={model.settings} onUpdate={model.updateSettings} />
      </Modal>
    </SidebarProvider>
  );
}

function RightActionPanel({ panel, activeProfileName }: { panel: Exclude<RightPanel, null>; activeProfileName?: string }) {
  const titles = {
    ai: "AI assistant",
    history: "Query history",
    panels: "Panels",
  };

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <Database size={14} className="text-muted" />
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">{titles[panel]}</h2>
          <p className="text-xs text-muted">{activeProfileName || "No active connection"}</p>
        </div>
      </div>
      <div className="rounded-xl border border-line bg-surface-850 p-3 text-sm text-muted">
        {panel === "ai" ? "AI schema assistance will appear here once providers are configured." : null}
        {panel === "history" ? "Recent query executions will appear here." : null}
        {panel === "panels" ? "Panel controls for schema, results, and assistant views will appear here." : null}
      </div>
    </div>
  );
}

function statusTone(tone: string) {
  if (tone === "success") return "text-green-200";
  if (tone === "warning") return "text-yellow-200";
  if (tone === "danger") return "text-red-200";
  return "text-zinc-400";
}
