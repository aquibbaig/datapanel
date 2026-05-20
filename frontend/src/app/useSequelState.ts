import { useCallback, useEffect, useMemo, useState } from "react";
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

export function useSequelState() {
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
        setStatus({ tone: "danger", text: error instanceof Error ? error.message : "Could not initialize app" });
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
        return profile;
      } catch (error) {
        setStatus({ tone: "danger", text: error instanceof Error ? error.message : "Could not save connection" });
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
      return result;
    } catch (error) {
      setStatus({ tone: "danger", text: error instanceof Error ? error.message : "Connection failed" });
      throw error;
    } finally {
      setBusy(false);
    }
  }, []);

  const connect = useCallback(async (profileId: string, password = "") => {
    setBusy(true);
    try {
      await connectAndLoadMetadata(profileId, password);
    } catch (error) {
      setStatus({ tone: "danger", text: error instanceof Error ? error.message : "Could not connect" });
      throw error;
    } finally {
      setBusy(false);
    }
  }, [connectAndLoadMetadata]);

  const disconnect = useCallback(async () => {
    if (!activeConnectionId) return;
    await connectionService.disconnect(activeConnectionId);
    setActiveConnectionId("");
    setSchemas([]);
    setTablesBySchema({});
    setSelectedTable(null);
    setTableDetails(null);
    setStatus({ tone: "neutral", text: "Disconnected" });
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
    } finally {
      setBusy(false);
    }
  }, [activeConnectionId]);

  const inspectTable = useCallback(
    async (table: TableSummary) => {
      if (!activeConnectionId) return;
      setSelectedTable(table);
      setTableDetails(null);
      const details = await schemaService.describe(activeConnectionId, table.schema, table.name);
      setTableDetails(details);
    },
    [activeConnectionId]
  );

  const runQuery = useCallback(
    async (sql: string, confirmDestructive = false) => {
      if (!activeConnectionId || !settings) {
        setStatus({ tone: "warning", text: "Connect to a database before running SQL" });
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
      try {
        const result = await queryService.execute(request);
        setQueryResult(result);
        if (result.error === "confirmation_required") {
          setStatus({ tone: "warning", text: "Confirmation required" });
        } else {
          setStatus({ tone: "success", text: `${result.rows.length} rows in ${result.durationMs}ms` });
        }
        return result;
      } catch (error) {
        setStatus({ tone: "danger", text: error instanceof Error ? error.message : "Query failed" });
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
  }, [runningRequestId]);

  const updateSettings = useCallback(async (nextSettings: AppSettings) => {
    const saved = await settingsService.update(nextSettings);
    setSettings(saved);
    setStatus({ tone: "success", text: "Settings updated" });
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
