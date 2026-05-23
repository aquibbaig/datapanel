import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { connectionService, queryService, schemaService, settingsService } from "../lib/backend";
import type {
  AppSettings,
  ConnectionProfile,
  QueryRequest,
  QueryResult,
  SaveConnectionRequest,
  SchemaSummary,
  TableDetails,
  TableSummary,
  TestConnectionRequest
} from "../lib/types";

export interface StatusMessage {
  tone: "neutral" | "success" | "warning" | "danger";
  text: string;
}

interface QueryToastOptions {
  successMessage?: string;
  successTitle?: string;
}

export function useDataPanelState() {
  const [profiles, setProfiles] = useState<ConnectionProfile[]>([]);
  const [activeConnectionId, setActiveConnectionId] = useState<string>("");
  const [schemas, setSchemas] = useState<SchemaSummary[]>([]);
  const [tablesBySchema, setTablesBySchema] = useState<Record<string, TableSummary[]>>({});
  const [selectedTable, setSelectedTable] = useState<TableSummary | null>(null);
  const [tableDetails, setTableDetails] = useState<TableDetails | null>(null);
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [runningRequestId, setRunningRequestId] = useState<string>("");
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [status, setStatus] = useState<StatusMessage>({ tone: "neutral", text: "Ready" });
  const [busy, setBusy] = useState(false);
  const [initializing, setInitializing] = useState(true);

  const activeProfile = useMemo(
    () => profiles.find((profile) => profile.id === activeConnectionId) || null,
    [activeConnectionId, profiles]
  );

  const connectAndLoadMetadata = useCallback(async (profileId: string, password = "") => {
    const result = await connectionService.connect({ profileId, password });
    setActiveConnectionId(profileId);
    setStatus({ tone: "success", text: result.message });
    const nextSchemas = await schemaService.schemas(profileId);
    setSchemas(nextSchemas);
    const tableEntries = await Promise.all(
      nextSchemas.map(async (schema) => [schema.name, await schemaService.tables(profileId, schema.name)] as const)
    );
    setTablesBySchema(Object.fromEntries(tableEntries));
    return result;
  }, []);

  const loadProfiles = useCallback(async () => {
    const nextProfiles = await connectionService.list();
    setProfiles(nextProfiles);
    setActiveConnectionId((current) => current || nextProfiles[0]?.id || "");
    return nextProfiles;
  }, []);

  useEffect(() => {
    void Promise.all([loadProfiles(), settingsService.get().then(setSettings)])
      .then(async ([nextProfiles]) => {
        const firstProfileId = nextProfiles[0]?.id;
        if (firstProfileId) {
          await connectAndLoadMetadata(firstProfileId);
        }
      })
      .catch((error: unknown) => {
        const message = errorMessage(error, "Could not initialize app");
        setStatus({ tone: "danger", text: message });
        toast.error("Could not initialize app", { description: message });
      })
      .finally(() => setInitializing(false));
  }, [connectAndLoadMetadata, loadProfiles]);

  const saveConnection = useCallback(
    async (input: SaveConnectionRequest) => {
      setBusy(true);
      try {
        const profile = await connectionService.save(input);
        await loadProfiles();
        setStatus({ tone: "success", text: `${profile.name} saved` });
        toast.success("Connection saved", { description: profile.name });
        return profile;
      } catch (error) {
        const message = errorMessage(error, "Could not save connection");
        setStatus({ tone: "danger", text: message });
        toast.error("Could not save connection", { description: message });
        throw error;
      } finally {
        setBusy(false);
      }
    },
    [loadProfiles]
  );

  const testConnection = useCallback(async (input: TestConnectionRequest) => {
    setBusy(true);
    try {
      const result = await connectionService.test(input);
      setStatus({ tone: result.connected ? "success" : "danger", text: result.message });
      if (result.connected) {
        toast.success("Connection test passed", { description: input.name || input.host });
      } else {
        toast.error("Connection test failed", { description: result.message });
      }
      return result;
    } catch (error) {
      const message = errorMessage(error, "Connection failed");
      setStatus({ tone: "danger", text: message });
      toast.error("Connection test failed", { description: message });
      throw error;
    } finally {
      setBusy(false);
    }
  }, []);

  const connect = useCallback(async (profileId: string, password = "") => {
    setBusy(true);
    try {
      const result = await connectAndLoadMetadata(profileId, password);
      const profile = profiles.find((item) => item.id === profileId);
      toast.success("Connected", { description: profile?.name || result.message });
    } catch (error) {
      const message = errorMessage(error, "Could not connect");
      setStatus({ tone: "danger", text: message });
      toast.error("Could not connect", { description: message });
      throw error;
    } finally {
      setBusy(false);
    }
  }, [connectAndLoadMetadata, profiles]);

  const disconnect = useCallback(async () => {
    if (!activeConnectionId) return;
    await connectionService.disconnect(activeConnectionId);
    setActiveConnectionId("");
    setSchemas([]);
    setTablesBySchema({});
    setSelectedTable(null);
    setTableDetails(null);
    setStatus({ tone: "neutral", text: "Disconnected" });
    toast("Disconnected");
  }, [activeConnectionId]);

  const refreshMetadata = useCallback(async () => {
    if (!activeConnectionId) return;
    setBusy(true);
    try {
      const nextSchemas = await schemaService.schemas(activeConnectionId);
      setSchemas(nextSchemas);
      const tableEntries = await Promise.all(
        nextSchemas.map(async (schema) => [schema.name, await schemaService.tables(activeConnectionId, schema.name)] as const)
      );
      setTablesBySchema(Object.fromEntries(tableEntries));
      setStatus({ tone: "success", text: "Metadata refreshed" });
      toast.success("Metadata refreshed");
    } catch (error) {
      const message = errorMessage(error, "Could not refresh metadata");
      setStatus({ tone: "danger", text: message });
      toast.error("Could not refresh metadata", { description: message });
      throw error;
    } finally {
      setBusy(false);
    }
  }, [activeConnectionId]);

  const inspectTable = useCallback(
    async (table: TableSummary) => {
      if (!activeConnectionId) return;
      setSelectedTable(table);
      setTableDetails(null);
      try {
        const details = await schemaService.describe(activeConnectionId, table.schema, table.name);
        setTableDetails(details);
      } catch (error) {
        const message = errorMessage(error, "Could not load table metadata");
        setStatus({ tone: "danger", text: message });
        toast.error("Could not load table metadata", { description: message });
        throw error;
      }
    },
    [activeConnectionId]
  );

  const runQuery = useCallback(
    async (sql: string, confirmDestructive = false, toastOptions: QueryToastOptions = {}) => {
      if (!activeConnectionId || !settings) {
        setStatus({ tone: "warning", text: "Connect to a database before running SQL" });
        toast.warning("Connect to a database before running SQL");
        return null;
      }

      const requestId = crypto.randomUUID();
      const request: QueryRequest = {
        requestId,
        connectionId: activeConnectionId,
        sql,
        maxRows: settings.queryLimit,
        timeoutSeconds: settings.queryTimeoutSeconds,
        confirmDestructive
      };

      setRunningRequestId(requestId);
      setStatus({ tone: "neutral", text: "Running query..." });
      toast.loading("Running query", { id: requestId });
      try {
        const result = await queryService.execute(request);
        setQueryResult(result);
        if (result.error === "confirmation_required") {
          setStatus({ tone: "warning", text: "Confirmation required" });
          toast.warning("Confirmation required", {
            description: "Review the destructive SQL warning before running.",
            id: requestId
          });
        } else {
          const message =
            toastOptions.successMessage ||
            querySuccessMessage(result.rows.length, result.affectedRows, result.durationMs);
          setStatus({ tone: "success", text: message });
          toast.success(toastOptions.successTitle || "Query finished", {
            description: message,
            id: requestId
          });
        }
        return result;
      } catch (error) {
        const message = errorMessage(error, "Query failed");
        setStatus({ tone: "danger", text: message });
        toast.error("Query failed", { description: message, id: requestId });
        throw error;
      } finally {
        setRunningRequestId("");
      }
    },
    [activeConnectionId, settings]
  );

  const cancelQuery = useCallback(async () => {
    if (!runningRequestId) return;
    await queryService.cancel(runningRequestId);
    setStatus({ tone: "warning", text: "Cancel requested" });
    toast.warning("Cancel requested", { id: runningRequestId });
  }, [runningRequestId]);

  const updateSettings = useCallback(async (nextSettings: AppSettings) => {
    const saved = await settingsService.update(nextSettings);
    setSettings(saved);
    setStatus({ tone: "success", text: "Settings updated" });
    toast.success("Settings updated");
  }, []);

  return {
    profiles,
    activeProfile,
    activeConnectionId,
    schemas,
    tablesBySchema,
    selectedTable,
    tableDetails,
    queryResult,
    runningRequestId,
    settings,
    status,
    busy,
    initializing,
    saveConnection,
    testConnection,
    connect,
    disconnect,
    refreshMetadata,
    inspectTable,
    runQuery,
    cancelQuery,
    updateSettings
  };
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function querySuccessMessage(rows: number, affectedRows: number, durationMs: number) {
  if (rows > 0) {
    return `${rows} ${rows === 1 ? "row" : "rows"} in ${durationMs}ms`;
  }
  if (affectedRows > 0) {
    return `${affectedRows} ${affectedRows === 1 ? "row" : "rows"} affected in ${durationMs}ms`;
  }
  return `Query completed in ${durationMs}ms`;
}
