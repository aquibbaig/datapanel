import { AlertTriangle, Bot, GitBranch, Play, Plus, Square, X } from "lucide-react";
import { useState, type MouseEvent as ReactMouseEvent } from "react";
import { Button } from "../../components/ui/Button";
import { queryService } from "../../lib/backend";
import { textInputBehaviorProps } from "../../lib/text-input";
import type {
  AppSettings,
  ConnectionProfile,
  SchemaSummary,
  TableSummary,
} from "../../lib/types";
import { SqlCodeEditor } from "./SqlCodeEditor";

interface Props {
  activeConnectionId: string;
  activeProfile: ConnectionProfile | null;
  activeWorkspaceId: string;
  busy: boolean;
  multiWorkspaceEnabled: boolean;
  renamingWorkspaceId: string | null;
  resizeEnabled: boolean;
  schemas: SchemaSummary[];
  settings: AppSettings | null;
  tablesBySchema: Record<string, TableSummary[]>;
  theme: "dark" | "light";
  titleDraft: string;
  value: string;
  workspaces: QueryWorkspace[];
  onChange(sql: string): void;
  onRun(sql: string, confirmDestructive?: boolean): Promise<unknown>;
  onExplain(sql: string): Promise<unknown>;
  onExplainWithAI(sql: string): void;
  onCancel(): Promise<void>;
  onCreateWorkspace(): void;
  onDeleteWorkspace(workspace: QueryWorkspace): void;
  onRenameCommit(workspace: QueryWorkspace, title: string): void;
  onRenameStart(workspace: QueryWorkspace): void;
  onResizeStart(event: ReactMouseEvent<HTMLDivElement>): void;
  onSelectWorkspace(workspaceId: string): void;
  onTitleDraftChange(title: string): void;
}

interface QueryWorkspace {
  id: string;
  title: string;
  sql: string;
}

export function QueryEditor({
  activeConnectionId,
  activeProfile,
  activeWorkspaceId,
  busy,
  multiWorkspaceEnabled,
  renamingWorkspaceId,
  resizeEnabled,
  schemas,
  settings,
  tablesBySchema,
  theme,
  titleDraft,
  value,
  workspaces,
  onChange,
  onRun,
  onExplain,
  onExplainWithAI,
  onCancel,
  onCreateWorkspace,
  onDeleteWorkspace,
  onRenameCommit,
  onRenameStart,
  onResizeStart,
  onSelectWorkspace,
  onTitleDraftChange,
}: Props) {
  const [warnings, setWarnings] = useState<string[]>([]);
  const [pendingSQL, setPendingSQL] = useState("");
  const [selectedSQL, setSelectedSQL] = useState("");
  const selectedActionSQL = isRunnableSQLSelection(selectedSQL)
    ? selectedSQL.trim()
    : "";

  async function run(confirmDestructive = false, sqlOverride?: string) {
    const sqlToRun = (sqlOverride || (confirmDestructive ? pendingSQL : "") || value).trim();
    if (!sqlToRun) return;

    if (!confirmDestructive && settings?.confirmDestructiveSql) {
      const analysis = await queryService.analyze(sqlToRun);
      if (analysis.destructive) {
        setPendingSQL(sqlToRun);
        setWarnings(analysis.warnings);
        return;
      }
    }
    setWarnings([]);
    setPendingSQL("");
    await onRun(sqlToRun, confirmDestructive);
  }

  async function explain() {
    const sqlToExplain = selectedActionSQL;
    if (!sqlToExplain) return;

    setWarnings([]);
    setPendingSQL("");
    await onExplain(sqlToExplain);
  }

  function explainQueryWithAI() {
    const sqlToExplain = selectedActionSQL;
    if (!sqlToExplain) return;

    setWarnings([]);
    setPendingSQL("");
    onExplainWithAI(sqlToExplain);
  }

  return (
    <section className="grid min-h-0 grid-rows-[38px_minmax(0,1fr)_auto_3px_auto] border-b border-line bg-surface-950">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center border-b border-line">
        {multiWorkspaceEnabled ? (
          <QueryWorkspaceTabs
            activeWorkspaceId={activeWorkspaceId}
            renamingWorkspaceId={renamingWorkspaceId}
            titleDraft={titleDraft}
            workspaces={workspaces}
            onCreateWorkspace={onCreateWorkspace}
            onDeleteWorkspace={onDeleteWorkspace}
            onRenameCommit={onRenameCommit}
            onRenameStart={onRenameStart}
            onSelectWorkspace={onSelectWorkspace}
            onTitleDraftChange={onTitleDraftChange}
          />
        ) : (
          <Button className="rounded-none border-y-0 border-l-0 border-r border-line bg-surface-850 text-zinc-100 hover:bg-surface-850" size="tab" variant="ghost">
            Query 1
          </Button>
        )}
        <span className="shrink-0 px-4 text-xs text-muted">
          limit {settings?.queryLimit ?? 500} / timeout {settings?.queryTimeoutSeconds ?? 30}s
        </span>
      </div>

      <div className="relative min-h-0 overflow-hidden">
        <SqlCodeEditor
          activeProfile={activeProfile}
          schemas={schemas}
          tablesBySchema={tablesBySchema}
          theme={theme}
          value={value}
          onChange={onChange}
          onRun={(selectedSQL) => void run(false, selectedSQL)}
          onSelectedSQLChange={setSelectedSQL}
        />
      </div>

      <div>
        {warnings.length > 0 ? (
          <div className="grid grid-cols-[18px_minmax(0,1fr)_auto_auto] items-start gap-2 border-t border-yellow-500/30 bg-yellow-500/10 p-3">
            <AlertTriangle size={14} className="text-yellow-200" />
            <div className="flex flex-col gap-1">
              <b className="text-sm text-yellow-100">Confirm destructive SQL</b>
              {warnings.map((warning) => (
                <p className="text-xs text-yellow-100/80" key={warning}>{warning}</p>
              ))}
            </div>
            <Button variant="danger" onClick={() => void run(true)}>Run anyway</Button>
            <Button onClick={() => {
              setPendingSQL("");
              setWarnings([]);
            }}>Cancel</Button>
          </div>
        ) : null}
      </div>

      <div
        aria-label="Resize results panel"
        aria-orientation="horizontal"
        className={[
          "group relative cursor-row-resize bg-surface-950",
          !resizeEnabled ? "pointer-events-none opacity-60" : "",
        ].join(" ")}
        onMouseDown={onResizeStart}
        role="separator"
      >
        <div className="absolute left-0 right-0 top-0 h-px bg-line transition group-hover:bg-accent" />
      </div>

      <div className="flex justify-end gap-2 p-2">
        <Button
          disabled={!activeConnectionId || busy || !selectedActionSQL}
          onClick={() => void explain()}
          title={
            selectedActionSQL
              ? "Run database EXPLAIN for the selected SQL"
              : "Select a SQL statement to inspect its plan"
          }
        >
          <GitBranch size={14} />
          Plan
        </Button>
        <Button
          disabled={busy || !selectedActionSQL}
          onClick={explainQueryWithAI}
          title={
            selectedActionSQL
              ? "Ask AI to explain the selected SQL"
              : "Select a SQL statement to explain"
          }
        >
          <Bot size={14} />
          Explain
        </Button>
        <Button variant="primary" disabled={!activeConnectionId || busy} onClick={() => void run(false)}>
          <Play size={14} />
          Run
        </Button>
        <Button disabled={!busy} onClick={() => void onCancel()}>
          <Square size={14} />
          Cancel
        </Button>
      </div>
    </section>
  );
}

function QueryWorkspaceTabs({
  activeWorkspaceId,
  onCreateWorkspace,
  onDeleteWorkspace,
  onRenameCommit,
  onRenameStart,
  onSelectWorkspace,
  onTitleDraftChange,
  renamingWorkspaceId,
  titleDraft,
  workspaces,
}: {
  activeWorkspaceId: string;
  onCreateWorkspace(): void;
  onDeleteWorkspace(workspace: QueryWorkspace): void;
  onRenameCommit(workspace: QueryWorkspace, title: string): void;
  onRenameStart(workspace: QueryWorkspace): void;
  onSelectWorkspace(workspaceId: string): void;
  onTitleDraftChange(title: string): void;
  renamingWorkspaceId: string | null;
  titleDraft: string;
  workspaces: QueryWorkspace[];
}) {
  return (
    <div className="flex min-w-0 items-center gap-1 px-1">
      <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
        {workspaces.map((workspace) => {
          const active = workspace.id === activeWorkspaceId;
          const renaming = workspace.id === renamingWorkspaceId;
          return renaming ? (
            <input
              {...textInputBehaviorProps}
              autoFocus
              className="h-8 w-36 shrink-0 rounded-md border-transparent bg-surface-800 px-2 text-sm font-medium text-zinc-100"
              key={workspace.id}
              value={titleDraft}
              onBlur={() => onRenameCommit(workspace, titleDraft)}
              onChange={(event) => onTitleDraftChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
                if (event.key === "Escape") {
                  onTitleDraftChange(workspace.title);
                  event.currentTarget.blur();
                }
              }}
            />
          ) : (
            <div
              className={[
                "group flex h-8 w-36 shrink-0 items-center rounded-md border text-sm font-medium transition",
                active
                  ? "border-transparent bg-selection text-selection-foreground"
                  : "border-transparent text-zinc-500 hover:bg-selection-hover hover:text-zinc-200",
              ].join(" ")}
              key={workspace.id}
            >
              <button
                className="min-w-0 flex-1 truncate py-1.5 pl-2 pr-1 text-left"
                title="Double-click to rename"
                type="button"
                onClick={() => onSelectWorkspace(workspace.id)}
                onDoubleClick={() => onRenameStart(workspace)}
              >
                {workspace.title}
              </button>
              <button
                className="mr-1 grid h-6 w-6 shrink-0 place-items-center rounded-full text-zinc-500 opacity-0 transition hover:bg-selection-hover hover:text-zinc-100 group-hover:opacity-100 focus:opacity-100"
                title="Delete query workspace"
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onDeleteWorkspace(workspace);
                }}
              >
                <X size={12} />
              </button>
            </div>
          );
        })}
      </div>
      <button
        className="sticky right-0 grid h-8 w-8 shrink-0 place-items-center rounded-md bg-surface-950 text-zinc-500 transition hover:bg-surface-850 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-35"
        disabled={workspaces.length >= 3}
        title="New query workspace"
        type="button"
        onClick={onCreateWorkspace}
      >
        <Plus size={16} />
      </button>
    </div>
  );
}

function isRunnableSQLSelection(sql: string) {
  const normalized = stripLeadingSQLComments(sql).trim().toLowerCase();
  if (!normalized) return false;

  return /^(select|with|insert|update|delete|merge|explain|show|describe|desc|create|alter|drop|truncate|call|begin|commit|rollback)\b/.test(
    normalized,
  );
}

function stripLeadingSQLComments(sql: string) {
  let remaining = sql.trimStart();

  while (remaining.startsWith("--") || remaining.startsWith("/*")) {
    if (remaining.startsWith("--")) {
      const nextLine = remaining.indexOf("\n");
      remaining = nextLine >= 0 ? remaining.slice(nextLine + 1).trimStart() : "";
      continue;
    }

    const blockEnd = remaining.indexOf("*/");
    remaining = blockEnd >= 0 ? remaining.slice(blockEnd + 2).trimStart() : "";
  }

  return remaining;
}
