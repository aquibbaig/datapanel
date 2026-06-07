import { SlidersHorizontal } from "lucide-react";
import type { AppSettings } from "../../lib/types";

interface Props {
  settings: AppSettings | null;
  onUpdate(settings: AppSettings): Promise<void>;
}

export function SettingsPanel({ settings, onUpdate }: Props) {
  if (!settings) {
    return <p className="text-sm text-muted">Loading settings...</p>;
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
        <SlidersHorizontal size={14} />
        Preferences
      </div>
      <div className="flex flex-col gap-2">
        <label className="grid grid-cols-[18px_minmax(0,1fr)] items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={settings.confirmDestructiveSql}
            onChange={(event) => void onUpdate({ ...settings, confirmDestructiveSql: event.target.checked })}
          />
          <span>Warn before destructive SQL</span>
        </label>
        <label className="grid gap-2">
          <span className="text-xs text-muted">Default row limit</span>
          <input
            type="number"
            min={1}
            value={settings.queryLimit}
            onChange={(event) => void onUpdate({ ...settings, queryLimit: Number(event.target.value) })}
          />
        </label>
        <label className="grid gap-2">
          <span className="text-xs text-muted">Query timeout</span>
          <input
            type="number"
            min={1}
            value={settings.queryTimeoutSeconds}
            onChange={(event) => void onUpdate({ ...settings, queryTimeoutSeconds: Number(event.target.value) })}
          />
        </label>
        <label className="grid grid-cols-[18px_minmax(0,1fr)] items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={settings.autoRefreshMetadata}
            onChange={(event) => void onUpdate({ ...settings, autoRefreshMetadata: event.target.checked })}
          />
          <span>Refresh metadata after connect</span>
        </label>
        <label className="grid gap-2">
          <span className="text-xs text-muted">Chat response prompt</span>
          <textarea
            className="min-h-20 rounded-ui p-2 text-sm"
            placeholder="Talk to me like Keanu Reeves"
            value={settings.chatResponsePrompt}
            onChange={(event) =>
              void onUpdate({
                ...settings,
                chatResponsePrompt: event.target.value,
              })
            }
          />
        </label>
      </div>
    </section>
  );
}
