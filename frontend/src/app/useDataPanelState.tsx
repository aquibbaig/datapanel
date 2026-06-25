import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Download, ExternalLink, Info, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { BrowserOpenURL } from "../../wailsjs/runtime/runtime";
import { aiCredentialService, appDataService, connectionService, queryService, schemaService, settingsService, updateService } from "../lib/backend";
import {
  configureTelemetry,
  trackAppOpened,
  trackTelemetryFirstLaunch,
} from "../lib/telemetry";
import type {
  AppSettings,
  ConnectionHealth,
  ConnectionProfile,
  QueryHistoryEntry,
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

export interface WorkspaceSwitchState {
  profileId: string;
  name: string;
}

interface QueryResultSnapshot {
  result: QueryResult | null;
  mode: "query" | "explain";
}

interface QueryToastOptions {
  successMessage?: string;
  successTitle?: string;
  recordHistory?: boolean;
  historyMode?: "query" | "explain";
  historySQL?: string;
}

interface MetadataLoadOptions {
  refresh?: boolean;
  reconnectKeychain?: boolean;
  backgroundRefresh?: boolean;
}

interface ConnectOptions {
  suppressErrorToast?: boolean;
  reconnectKeychain?: boolean;
  refresh?: boolean;
}

interface PrefetchMetadataOptions {
  refresh?: boolean;
}

interface SchemaSnapshot {
  schemas: SchemaSummary[];
  tablesBySchema: Record<string, TableSummary[]>;
  fingerprint?: string;
}

const schemaSnapshotQueryKey = (profileId: string) =>
  ["schemaSnapshot", profileId] as const;

const tableDetailsQueryKey = (connectionId: string, schema: string, table: string) =>
  ["tableDetails", connectionId, schema, table] as const;

const activeWorkspaceStorageKey = "datapanel.activeWorkspaceId";
const maxBackgroundWorkspacePrefetches = 5;
const maxToastDescriptionLength = 260;

function loadLastActiveWorkspaceId() {
  try {
    return localStorage.getItem(activeWorkspaceStorageKey) || "";
  } catch {
    return "";
  }
}

function saveLastActiveWorkspaceId(profileId: string) {
  try {
    if (profileId) {
      localStorage.setItem(activeWorkspaceStorageKey, profileId);
    } else {
      localStorage.removeItem(activeWorkspaceStorageKey);
    }
  } catch {
    // The selected connection still changes for the current session.
  }
}

function preferredWorkspaceId(profiles: ConnectionProfile[]) {
  const savedProfileId = loadLastActiveWorkspaceId();
  if (savedProfileId && profiles.some((profile) => profile.id === savedProfileId)) {
    return savedProfileId;
  }
  return profiles[0]?.id || "";
}

async function applyTelemetrySettings(
  nextSettings: AppSettings,
  options: { trackAppOpen: boolean },
) {
  await configureTelemetry(nextSettings);
  let appliedSettings = nextSettings;

  if (await settingsService.shouldReportTelemetryFirstLaunch()) {
    const eventQueued = await trackTelemetryFirstLaunch(appliedSettings);
    if (eventQueued) {
      try {
        await settingsService.markTelemetryFirstLaunchReported();
      } catch (error) {
        console.warn("Could not mark telemetry first launch as reported", error);
      }
    }
  }

  if (options.trackAppOpen) {
    await trackAppOpened(appliedSettings);
  }

  return appliedSettings;
}

export function useDataPanelState() {
  const queryClient = useQueryClient();
  const [profiles, setProfiles] = useState<ConnectionProfile[]>([]);
  const [activeConnectionId, setActiveConnectionId] = useState<string>("");
  const [schemas, setSchemas] = useState<SchemaSummary[]>([]);
  const [tablesBySchema, setTablesBySchema] = useState<Record<string, TableSummary[]>>({});
  const [selectedTable, setSelectedTable] = useState<TableSummary | null>(null);
  const [tableDetails, setTableDetails] = useState<TableDetails | null>(null);
  const [inspectingTable, setInspectingTable] = useState<TableSummary | null>(null);
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [queryResultMode, setQueryResultMode] =
    useState<"query" | "explain">("query");
  const [runningRequestId, setRunningRequestId] = useState<string>("");
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [status, setStatus] = useState<StatusMessage>({ tone: "neutral", text: "Ready" });
  const [connectionHealth, setConnectionHealth] = useState<ConnectionHealth>({ connected: false });
  const [queryHistory, setQueryHistory] = useState<QueryHistoryEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [workspaceSwitching, setWorkspaceSwitching] =
    useState<WorkspaceSwitchState | null>(null);
  const inspectRequestRef = useRef(0);
  const queryRequestRef = useRef(0);
  const metadataRequestRef = useRef(0);
  const updateCheckStartedRef = useRef(false);
  const profilesRef = useRef<ConnectionProfile[]>([]);
  const activeConnectionIdRef = useRef("");
  const queryResultRef = useRef<QueryResult | null>(null);
  const queryResultModeRef = useRef<"query" | "explain">("query");
  const queryResultByConnectionRef = useRef<Record<string, QueryResultSnapshot>>({});

  const activeProfile = useMemo(
    () => profiles.find((profile) => profile.id === activeConnectionId) || null,
    [activeConnectionId, profiles]
  );

  useEffect(() => {
    profilesRef.current = profiles;
  }, [profiles]);

  useEffect(() => {
    activeConnectionIdRef.current = activeConnectionId;
  }, [activeConnectionId]);

  useEffect(() => {
    queryResultRef.current = queryResult;
  }, [queryResult]);

  useEffect(() => {
    queryResultModeRef.current = queryResultMode;
  }, [queryResultMode]);

  const readMemorySchemaSnapshotCache = useCallback((profileId: string) => {
    const cached = queryClient.getQueryData<SchemaSnapshot>(
      schemaSnapshotQueryKey(profileId),
    );
    return cached && schemaSnapshotHasTables(cached) ? cached : null;
  }, [queryClient]);

  const readSchemaSnapshotCache = useCallback(async (profileId: string) => {
    const cached = readMemorySchemaSnapshotCache(profileId);
    if (cached && schemaSnapshotHasTables(cached)) return cached;

    const persisted = await appDataService
      .getSchemaSnapshot(profileId)
      .catch((error: unknown) => {
        console.warn("Schema snapshot cache load failed", error);
        return null;
      });
    if (persisted && persisted.schemas.length > 0) {
      const snapshot = {
        schemas: persisted.schemas,
        tablesBySchema: persisted.tablesBySchema,
        fingerprint: persisted.fingerprint,
      };
      if (!schemaSnapshotHasTables(snapshot)) return null;
      queryClient.setQueryData(schemaSnapshotQueryKey(profileId), snapshot);
      return snapshot;
    }

    return null;
  }, [queryClient, readMemorySchemaSnapshotCache]);

  const fetchSchemaSnapshot = useCallback(async (profileId: string, options: MetadataLoadOptions = {}) => {
    const cached = options.refresh ? null : await readSchemaSnapshotCache(profileId);
    if (cached) return cached;

    const fingerprint = await schemaService
      .fingerprint(profileId)
      .then((result) => result.hash)
      .catch(() => "");

    const existingSnapshot = queryClient.getQueryData<SchemaSnapshot>(
      schemaSnapshotQueryKey(profileId),
    );
    if (existingSnapshot?.fingerprint && fingerprint && existingSnapshot.fingerprint !== fingerprint) {
      queryClient.removeQueries({ queryKey: ["tableDetails", profileId] });
    }

    const nextSchemas = await schemaService.refresh(profileId);
    const profile = profilesRef.current.find((item) => item.id === profileId);
    const tableEntries = await Promise.all(
      nextSchemas.map(async (schema) => {
        try {
          return [schema.name, await schemaService.tables(profileId, schema.name)] as const;
        } catch (error) {
          if (profile?.driver !== "bigquery") throw error;
          console.warn(`BigQuery table metadata load failed for ${schema.name}`, error);
          return [schema.name, []] as const;
        }
      })
    );
    const nextTablesBySchema = Object.fromEntries(tableEntries);
    const snapshot = {
      schemas: nextSchemas,
      tablesBySchema: nextTablesBySchema,
      fingerprint,
    };
    queryClient.setQueryData(schemaSnapshotQueryKey(profileId), snapshot);
    await appDataService
      .saveSchemaSnapshot({
        connectionId: profileId,
        schemas: nextSchemas,
        tablesBySchema: nextTablesBySchema,
        fingerprint,
      })
      .catch((error: unknown) => {
        console.warn("Schema snapshot cache save failed", error);
      });
    return snapshot;
  }, [queryClient, readSchemaSnapshotCache]);

  const applySchemaSnapshot = useCallback((profileId: string, snapshot: SchemaSnapshot) => {
    if (activeConnectionIdRef.current !== profileId) return false;
    setSchemas(snapshot.schemas);
    setTablesBySchema(snapshot.tablesBySchema);
    return true;
  }, []);

  const loadMetadata = useCallback(async (profileId: string, options: MetadataLoadOptions = {}) => {
    const requestId = metadataRequestRef.current + 1;
    metadataRequestRef.current = requestId;
    const snapshot = await fetchSchemaSnapshot(profileId, options);
    if (metadataRequestRef.current === requestId) {
      applySchemaSnapshot(profileId, snapshot);
    }
    return snapshot;
  }, [applySchemaSnapshot, fetchSchemaSnapshot]);

  const refreshMetadataInBackground = useCallback((profileId: string) => {
    const requestId = metadataRequestRef.current + 1;
    metadataRequestRef.current = requestId;
    void fetchSchemaSnapshot(profileId, { refresh: true })
      .then((snapshot) => {
        if (metadataRequestRef.current !== requestId) return;
        applySchemaSnapshot(profileId, snapshot);
      })
      .catch((error: unknown) => {
        console.warn("Background metadata refresh failed", error);
      });
  }, [applySchemaSnapshot, fetchSchemaSnapshot]);

  const invalidateSchemaSnapshot = useCallback(async (profileId: string) => {
    queryClient.removeQueries({ queryKey: schemaSnapshotQueryKey(profileId) });
    queryClient.removeQueries({ queryKey: ["tableDetails", profileId] });
    await appDataService
      .saveSchemaSnapshot({
        connectionId: profileId,
        schemas: [],
        tablesBySchema: {},
        fingerprint: "",
      })
      .catch((error: unknown) => {
        console.warn("Schema snapshot cache clear failed", error);
      });
  }, [queryClient]);

  const prefetchWorkspaceMetadata = useCallback(async (
    profilesToPrefetch: ConnectionProfile[],
    options: PrefetchMetadataOptions = {},
  ) => {
    const queuedProfiles = profilesToPrefetch.filter((profile) => profile.id);
    if (queuedProfiles.length === 0) return;

    await runWithConcurrency(
      queuedProfiles,
      maxBackgroundWorkspacePrefetches,
      async (profile) => {
        try {
          const cached = await readSchemaSnapshotCache(profile.id);
          if (cached && !options.refresh) return;
          await connectionService.connect({
            profileId: profile.id,
            password: "",
            reconnectKeychain: false,
          });
          await fetchSchemaSnapshot(profile.id, { refresh: Boolean(options.refresh) });
        } catch (error) {
          console.warn(`Connection metadata prefetch failed for ${profile.name}`, error);
        }
      },
    );
  }, [fetchSchemaSnapshot, readSchemaSnapshotCache]);

  const clearSelectedTable = useCallback(() => {
    inspectRequestRef.current += 1;
    setSelectedTable(null);
    setTableDetails(null);
    setInspectingTable(null);
  }, []);

  const resetQueryState = useCallback((toastId = "") => {
    queryRequestRef.current += 1;
    setQueryResult(null);
    setQueryResultMode("query");
    setRunningRequestId("");
    if (toastId) {
      toast.dismiss(toastId);
    }
  }, []);

  const saveActiveQueryResultSnapshot = useCallback((connectionId: string) => {
    if (!connectionId) return;
    queryResultByConnectionRef.current[connectionId] = {
      result: queryResultRef.current,
      mode: queryResultModeRef.current,
    };
  }, []);

  const restoreQueryResultSnapshot = useCallback((connectionId: string) => {
    const snapshot = queryResultByConnectionRef.current[connectionId];
    queryRequestRef.current += 1;
    setQueryResult(snapshot?.result ?? null);
    setQueryResultMode(snapshot?.mode ?? "query");
    setRunningRequestId("");
  }, []);

  const connectAndLoadMetadata = useCallback(async (
    profileId: string,
    password = "",
    options: MetadataLoadOptions = { refresh: true },
  ) => {
    const started = performance.now();
    const result = await connectionService.connect({
      profileId,
      password,
      reconnectKeychain: Boolean(options.reconnectKeychain),
    });
    const now = new Date().toISOString();
    activeConnectionIdRef.current = profileId;
    saveLastActiveWorkspaceId(profileId);
    setActiveConnectionId(profileId);
    clearSelectedTable();
    setStatus({ tone: "success", text: result.message });
    setConnectionHealth({
      connected: true,
      latencyMs: Math.max(0, Math.round(performance.now() - started)),
      lastPingAt: now,
      connectedAt: now,
    });
    if (options.backgroundRefresh) {
      const cached = await readSchemaSnapshotCache(profileId);
      if (cached) {
        metadataRequestRef.current += 1;
        applySchemaSnapshot(profileId, cached);
        refreshMetadataInBackground(profileId);
        return result;
      }
    }
    await loadMetadata(profileId, options);
    return result;
  }, [
    applySchemaSnapshot,
    clearSelectedTable,
    loadMetadata,
    readSchemaSnapshotCache,
    refreshMetadataInBackground,
  ]);

  const loadProfiles = useCallback(async () => {
    const nextProfiles = await connectionService.list();
    const initialProfileId = preferredWorkspaceId(nextProfiles);
    setProfiles(nextProfiles);
    setActiveConnectionId((current) =>
      current && nextProfiles.some((profile) => profile.id === current)
        ? current
        : initialProfileId,
    );
    return nextProfiles;
  }, []);

  useEffect(() => {
    void Promise.all([
      loadProfiles(),
      settingsService
        .get()
        .then((nextSettings) =>
          applyTelemetrySettings(nextSettings, { trackAppOpen: true }),
        )
        .then((nextSettings) => {
          setSettings(nextSettings);
          return nextSettings;
        }),
      aiCredentialService.list().catch((error: unknown) => {
        console.warn("AI credential warmup failed", error);
      }),
    ])
      .then(async ([nextProfiles]) => {
        const initialProfileId = preferredWorkspaceId(nextProfiles);
        if (initialProfileId) {
          await connectAndLoadMetadata(initialProfileId, "", {
            refresh: false,
          });
          void prefetchWorkspaceMetadata(nextProfiles, { refresh: true });
        }
      })
      .catch((error: unknown) => {
        const message = errorMessage(error, "Could not initialize app");
        setStatus({ tone: "danger", text: message });
        setConnectionHealth({ connected: false, error: message });
        notify("danger", "Could not initialize app", message);
      })
      .finally(() => setInitializing(false));
  }, [connectAndLoadMetadata, loadProfiles, prefetchWorkspaceMetadata]);

  useEffect(() => {
    if (isLocalDev()) return;
    if (updateCheckStartedRef.current) return;
    updateCheckStartedRef.current = true;

    void updateService
      .check()
      .then((result) => {
        if (!result.updateAvailable) return;

        setStatus({ tone: "warning", text: result.message });
        toast("Update available", {
          description: updateDescription(result.latestVersion, result.assetName),
          duration: Infinity,
          icon: result.canInstall ? (
            <Download className="h-4 w-4 text-zinc-300" />
          ) : (
            <ExternalLink className="h-4 w-4 text-zinc-300" />
          ),
          action: {
            label: result.canInstall ? "Download" : "Open",
            onClick: () => {
              if (result.canInstall) {
                void installAppUpdate(result.assetName);
                return;
              }
              if (result.releaseUrl) {
                BrowserOpenURL(result.releaseUrl);
              }
            },
          },
        });
      })
      .catch((error: unknown) => {
        console.warn("Update check failed", error);
      });
  }, []);

  async function installAppUpdate(assetName: string) {
    if (isLocalDev()) return;
    const toastId = "datapanel-install-update";
    toast.loading("Downloading update", {
      id: toastId,
      description: "DataPanel will continue after the download is verified.",
    });
    try {
      const result = await updateService.install(assetName);
      toast.success("Update ready", {
        id: toastId,
        description: result?.message || "DataPanel is preparing the installer.",
      });
    } catch (error) {
      const message = errorMessage(error, "Could not install update");
      toast.error("Could not install update", {
        id: toastId,
        description: message,
      });
    }
  }

  useEffect(() => {
    if (!activeConnectionId) {
      setQueryHistory([]);
      return;
    }
    void appDataService
      .listQueryHistory(activeConnectionId)
      .then(setQueryHistory)
      .catch((error: unknown) => {
        notify("danger", "Could not load query history", errorMessage(error, "Unknown error"));
      });
  }, [activeConnectionId]);

  const saveConnection = useCallback(
    async (input: SaveConnectionRequest) => {
      setBusy(true);
      try {
        const profile = await connectionService.save(input);
        await invalidateSchemaSnapshot(profile.id);
        await loadProfiles();
        setStatus({ tone: "success", text: `${profile.name} saved` });
        notify("success", "Connection saved", profile.name);
        return profile;
      } catch (error) {
        const message = errorMessage(error, "Could not save connection");
        setStatus({ tone: "danger", text: message });
        notify("danger", "Could not save connection", message);
        throw error;
      } finally {
        setBusy(false);
      }
    },
    [invalidateSchemaSnapshot, loadProfiles]
  );

  const testConnection = useCallback(async (input: TestConnectionRequest) => {
    setBusy(true);
    try {
      const result = await connectionService.test(input);
      setStatus({ tone: result.connected ? "success" : "danger", text: result.message });
      if (result.connected) {
        notify("success", "Connection test passed", input.name || input.host);
      } else {
        setConnectionHealth({ connected: false, error: result.message });
        notify("danger", "Connection test failed", result.message);
      }
      return result;
    } catch (error) {
      const message = errorMessage(error, "Connection failed");
      setStatus({ tone: "danger", text: message });
      setConnectionHealth({ connected: false, error: message });
      notify("danger", "Connection test failed", message);
      throw error;
    } finally {
      setBusy(false);
    }
  }, []);

  const connect = useCallback(async (
    profileId: string,
    password = "",
    options: ConnectOptions = {},
  ) => {
    const previousConnectionId = activeConnectionId;
    const switchingConnection = profileId !== previousConnectionId;
    const profile = profiles.find((item) => item.id === profileId);
    let switchingOverlayVisible = false;
    const showSwitchingOverlay = () => {
      switchingOverlayVisible = true;
      setWorkspaceSwitching({
        profileId,
        name: profile?.name || "Connection",
      });
    };
    setBusy(true);
    try {
      const refresh = options.refresh ?? (settings?.autoRefreshMetadata ?? true);
      if (switchingConnection) {
        saveActiveQueryResultSnapshot(previousConnectionId);
        activeConnectionIdRef.current = profileId;
        saveLastActiveWorkspaceId(profileId);
        setActiveConnectionId(profileId);
        resetQueryState(runningRequestId);
        showSwitchingOverlay();
        if (runningRequestId) {
          void queryService.cancel(runningRequestId).catch(() => {
            // The stale request guard below keeps old results out of the UI.
          });
        }
      }
      const result = await connectAndLoadMetadata(profileId, password, {
        refresh,
        backgroundRefresh: switchingConnection && refresh,
        reconnectKeychain: options.reconnectKeychain,
      });
      if (switchingConnection) {
        restoreQueryResultSnapshot(profileId);
      }
      notify("success", "Connected", profile?.name || result.message);
    } catch (error) {
      const message = errorMessage(error, "Could not connect");
      if (switchingConnection) {
        activeConnectionIdRef.current = previousConnectionId;
        saveLastActiveWorkspaceId(previousConnectionId);
        setActiveConnectionId(previousConnectionId);
        restoreQueryResultSnapshot(previousConnectionId);
      }
      setStatus({ tone: "danger", text: message });
      setConnectionHealth({ connected: false, error: message });
      if (!options.suppressErrorToast) {
        notify("danger", "Could not connect", message);
      }
      throw error;
    } finally {
      setBusy(false);
      if (switchingOverlayVisible) {
        setWorkspaceSwitching(null);
      }
    }
  }, [
    activeConnectionId,
    connectAndLoadMetadata,
    profiles,
    resetQueryState,
    restoreQueryResultSnapshot,
    runningRequestId,
    saveActiveQueryResultSnapshot,
    settings?.autoRefreshMetadata,
  ]);

  const disconnect = useCallback(async () => {
    if (!activeConnectionId) return;
    if (runningRequestId) {
      void queryService.cancel(runningRequestId).catch(() => {
        // The stale request guard below keeps old results out of the UI.
      });
    }
    await connectionService.disconnect(activeConnectionId);
    activeConnectionIdRef.current = "";
    saveLastActiveWorkspaceId("");
    setActiveConnectionId("");
    setSchemas([]);
    setTablesBySchema({});
    setSelectedTable(null);
    setTableDetails(null);
    resetQueryState(runningRequestId);
    setConnectionHealth({ connected: false });
    setStatus({ tone: "neutral", text: "Disconnected" });
    notify("neutral", "Disconnected");
  }, [activeConnectionId, resetQueryState, runningRequestId]);

  const deleteConnection = useCallback(async (profile: ConnectionProfile) => {
    if (!profile.id) return;
    const deletingActive = profile.id === activeConnectionId;
    if (deletingActive && runningRequestId) {
      void queryService.cancel(runningRequestId).catch(() => {
        // The stale request guard below keeps old results out of the UI.
      });
    }

    setBusy(true);
    try {
      await connectionService.remove(profile.id);
      const nextProfiles = await loadProfiles();
      const fallbackProfile = deletingActive
        ? nextProfiles[0] ?? null
        : null;

      if (deletingActive) {
        resetQueryState(runningRequestId);
        setSchemas([]);
        setTablesBySchema({});
        setSelectedTable(null);
        setTableDetails(null);
        setConnectionHealth({ connected: false });
        if (fallbackProfile) {
          const cachedMetadata = readMemorySchemaSnapshotCache(fallbackProfile.id);
          if (cachedMetadata) {
            window.setTimeout(() => {
              if (activeConnectionIdRef.current !== fallbackProfile.id) {
                setWorkspaceSwitching({
                  profileId: fallbackProfile.id,
                  name: fallbackProfile.name || "Connection",
                });
              }
            }, 160);
          } else {
            setWorkspaceSwitching({
              profileId: fallbackProfile.id,
              name: fallbackProfile.name || "Connection",
            });
          }
          await connectAndLoadMetadata(fallbackProfile.id, "", {
            refresh: false,
          });
          restoreQueryResultSnapshot(fallbackProfile.id);
        } else {
          activeConnectionIdRef.current = "";
          saveLastActiveWorkspaceId("");
          setActiveConnectionId("");
          setStatus({ tone: "neutral", text: "No connection selected" });
        }
      }

      setStatus({ tone: "success", text: `${profile.name} deleted` });
      notify("success", "Connection deleted", profile.name);
    } catch (error) {
      const message = errorMessage(error, "Could not delete connection");
      setStatus({ tone: "danger", text: message });
      notify("danger", "Could not delete connection", message);
      throw error;
    } finally {
      setBusy(false);
      setWorkspaceSwitching(null);
    }
  }, [
    activeConnectionId,
    connectAndLoadMetadata,
    loadProfiles,
    readMemorySchemaSnapshotCache,
    resetQueryState,
    restoreQueryResultSnapshot,
    runningRequestId,
  ]);

  const refreshMetadata = useCallback(async () => {
    if (!activeConnectionId) return;
    setBusy(true);
    try {
      const started = performance.now();
      clearSelectedTable();
      await loadMetadata(activeConnectionId, { refresh: true });
      setConnectionHealth((current) => ({
        ...current,
        connected: true,
        latencyMs: Math.max(0, Math.round(performance.now() - started)),
        lastPingAt: new Date().toISOString(),
      }));
      setStatus({ tone: "success", text: "Metadata refreshed" });
      notify("success", "Metadata refreshed");
    } catch (error) {
      const message = errorMessage(error, "Could not refresh metadata");
      setStatus({ tone: "danger", text: message });
      notify("danger", "Could not refresh metadata", message);
      throw error;
    } finally {
      setBusy(false);
    }
  }, [activeConnectionId, clearSelectedTable, loadMetadata]);

  const ensureFreshSchema = useCallback(async () => {
    if (!activeConnectionId) {
      return { schemas: [], tablesBySchema: {} };
    }
    return loadMetadata(activeConnectionId, { refresh: false });
  }, [activeConnectionId, loadMetadata]);

  const inspectTable = useCallback(
    async (table: TableSummary, options: { force?: boolean } = {}) => {
      if (!activeConnectionId) return null;
      if (
        selectedTable?.schema === table.schema &&
        selectedTable.name === table.name
      ) {
        if (options.force && tableDetails) return tableDetails;
        if (options.force) {
          setTableDetails(null);
        } else {
          inspectRequestRef.current += 1;
          setSelectedTable(null);
          setTableDetails(null);
          setInspectingTable(null);
          return null;
        }
      }
      const requestId = inspectRequestRef.current + 1;
      inspectRequestRef.current = requestId;
      setSelectedTable(table);
      const detailsKey = tableDetailsQueryKey(
        activeConnectionId,
        table.schema,
        table.name,
      );
      const cachedDetails = !options.force
        ? queryClient.getQueryData<TableDetails>(detailsKey)
        : null;
      if (cachedDetails) {
        setTableDetails(cachedDetails);
        setInspectingTable(null);
        return cachedDetails;
      }
      if (options.force) {
        queryClient.removeQueries({ queryKey: detailsKey });
      }
      setTableDetails(null);
      setInspectingTable(table);
      try {
        const details = await queryClient.fetchQuery({
          queryKey: detailsKey,
          queryFn: () =>
            schemaService.describe(activeConnectionId, table.schema, table.name),
          staleTime: Infinity,
        });
        if (inspectRequestRef.current === requestId) {
          setTableDetails(details);
        }
        return details;
      } catch (error) {
        const message = errorMessage(error, "Could not load table metadata");
        if (inspectRequestRef.current === requestId) {
          setStatus({ tone: "danger", text: message });
          notify("danger", "Could not load table metadata", message);
        }
        throw error;
      } finally {
        if (inspectRequestRef.current === requestId) {
          setInspectingTable(null);
        }
      }
    },
    [activeConnectionId, queryClient, selectedTable, tableDetails]
  );

  const loadTableDetails = useCallback(
    async (table: TableSummary, options: { force?: boolean } = {}) => {
      if (!activeConnectionId) return null;
      const detailsKey = tableDetailsQueryKey(
        activeConnectionId,
        table.schema,
        table.name,
      );
      if (options.force) {
        queryClient.removeQueries({ queryKey: detailsKey });
      }
      return queryClient.fetchQuery({
        queryKey: detailsKey,
        queryFn: () =>
          schemaService.describe(activeConnectionId, table.schema, table.name),
        staleTime: Infinity,
      });
    },
    [activeConnectionId, queryClient],
  );

  const prefetchTableDetails = useCallback(
    async (table: TableSummary) => {
      if (!activeConnectionId) return;
      const detailsKey = tableDetailsQueryKey(
        activeConnectionId,
        table.schema,
        table.name,
      );
      await queryClient.prefetchQuery({
        queryKey: detailsKey,
        queryFn: () =>
          schemaService.describe(activeConnectionId, table.schema, table.name),
        staleTime: Infinity,
      });
    },
    [activeConnectionId, queryClient],
  );

  const recordQueryHistory = useCallback((item: QueryHistoryEntry) => {
    setQueryHistory((current) => [item, ...current.filter((entry) => entry.sql !== item.sql)].slice(0, 50));
    void appDataService.saveQueryHistory(item).catch((error: unknown) => {
      notify("danger", "Could not save query history", errorMessage(error, "Unknown error"));
    });
  }, []);

  const runQuery = useCallback(
    async (sql: string, confirmDestructive = false, toastOptions: QueryToastOptions = {}) => {
      if (!activeConnectionId || !settings) {
        setStatus({ tone: "warning", text: "Connect to a database before running SQL" });
        notify("warning", "Connect to a database before running SQL");
        return null;
      }

      const requestId = crypto.randomUUID();
      const historySQL = toastOptions.historySQL || sql;
      const request: QueryRequest = {
        requestId,
        connectionId: activeConnectionId,
        sql,
        maxRows: settings.queryLimit,
        timeoutSeconds: settings.queryTimeoutSeconds,
        confirmDestructive
      };

      const queryRequestId = queryRequestRef.current + 1;
      queryRequestRef.current = queryRequestId;
      const resultMode = isExplainSQL(sql) ? "explain" : "query";
      setRunningRequestId(requestId);
      setQueryResult(null);
      setQueryResultMode(resultMode);
      setStatus({ tone: "neutral", text: "Running query..." });
      notify("loading", "Running query", undefined, requestId);
      const started = performance.now();
      try {
        const result = await queryService.execute(request);
        if (queryRequestRef.current !== queryRequestId) return null;
        setQueryResult(result);
        setQueryResultMode(resultMode);
        if (result.error === "confirmation_required") {
          setStatus({ tone: "warning", text: "Confirmation required" });
          notify(
            "warning",
            "Confirmation required",
            "Review the destructive SQL warning before running.",
            requestId,
          );
        } else if (result.error) {
          throw new Error(result.error);
        } else {
          const message =
            toastOptions.successMessage ||
            querySuccessMessage(result.rows.length, result.affectedRows, result.durationMs);
          setStatus({ tone: "success", text: message });
          notify(toastOptions.successTitle ? "success" : "neutral", toastOptions.successTitle || "Query finished", message, requestId);
          if (toastOptions.recordHistory) {
            recordQueryHistory({
              id: requestId,
              connectionId: activeConnectionId,
              sql: historySQL,
              mode: toastOptions.historyMode || "query",
              durationMs: result.durationMs,
              executedAt: new Date().toISOString(),
              success: true,
              rowCount: result.rows.length,
              affectedRows: result.affectedRows,
            });
          }
        }
        return result;
      } catch (error) {
        if (queryRequestRef.current !== queryRequestId) return null;
        const message = errorMessage(error, "Query failed");
        setStatus({ tone: "danger", text: message });
        notify("danger", "Query failed", message, requestId);
        if (toastOptions.recordHistory) {
          recordQueryHistory({
            id: requestId,
            connectionId: activeConnectionId,
            sql: historySQL,
            mode: toastOptions.historyMode || "query",
            durationMs: Math.max(0, Math.round(performance.now() - started)),
            executedAt: new Date().toISOString(),
            success: false,
            rowCount: 0,
            affectedRows: 0,
            error: message,
          });
        }
        throw error;
      } finally {
        if (queryRequestRef.current === queryRequestId) {
          setRunningRequestId("");
        }
      }
    },
    [activeConnectionId, recordQueryHistory, settings]
  );

  const explainQuery = useCallback(
    async (sql: string, toastOptions: QueryToastOptions = {}) => {
      if (!activeConnectionId || !settings) {
        setStatus({ tone: "warning", text: "Connect to a database before running SQL" });
        notify("warning", "Connect to a database before running SQL");
        return null;
      }

      const requestId = crypto.randomUUID();
      const request: QueryRequest = {
        requestId,
        connectionId: activeConnectionId,
        sql,
        maxRows: settings.queryLimit,
        timeoutSeconds: settings.queryTimeoutSeconds,
        confirmDestructive: true
      };

      const queryRequestId = queryRequestRef.current + 1;
      queryRequestRef.current = queryRequestId;
      setRunningRequestId(requestId);
      setQueryResult(null);
      setQueryResultMode("explain");
      setStatus({ tone: "neutral", text: "Explaining query..." });
      notify("loading", "Explaining query", undefined, requestId);
      const started = performance.now();
      try {
        const result = await queryService.explain(request);
        if (queryRequestRef.current !== queryRequestId) return null;
        setQueryResult(result);
        setQueryResultMode("explain");
        if (result.error) {
          throw new Error(result.error);
        }
        const message = querySuccessMessage(result.rows.length, result.affectedRows, result.durationMs);
        setStatus({ tone: "success", text: message });
        notify("neutral", "Explain finished", message, requestId);
        if (toastOptions.recordHistory) {
          recordQueryHistory({
            id: requestId,
            connectionId: activeConnectionId,
            sql,
            mode: toastOptions.historyMode || "explain",
            durationMs: result.durationMs,
            executedAt: new Date().toISOString(),
            success: true,
            rowCount: result.rows.length,
            affectedRows: result.affectedRows,
          });
        }
        return result;
      } catch (error) {
        if (queryRequestRef.current !== queryRequestId) return null;
        const message = errorMessage(error, "Explain failed");
        setStatus({ tone: "danger", text: message });
        notify("danger", "Explain failed", message, requestId);
        if (toastOptions.recordHistory) {
          recordQueryHistory({
            id: requestId,
            connectionId: activeConnectionId,
            sql,
            mode: toastOptions.historyMode || "explain",
            durationMs: Math.max(0, Math.round(performance.now() - started)),
            executedAt: new Date().toISOString(),
            success: false,
            rowCount: 0,
            affectedRows: 0,
            error: message,
          });
        }
        throw error;
      } finally {
        if (queryRequestRef.current === queryRequestId) {
          setRunningRequestId("");
        }
      }
    },
    [activeConnectionId, recordQueryHistory, settings]
  );

  const commitSQL = useCallback(
    async (sql: string, successMessage: string) => {
      if (!activeConnectionId || !settings) {
        setStatus({ tone: "warning", text: "Connect to a database before editing rows" });
        notify("warning", "Connect to a database before editing rows");
        return null;
      }

      const requestId = crypto.randomUUID();
      const request: QueryRequest = {
        requestId,
        connectionId: activeConnectionId,
        sql,
        maxRows: settings.queryLimit,
        timeoutSeconds: settings.queryTimeoutSeconds,
        confirmDestructive: true,
      };

      const queryRequestId = queryRequestRef.current + 1;
      queryRequestRef.current = queryRequestId;
      setRunningRequestId(requestId);
      setStatus({ tone: "neutral", text: "Saving changes..." });
      notify("loading", "Saving changes", undefined, requestId);
      try {
        const result = await queryService.execute(request);
        if (queryRequestRef.current !== queryRequestId) return null;
        if (result.error) {
          throw new Error(result.error);
        }
        setStatus({ tone: "success", text: successMessage });
        notify("success", "Changes saved", successMessage, requestId);
        return result;
      } catch (error) {
        if (queryRequestRef.current !== queryRequestId) return null;
        const message = errorMessage(error, "Could not save changes");
        setStatus({ tone: "danger", text: message });
        notify("danger", "Could not save changes", message, requestId);
        throw error;
      } finally {
        if (queryRequestRef.current === queryRequestId) {
          setRunningRequestId("");
        }
      }
    },
    [activeConnectionId, settings],
  );

  const cancelQuery = useCallback(async () => {
    if (!runningRequestId) return;
    await queryService.cancel(runningRequestId);
    setStatus({ tone: "warning", text: "Cancel requested" });
    notify("warning", "Cancel requested", undefined, runningRequestId);
  }, [runningRequestId]);

  const updateSettings = useCallback(async (nextSettings: AppSettings) => {
    const saved = await settingsService.update(nextSettings);
    const appliedSettings = await applyTelemetrySettings(saved, {
      trackAppOpen: false,
    });
    setSettings(appliedSettings);
    setStatus({ tone: "success", text: "Settings updated" });
    notify("success", "Settings updated");
  }, []);

  return {
    profiles,
    activeProfile,
    activeConnectionId,
    schemas,
    tablesBySchema,
    selectedTable,
    tableDetails,
    inspectingTable,
    queryResult,
    queryResultMode,
    queryHistory,
    runningRequestId,
    settings,
    status,
    connectionHealth,
    busy,
    initializing,
    workspaceSwitching,
    saveConnection,
    deleteConnection,
    testConnection,
    connect,
    disconnect,
    refreshMetadata,
    ensureFreshSchema,
    inspectTable,
    loadTableDetails,
    prefetchTableDetails,
    runQuery,
    explainQuery,
    commitSQL,
    cancelQuery,
    updateSettings
  };
}

function isLocalDev() {
  return import.meta.env.DEV;
}

function isExplainSQL(sql: string) {
  return sql.trim().toLowerCase().startsWith("explain");
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const shaped = error as { message?: unknown; error?: unknown };
    if (typeof shaped.message === "string") return shaped.message;
    if (typeof shaped.error === "string") return shaped.error;
    try {
      return JSON.stringify(error);
    } catch {
      return fallback;
    }
  }
  return fallback;
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

function schemaSnapshotHasTables(snapshot: SchemaSnapshot) {
  return Object.values(snapshot.tablesBySchema).some((tables) => tables.length > 0);
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<void>,
) {
  let cursor = 0;
  const workerCount = Math.min(Math.max(1, limit), items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < items.length) {
      const item = items[cursor];
      cursor += 1;
      await task(item);
    }
  });
  await Promise.all(workers);
}

function updateDescription(version: string, assetName: string) {
  const release = version || "latest release";
  return assetName ? `${release} / ${assetName}` : release;
}

function notify(
  tone: "success" | "danger" | "warning" | "loading" | "neutral",
  title: string,
  description?: string,
  id?: string,
) {
  toast(title, {
    description: truncateToastDescription(description),
    id,
    icon: toastIcon(tone),
  });
}

function truncateToastDescription(description?: string) {
  if (!description) return description;
  const normalized = description.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxToastDescriptionLength) return normalized;
  return `${normalized.slice(0, maxToastDescriptionLength - 3)}...`;
}

function toastIcon(tone: "success" | "danger" | "warning" | "loading" | "neutral") {
  const className = "h-4 w-4";
  if (tone === "success") return <Check className={`${className} text-green-300`} />;
  if (tone === "danger") return <XCircle className={`${className} text-red-300`} />;
  if (tone === "warning") return <AlertTriangle className={`${className} text-yellow-300`} />;
  if (tone === "loading") return <Loader2 className={`${className} animate-spin text-zinc-300`} />;
  return <Info className={`${className} text-zinc-300`} />;
}
