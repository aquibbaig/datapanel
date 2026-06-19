import { Database, Link2, PlugZap, Save } from "lucide-react";
import { ClipboardEvent, FormEvent, useEffect, useId, useState } from "react";
import { Button } from "../../components/ui/Button";
import type { ConnectionProfile, SaveConnectionRequest, TestConnectionRequest } from "../../lib/types";

interface Props {
  busy: boolean;
  initialProfile: ConnectionProfile | null;
  onConnect(profileId: string, password?: string): Promise<unknown>;
  onSave(input: SaveConnectionRequest): Promise<ConnectionProfile>;
  onTest(input: TestConnectionRequest): Promise<unknown>;
  onDone(): void;
}

const emptyForm: SaveConnectionRequest = {
  id: "",
  driver: "postgres",
  name: "",
  host: "localhost",
  port: 5432,
  database: "",
  username: "",
  password: "",
  sslMode: "prefer",
  color: "#5E6AD2"
};

const defaultPorts: Record<string, number> = {
  postgres: 5432,
  mysql: 3306
};

interface ParsedConnectionURL {
  driver: string;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  sslMode: string;
  name: string;
}

export function ConnectionPanel({
  busy,
  initialProfile,
  onConnect,
  onSave,
  onTest,
  onDone,
}: Props) {
  const [form, setForm] = useState<SaveConnectionRequest>(emptyForm);
  const [connectionUrl, setConnectionUrl] = useState("");
  const [urlError, setUrlError] = useState("");
  const connectionUrlInputId = useId();

  useEffect(() => {
    setConnectionUrl("");
    setUrlError("");
    if (!initialProfile) {
      setForm(emptyForm);
      return;
    }
    setForm({
      id: initialProfile.id,
      driver: initialProfile.driver || "postgres",
      name: initialProfile.name,
      host: initialProfile.host,
      port: initialProfile.port,
      database: initialProfile.database,
      username: initialProfile.username,
      password: "",
      sslMode: initialProfile.sslMode,
      color: initialProfile.color
    });
  }, [initialProfile]);

  function updateDriver(driver: string) {
    setForm((current) => {
      const previousDefaultPort = defaultPorts[current.driver || "postgres"];
      const nextPort =
        !current.port || current.port === previousDefaultPort
          ? defaultPorts[driver]
          : current.port;
      return { ...current, driver, port: nextPort };
    });
  }

  function importConnectionURL(value: string) {
    const parsed = parseConnectionURL(value);
    if (!parsed) {
      setUrlError("Enter a Postgres or MySQL connection URL.");
      return false;
    }

    setForm((current) => ({
      ...current,
      driver: parsed.driver,
      name: parsed.name,
      host: parsed.host,
      port: parsed.port,
      database: parsed.database,
      username: parsed.username,
      password: parsed.password,
      sslMode: parsed.sslMode,
    }));
    setUrlError("");
    return true;
  }

  function handleConnectionURLPaste(event: ClipboardEvent<HTMLInputElement>) {
    const pastedURL = event.clipboardData.getData("text").trim();
    if (!pastedURL) return;

    event.preventDefault();
    setConnectionUrl(pastedURL);
    importConnectionURL(pastedURL);
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    const profile = await onSave(form);
    await onConnect(profile.id, form.password);
    onDone();
  }

  async function handleTest() {
    await onTest({ ...form, profileId: form.id || "" });
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSave}>
      <div className="grid gap-2">
        {!initialProfile ? (
          <div className="grid gap-2">
            <label className="text-xs text-muted" htmlFor={connectionUrlInputId}>
              Import from URL
            </label>
            <div className="relative min-w-0">
              <Link2
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500"
                size={14}
              />
              <input
                id={connectionUrlInputId}
                className="pl-8"
                value={connectionUrl}
                onChange={(event) => {
                  setConnectionUrl(event.target.value);
                  setUrlError("");
                }}
                onPaste={handleConnectionURLPaste}
                placeholder="postgresql://user:password@localhost:5432/app"
              />
            </div>
            {urlError ? (
              <p className="text-xs leading-5 text-red-300">{urlError}</p>
            ) : null}
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 py-1">
              <span className="h-px bg-line" />
              <span className="text-[10px] font-semibold uppercase text-muted">OR</span>
              <span className="h-px bg-line" />
            </div>
          </div>
        ) : null}

        <label className="grid gap-2">
          <span className="text-xs text-muted">Driver</span>
          <select value={form.driver || "postgres"} onChange={(event) => updateDriver(event.target.value)}>
            <option value="postgres">Postgres</option>
            <option value="mysql">MySQL</option>
          </select>
        </label>
        <label className="grid gap-2">
          <span className="text-xs text-muted">Name</span>
          <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Production" />
        </label>
        <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-2">
          <label className="grid gap-2">
            <span className="text-xs text-muted">Host</span>
            <input value={form.host} onChange={(event) => setForm({ ...form, host: event.target.value })} />
          </label>
          <label className="grid gap-2">
            <span className="text-xs text-muted">Port</span>
            <input type="number" value={form.port} onChange={(event) => setForm({ ...form, port: Number(event.target.value) })} />
          </label>
        </div>
        <label className="grid gap-2">
          <span className="text-xs text-muted">Database</span>
          <input value={form.database} onChange={(event) => setForm({ ...form, database: event.target.value })} />
        </label>
        <label className="grid gap-2">
          <span className="text-xs text-muted">Username</span>
          <input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} />
        </label>
        <label className="grid gap-2">
          <span className="text-xs text-muted">Password</span>
          <input
            type="password"
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
            placeholder={initialProfile ? "Saved in keychain" : ""}
          />
        </label>
        <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-2">
          <label className="grid gap-2">
            <span className="text-xs text-muted">SSL</span>
            <select value={form.sslMode} onChange={(event) => setForm({ ...form, sslMode: event.target.value })}>
              <option value="prefer">prefer</option>
              <option value="disable">disable</option>
              <option value="require">require</option>
              <option value="verify-ca">verify-ca</option>
              <option value="verify-full">verify-full</option>
            </select>
          </label>
          <label className="grid gap-2">
            <span className="text-xs text-muted">Color</span>
            <input type="color" value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })} />
          </label>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" disabled={busy} onClick={handleTest}>
          <PlugZap size={14} />
          Test
        </Button>
        {initialProfile ? (
          <Button type="button" disabled={busy} onClick={() => void onConnect(initialProfile.id, form.password)}>
            <Database size={14} />
            Connect
          </Button>
        ) : null}
        <Button type="submit" variant="primary" disabled={busy}>
          <Save size={14} />
          Save & Connect
        </Button>
      </div>
    </form>
  );
}

function parseConnectionURL(value: string): ParsedConnectionURL | null {
  const normalized = normalizeConnectionURL(value);
  if (!normalized) return null;

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return null;
  }

  const driver = parseDriver(parsed.protocol);
  if (!driver || !parsed.hostname) return null;

  const port = parsed.port ? Number(parsed.port) : defaultPorts[driver];
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return null;

  const database = decodeURIComponent(parsed.pathname.replace(/^\/+/, "").split("/")[0] || "");
  const username = decodeURIComponent(parsed.username);
  if (!database || !username) return null;

  return {
    driver,
    host: parsed.hostname,
    port,
    database,
    username,
    password: decodeURIComponent(parsed.password),
    sslMode: parseSSLMode(parsed.searchParams),
    name: defaultConnectionName(driver, parsed.hostname, database),
  };
}

function normalizeConnectionURL(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.toLowerCase().startsWith("jdbc:postgresql://")) {
    return `postgresql://${trimmed.slice("jdbc:postgresql://".length)}`;
  }
  if (trimmed.toLowerCase().startsWith("jdbc:mysql://")) {
    return `mysql://${trimmed.slice("jdbc:mysql://".length)}`;
  }
  return trimmed;
}

function parseDriver(protocol: string) {
  switch (protocol.replace(":", "").toLowerCase()) {
    case "postgres":
    case "postgresql":
      return "postgres";
    case "mysql":
      return "mysql";
    default:
      return "";
  }
}

function parseSSLMode(params: URLSearchParams) {
  const rawMode =
    params.get("sslmode") ||
    params.get("ssl-mode") ||
    params.get("sslMode") ||
    params.get("ssl");
  const mode = (rawMode || "").toLowerCase();
  if (["disable", "allow", "prefer", "require", "verify-ca", "verify-full"].includes(mode)) {
    return mode;
  }
  if (mode === "true" || mode === "1" || mode === "required") {
    return "require";
  }
  if (mode === "false" || mode === "0") {
    return "disable";
  }
  return "prefer";
}

function defaultConnectionName(driver: string, host: string, database: string) {
  const label = driver === "mysql" ? "MySQL" : "Postgres";
  return `${label} ${database} @ ${host}`;
}
