import { Database, PlugZap, Save } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
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

export function ConnectionPanel({ busy, initialProfile, onConnect, onSave, onTest, onDone }: Props) {
  const [form, setForm] = useState<SaveConnectionRequest>(emptyForm);

  useEffect(() => {
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
          Save
        </Button>
      </div>
    </form>
  );
}
