import { Monitor, Moon, RotateCcw, Save, Sun } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "../../components/ui/Button";
import { textInputBehaviorProps } from "../../lib/text-input";
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

  async function saveDraft(nextDraft: AppSettings) {
    setSaving(true);
    setSaveError("");
    try {
      await onUpdate(nextDraft);
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Could not save settings",
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveSettings() {
    if (!draft || !dirty) return;
    await saveDraft(draft);
  }

  function updateTelemetryEnabled(telemetryEnabled: boolean) {
    if (!draft) return;
    const nextDraft = { ...draft, telemetryEnabled };
    setDraft(nextDraft);
    void saveDraft(nextDraft);
  }

  return (
    <section className="flex max-h-[72vh] flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto pb-4 pr-1">
        <div className="flex flex-col gap-2">
          <div className="grid gap-2">
            <span className="text-xs text-muted">Theme</span>
            <div className="grid grid-cols-3 rounded-md border border-line bg-control/[0.03] p-1">
              {themeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`inline-flex h-7 items-center justify-center gap-1.5 rounded text-xs font-medium transition ${
                    (draft.theme || "system") === option.value
                      ? "bg-selection text-selection-foreground"
                      : "text-zinc-500 hover:bg-selection-hover hover:text-zinc-200"
                  }`}
                  onClick={() => setDraft({ ...draft, theme: option.value })}
                >
                  {option.icon}
                  {option.label}
                </button>
              ))}
            </div>
          </div>
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
                setDraft({
                  ...draft,
                  autoRefreshMetadata: event.target.checked,
                })
              }
            />
            <span>Refresh metadata after connect</span>
          </label>
          <label className="grid gap-2">
            <span className="text-xs text-muted">Export folder</span>
            <div className="flex items-center gap-2">
              <input
                {...textInputBehaviorProps}
                className="min-w-0 flex-1"
                placeholder="~/Downloads"
                value={draft.exportDirectory || ""}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    exportDirectory: event.target.value,
                  })
                }
              />
              <Button
                disabled={!draft.exportDirectory}
                size="icon"
                title="Use system Downloads folder"
                type="button"
                onClick={() => setDraft({ ...draft, exportDirectory: "" })}
              >
                <RotateCcw size={14} />
              </Button>
            </div>
            <span className="text-xs leading-5 text-muted">
              Leave blank to save to your system Downloads folder. Exports show
              the exact saved path.
            </span>
          </label>
          <label className="grid grid-cols-[18px_minmax(0,1fr)] items-start gap-2 text-sm text-zinc-300">
            <input
              className="mt-0.5"
              type="checkbox"
              checked={draft.telemetryEnabled}
              disabled={saving}
              onChange={(event) =>
                updateTelemetryEnabled(event.target.checked)
              }
            />
            <span className="grid gap-1">
              <span>Share anonymous diagnostics</span>
              <span className="text-xs leading-5 text-muted">
                Sends install counts and crash reports without database content.
              </span>
            </span>
          </label>
          <div className="grid gap-2">
            <span className="text-xs text-muted">Cursor style</span>
            <div className="grid grid-cols-2 rounded-md border border-line bg-control/[0.03] p-1">
              {(["default", "pointer"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`h-7 rounded text-xs font-medium transition ${
                    (draft.cursorMode || "default") === mode
                      ? "bg-selection text-selection-foreground"
                      : "text-zinc-500 hover:bg-selection-hover hover:text-zinc-200"
                  }`}
                  onClick={() => setDraft({ ...draft, cursorMode: mode })}
                >
                  {mode === "default" ? "Default" : "Pointer"}
                </button>
              ))}
            </div>
          </div>
          <label className="grid gap-2">
            <span className="text-xs text-muted">Chat response prompt</span>
            <textarea
              {...textInputBehaviorProps}
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
            <p className="text-xs leading-5 text-danger">{saveError}</p>
          ) : dirty ? (
            <p className="text-xs leading-5 text-muted">
              Settings have unsaved changes.
            </p>
          ) : null}
        </div>
      </div>
      <div className="-mx-4 -mb-4 flex items-center justify-end gap-2 border-t border-line px-4 py-3">
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
    </section>
  );
}

const themeOptions = [
  { value: "system", label: "System", icon: <Monitor size={13} /> },
  { value: "light", label: "Light", icon: <Sun size={13} /> },
  { value: "dark", label: "Dark", icon: <Moon size={13} /> },
] as const;
