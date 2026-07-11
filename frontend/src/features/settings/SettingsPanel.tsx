import {
  FileText,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "../../components/ui/Button";
import { cn } from "../../lib/cn";
import { textInputBehaviorProps } from "../../lib/text-input";
import type { AppSettings, AppVersionInfo, UpdateCheckResult } from "../../lib/types";
import {
  settingsFields,
  settingsSections,
  type SectionId,
  type SettingsField,
} from "./settingsConfig";

interface AppUpdateStatus {
  checking: boolean;
  lastCheckedAt?: string;
  versionInfo?: AppVersionInfo | null;
  result?: UpdateCheckResult | null;
  error?: string;
}

interface Props {
  settings: AppSettings | null;
  appUpdateStatus: AppUpdateStatus;
  onCheckForUpdates(): Promise<unknown>;
  onOpenSettingsFile(): Promise<unknown>;
  onUpdate(settings: AppSettings): Promise<void>;
}

export function SettingsPanel({
  settings,
  appUpdateStatus,
  onCheckForUpdates,
  onOpenSettingsFile,
  onUpdate,
}: Props) {
  const [draft, setDraft] = useState<AppSettings | null>(settings);
  const [activeSection, setActiveSection] = useState<SectionId>("general");
  const [saving, setSaving] = useState(false);
  const lastSavedJsonRef = useRef(settings ? JSON.stringify(settings) : "");
  const pendingSaveJsonRef = useRef("");
  const debounceSaveJsonRef = useRef("");
  const debounceTimerRef = useRef<number | null>(null);
  const saveRunRef = useRef(0);

  useEffect(() => {
    if (!settings) {
      setDraft(null);
      lastSavedJsonRef.current = "";
      pendingSaveJsonRef.current = "";
      debounceSaveJsonRef.current = "";
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      setSaving(false);
      return;
    }

    const previousSavedJson = lastSavedJsonRef.current;
    const pendingSaveJson = pendingSaveJsonRef.current;
    const debounceSaveJson = debounceSaveJsonRef.current;
    const nextSavedJson = JSON.stringify(settings);
    lastSavedJsonRef.current = nextSavedJson;
    setDraft((current) => {
      if (!current) return settings;
      const currentJson = JSON.stringify(current);
      if (
        currentJson === previousSavedJson ||
        currentJson === nextSavedJson ||
        (currentJson === pendingSaveJson &&
          nextSavedJson === pendingSaveJson) ||
        (currentJson === debounceSaveJson &&
          nextSavedJson === debounceSaveJson)
      ) {
        return settings;
      }
      return current;
    });
    pendingSaveJsonRef.current = "";
    debounceSaveJsonRef.current = "";
    setSaving(false);
  }, [settings]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  if (!settings || !draft) {
    return <p className="p-5 text-sm text-muted">Loading settings...</p>;
  }

  const currentDraft = draft;

  function saveDraft(nextDraft: AppSettings) {
    const draftJson = JSON.stringify(nextDraft);
    if (draftJson === lastSavedJsonRef.current) return;

    const runId = saveRunRef.current + 1;
    saveRunRef.current = runId;
    pendingSaveJsonRef.current = draftJson;
    debounceSaveJsonRef.current = "";
    setSaving(true);

    void onUpdate(nextDraft)
      .then(() => {
        if (saveRunRef.current !== runId) return;
        lastSavedJsonRef.current = draftJson;
        pendingSaveJsonRef.current = "";
        setSaving(false);
      })
      .catch(() => {
        if (saveRunRef.current !== runId) return;
        pendingSaveJsonRef.current = "";
        setSaving(false);
      });
  }

  function queueDraftSave(nextDraft: AppSettings) {
    const draftJson = JSON.stringify(nextDraft);
    debounceSaveJsonRef.current = draftJson;
    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = window.setTimeout(() => {
      debounceTimerRef.current = null;
      saveDraft(nextDraft);
    }, 650);
  }

  function updateDraft(patch: Partial<AppSettings>, debounce = false) {
    if (!draft) return;
    const nextDraft = { ...draft, ...patch };
    setDraft(nextDraft);
    if (debounce) {
      queueDraftSave(nextDraft);
      return;
    }
    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
      debounceSaveJsonRef.current = "";
    }
    saveDraft(nextDraft);
  }

  const activeFields = settingsFields.filter(
    (field) => field.section === activeSection,
  );

  function renderSettingControl(field: SettingsField) {
    switch (field.kind) {
      case "segment":
        return (
          <SegmentedControl
            value={String(currentDraft[field.key] || "")}
            options={field.options}
            onChange={(value) =>
              updateDraft({ [field.key]: value } as Partial<AppSettings>)
            }
          />
        );
      case "toggle":
        return (
          <ToggleSwitch
            checked={Boolean(currentDraft[field.key])}
            disabled={field.key === "telemetryEnabled" ? saving : undefined}
            onChange={(value) =>
              updateDraft({ [field.key]: value } as Partial<AppSettings>)
            }
          />
        );
      case "number":
        return (
          <NumberInput
            value={Number(currentDraft[field.key])}
            onChange={(value) =>
              updateDraft({ [field.key]: value } as Partial<AppSettings>, true)
            }
          />
        );
      case "textarea":
        return (
          <textarea
            {...textInputBehaviorProps}
            className="min-h-24 rounded-ui p-2 text-sm"
            placeholder={field.placeholder}
            value={currentDraft[field.key] || ""}
            onChange={(event) =>
              updateDraft(
                { [field.key]: event.target.value } as Partial<AppSettings>,
                true,
              )
            }
          />
        );
      case "text":
        return (
          <div className="flex items-center gap-2">
            <input
              {...textInputBehaviorProps}
              className="min-w-0 flex-1"
              placeholder={field.placeholder}
              value={currentDraft[field.key] || ""}
              onChange={(event) =>
                updateDraft(
                  { [field.key]: event.target.value } as Partial<AppSettings>,
                  true,
                )
              }
            />
            {field.resetValue !== undefined ? (
              <Button
                disabled={currentDraft[field.key] === field.resetValue}
                size="icon"
                title={field.resetTitle}
                type="button"
                onClick={() =>
                  updateDraft({
                    [field.key]: field.resetValue,
                  } as Partial<AppSettings>)
                }
              >
                <RotateCcw size={14} />
              </Button>
            ) : null}
          </div>
        );
    }
  }

  return (
    <section className="grid h-[min(680px,78vh)] grid-cols-[190px_minmax(0,1fr)] overflow-hidden">
      <nav className="border-r border-line bg-surface-900/60 p-3">
        <div className="grid gap-1">
          {settingsSections.map((section) => {
            const Icon = section.icon;
            const active = activeSection === section.id;
            return (
              <button
                key={section.id}
                type="button"
                className={cn(
                  "flex h-9 items-center gap-2 rounded-md px-3 text-left text-sm font-medium transition",
                  active
                    ? "bg-selection text-selection-foreground"
                    : "text-zinc-500 hover:bg-control/[0.05] hover:text-zinc-200",
                )}
                onClick={() => setActiveSection(section.id)}
              >
                <Icon size={15} />
                {section.label}
              </button>
            );
          })}
        </div>
      </nav>

      <div className="flex min-h-0 flex-col bg-surface-850">
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2">
          <div className="divide-y divide-line">
            {activeFields.map((field) => (
              <SettingRow
                key={field.key}
                title={field.title}
                description={field.description}
                wide={"wide" in field ? field.wide : undefined}
              >
                {renderSettingControl(field)}
              </SettingRow>
            ))}

            {activeSection === "general" ? (
              <>
                <SettingRow
                  title="Settings file"
                  description="Open the config file used for these options."
                >
                  <Button
                    type="button"
                    onClick={() => void onOpenSettingsFile()}
                  >
                    <FileText size={14} />
                    Open file
                  </Button>
                </SettingRow>
                <SettingRow
                  title="Version"
                  description={versionDescription(appUpdateStatus.versionInfo)}
                >
                  <span className="select-text text-sm font-medium text-zinc-200">
                    {appUpdateStatus.versionInfo?.currentVersion || "dev"}
                  </span>
                </SettingRow>
                <SettingRow
                  title="App updates"
                  description={updateCheckDescription(appUpdateStatus)}
                >
                  <Button
                    disabled={appUpdateStatus.checking}
                    type="button"
                    onClick={() => void onCheckForUpdates()}
                  >
                    <RefreshCw
                      className={cn(appUpdateStatus.checking && "animate-spin")}
                      size={14}
                    />
                    Check now
                  </Button>
                </SettingRow>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function SettingRow({
  title,
  description,
  wide,
  children,
}: {
  title: string;
  description: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid gap-4 py-4",
        wide
          ? "grid-cols-1"
          : "grid-cols-[minmax(0,1fr)_minmax(180px,260px)] items-center",
      )}
    >
      <div className="grid gap-1">
        <span className="text-sm font-medium text-zinc-100">{title}</span>
        <span className="text-sm leading-5 text-muted">{description}</span>
      </div>
      <div className={wide ? "w-full" : "justify-self-end"}>{children}</div>
    </div>
  );
}

function ToggleSwitch({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange(checked: boolean): void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={cn(
        "relative h-6 w-11 rounded-full border border-line transition disabled:cursor-not-allowed disabled:opacity-60",
        checked ? "bg-accent" : "bg-surface-700",
      )}
      onClick={() => onChange(!checked)}
    >
      <span
        className={cn(
          "absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white transition",
          checked ? "left-[22px]" : "left-1",
        )}
      />
    </button>
  );
}

function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly { value: T; label: string; icon?: ReactNode }[];
  onChange(value: T): void;
}) {
  return (
    <div
      className={cn(
        "grid gap-1 rounded-md border border-line bg-control/[0.03] p-1",
        options.length === 3 ? "grid-cols-3" : "grid-cols-2",
      )}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={cn(
            "inline-flex h-7 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded px-2 text-xs font-medium transition",
            value === option.value
              ? "bg-selection text-selection-foreground"
              : "text-zinc-500 hover:bg-selection-hover hover:text-zinc-200",
          )}
          onClick={() => onChange(option.value)}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}

function NumberInput({
  value,
  onChange,
}: {
  value: number;
  onChange(value: number): void;
}) {
  return (
    <input
      type="number"
      min={1}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
    />
  );
}

function updateCheckDescription(status: AppUpdateStatus) {
  if (status.checking) return "Checking for the latest DataPanel release.";
  if (status.error) return status.error;
  if (status.result?.updateAvailable) return status.result.message;
  if (status.lastCheckedAt) {
    return `Last checked ${formatDateTime(status.lastCheckedAt)}.`;
  }
  return "DataPanel checks for updates every 15 minutes while open.";
}

function versionDescription(versionInfo?: AppVersionInfo | null) {
  if (!versionInfo) return "Current DataPanel app version.";
  const releaseHash = versionInfo.currentReleaseHash?.trim();
  if (!releaseHash || releaseHash === "dev" || releaseHash === versionInfo.currentVersion) {
    return "Current DataPanel app version.";
  }
  return `Build ${releaseHash}.`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
