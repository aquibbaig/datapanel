import { AlertTriangle, Play, Square } from "lucide-react";
import { useState } from "react";
import { Button } from "../../components/ui/Button";
import { queryService } from "../../lib/backend";
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
  busy: boolean;
  schemas: SchemaSummary[];
  settings: AppSettings | null;
  tablesBySchema: Record<string, TableSummary[]>;
  onRun(sql: string, confirmDestructive?: boolean): Promise<unknown>;
  onCancel(): Promise<void>;
}

const starterSQL = "select *\nfrom users\nlimit 50;";

export function QueryEditor({
  activeConnectionId,
  activeProfile,
  busy,
  schemas,
  settings,
  tablesBySchema,
  onRun,
  onCancel,
}: Props) {
  const [sql, setSQL] = useState(starterSQL);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [pendingSQL, setPendingSQL] = useState("");

  async function run(confirmDestructive = false, sqlOverride?: string) {
    const sqlToRun = (sqlOverride || (confirmDestructive ? pendingSQL : "") || sql).trim();
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

  return (
    <section className="grid min-h-0 grid-rows-[38px_minmax(0,1fr)_auto_auto] border-b border-line bg-surface-950">
      <div className="flex items-center justify-between border-b border-line">
        <Button className="rounded-none border-y-0 border-l-0 border-r border-line bg-surface-850 text-zinc-100 hover:bg-surface-850" size="tab" variant="ghost">
          Query 1
        </Button>
        <span className="px-4 text-xs text-muted">
          limit {settings?.queryLimit ?? 500} / timeout {settings?.queryTimeoutSeconds ?? 30}s
        </span>
      </div>

      <div className="relative min-h-0">
        <SqlCodeEditor
          activeProfile={activeProfile}
          schemas={schemas}
          tablesBySchema={tablesBySchema}
          value={sql}
          onChange={setSQL}
          onRun={(selectedSQL) => void run(false, selectedSQL)}
        />
      </div>

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

      <div className="flex justify-end gap-2 border-t border-line p-2">
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
