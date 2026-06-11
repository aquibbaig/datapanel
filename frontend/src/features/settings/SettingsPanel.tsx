import { RotateCcw, Save, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "../../components/ui/Button";
import type { AppSettings } from "../../lib/types";

interface Props {
  settings: AppSettings | null;
  onUpdate(settings: AppSettings): Promise<void>;
}

export function SettingsPanel({ settings, onUpdate }: Props) {
  const [draft, setDraft] = useState<AppSettings | null>(settings);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    setDraft(settings);
    setSaveError("");
  }, [settings]);

  const dirty = useMemo(() => {
    if (!settings || !draft) return false;
    return JSON.stringify(settings) !== JSON.stringify(draft);
  }, [draft, settings]);

  if (!settings || !draft) {
    return <p className="text-sm text-muted">Loading settings...</p>;
  }

  async function saveSettings() {
    if (!draft || !dirty) return;
    setSaving(true);
    setSaveError("");
    try {
      await onUpdate(draft);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-zinc-200">
          <SlidersHorizontal size={14} />
          Preferences
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            disabled={!dirty || saving}
            size="icon"
            title="Reset unsaved changes"
            onClick={() => {
              setDraft(settings);
              setSaveError("");
            }}
          >
            <RotateCcw size={14} />
          </Button>
          <Button
            disabled={!dirty || saving}
            variant="primary"
            onClick={() => void saveSettings()}
          >
            <Save size={14} />
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <label className="grid grid-cols-[18px_minmax(0,1fr)] items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={draft.confirmDestructiveSql}
            onChange={(event) =>
              setDraft({
                ...draft,
                confirmDestructiveSql: event.target.checked,
              })
            }
          />
          <span>Warn before destructive SQL</span>
        </label>
        <label className="grid gap-2">
          <span className="text-xs text-muted">Default row limit</span>
          <input
            type="number"
            min={1}
            value={draft.queryLimit}
            onChange={(event) =>
              setDraft({ ...draft, queryLimit: Number(event.target.value) })
            }
          />
        </label>
        <label className="grid gap-2">
          <span className="text-xs text-muted">Query timeout</span>
          <input
            type="number"
            min={1}
            value={draft.queryTimeoutSeconds}
            onChange={(event) =>
              setDraft({
                ...draft,
                queryTimeoutSeconds: Number(event.target.value),
              })
            }
          />
        </label>
        <label className="grid grid-cols-[18px_minmax(0,1fr)] items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={draft.autoRefreshMetadata}
            onChange={(event) =>
              setDraft({ ...draft, autoRefreshMetadata: event.target.checked })
            }
          />
          <span>Refresh metadata after connect</span>
        </label>
        <label className="grid gap-2">
          <span className="text-xs text-muted">Chat response prompt</span>
          <textarea
            className="min-h-20 rounded-ui p-2 text-sm"
            placeholder="Talk to me like Keanu Reeves"
            value={draft.chatResponsePrompt}
            onChange={(event) =>
              setDraft({
                ...draft,
                chatResponsePrompt: event.target.value,
              })
            }
          />
        </label>
        {saveError ? (
          <p className="text-xs leading-5 text-red-300">{saveError}</p>
        ) : dirty ? (
          <p className="text-xs leading-5 text-muted">
            Settings have unsaved changes.
          </p>
        ) : null}
      </div>
    </section>
  );
}
