import type {
  AppSettings,
  AICredentialStatus,
  AIChatMessage,
  AIChatThread,
  AIGenerateRequest,
  AIGenerateResponse,
  ConnectRequest,
  ConnectionProfile,
  ConnectionStatus,
  QueryHistoryEntry,
  QueryHistoryItem,
  QueryRequest,
  QueryResult,
  SaveAIChatMessageRequest,
  SaveConnectionRequest,
  SaveAICredentialRequest,
  SaveQueryHistoryRequest,
  SchemaFingerprint,
  SchemaSummary,
  SQLAnalysis,
  TableDetails,
  TableSummary,
  TestConnectionRequest,
  UpdateCheckResult,
} from "./types";
import * as AIBindings from "../../wailsjs/go/ai/Service";
import * as AppDataBindings from "../../wailsjs/go/appdata/Service";
import * as ConnectionBindings from "../../wailsjs/go/connections/Service";
import * as SchemaBindings from "../../wailsjs/go/postgres/SchemaService";
import * as QueryBindings from "../../wailsjs/go/query/Service";
import * as SettingsBindings from "../../wailsjs/go/settings/Service";
import * as UpdaterBindings from "../../wailsjs/go/updater/Service";

const mockProfiles: ConnectionProfile[] = [
  {
    id: "demo",
    driver: "postgres",
    name: "Demo Postgres",
    host: "localhost",
    port: 5432,
    database: "app",
    username: "postgres",
    sslMode: "prefer",
    color: "#5E6AD2",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

const defaultSettings: AppSettings = {
  theme: "system",
  queryLimit: 500,
  queryTimeoutSeconds: 30,
  confirmDestructiveSql: true,
  sidebarWidth: 304,
  inspectorWidth: 360,
  autoRefreshMetadata: true,
  chatResponsePrompt: "",
  cursorMode: "default"
};

const mockAICredentials: Record<string, AICredentialStatus> = {};
const mockAIThreads: AIChatThread[] = [];
const mockAIMessages: AIChatMessage[] = [];
const mockQueryHistory: QueryHistoryEntry[] = [];

function isWailsRuntime() {
  return Boolean(window.go);
}

export const connectionService = {
  async list(): Promise<ConnectionProfile[]> {
    if (!isWailsRuntime()) return mockProfiles;
    return ConnectionBindings.ListConnections();
  },
  async save(input: SaveConnectionRequest): Promise<ConnectionProfile> {
    if (!isWailsRuntime()) {
      const profile = { ...mockProfiles[0], ...input, id: input.id || "demo", updatedAt: new Date().toISOString() };
      mockProfiles.splice(0, 1, profile);
      return profile;
    }
    return ConnectionBindings.SaveConnection(input);
  },
  async remove(profileId: string): Promise<void> {
    if (!isWailsRuntime()) return;
    return ConnectionBindings.DeleteConnection(profileId);
  },
  async test(input: TestConnectionRequest): Promise<ConnectionStatus> {
    if (!isWailsRuntime()) return { profileId: input.profileId || "demo", connected: true, message: "Preview connection ready" };
    return ConnectionBindings.TestConnection(input);
  },
  async connect(input: ConnectRequest): Promise<ConnectionStatus> {
    if (!isWailsRuntime()) return { profileId: input.profileId, connected: true, message: "Preview connected" };
    return ConnectionBindings.Connect(input);
  },
  async disconnect(profileId: string): Promise<void> {
    if (!isWailsRuntime()) return;
    return ConnectionBindings.Disconnect(profileId);
  }
};

export const aiCredentialService = {
  async list(): Promise<AICredentialStatus[]> {
    if (!isWailsRuntime()) {
      return ["openai", "anthropic", "custom"].map((provider) => ({
        provider,
        connected: Boolean(mockAICredentials[provider]?.connected),
        keyHint: mockAICredentials[provider]?.keyHint || "",
        label: mockAICredentials[provider]?.label || "",
        updatedAt: mockAICredentials[provider]?.updatedAt || "",
        storage: "session"
      }));
    }
    return AIBindings.ListCredentials();
  },
  async save(input: SaveAICredentialRequest): Promise<AICredentialStatus> {
    if (!isWailsRuntime()) {
      const token = input.token.trim();
      const status = {
        provider: input.provider,
        connected: true,
        keyHint: token.length >= 4 ? `....${token.slice(-4)}` : "stored",
        label: input.label,
        updatedAt: new Date().toISOString(),
        storage: "session"
      };
      mockAICredentials[input.provider] = status;
      return status;
    }
    return AIBindings.SaveCredential(input);
  },
  async remove(provider: string): Promise<void> {
    if (!isWailsRuntime()) {
      delete mockAICredentials[provider];
      return;
    }
    return AIBindings.DeleteCredential(provider);
  },
  async generate(input: AIGenerateRequest): Promise<AIGenerateResponse> {
    if (!isWailsRuntime()) {
      return {
        answer: "Preview generated SQL. Connect a packaged app build to run this through your provider.",
        sql: `select *\nfrom ${input.dialect === "mysql" ? "`your_table`" : "\"your_table\""}\nlimit 50;`,
        destructiveRisk: false,
        assumptions: ["Preview mode does not call an AI provider."]
      };
    }
    return AIBindings.GenerateSQL(input);
  }
};

export const appDataService = {
  async listThreads(connectionId: string): Promise<AIChatThread[]> {
    if (!isWailsRuntime()) {
      return mockAIThreads
        .filter((thread) => thread.connectionId === (connectionId || "global"))
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    }
    return AppDataBindings.ListAIChatThreads({ connectionId });
  },
  async createThread(input: {
    connectionId: string;
    title: string;
    provider: string;
    model: string;
  }): Promise<AIChatThread> {
    if (!isWailsRuntime()) {
      const now = new Date().toISOString();
      const thread = {
        id: crypto.randomUUID(),
        connectionId: input.connectionId || "global",
        title: input.title || "New chat",
        provider: input.provider || "openai",
        model: input.model || "gpt-4.1-mini",
        createdAt: now,
        updatedAt: now
      };
      mockAIThreads.unshift(thread);
      return thread;
    }
    return AppDataBindings.CreateAIChatThread(input);
  },
  async updateThread(input: {
    id: string;
    title: string;
    provider: string;
    model: string;
  }): Promise<AIChatThread> {
    if (!isWailsRuntime()) {
      const thread = mockAIThreads.find((item) => item.id === input.id);
      if (!thread) throw new Error("Thread not found");
      Object.assign(thread, { ...input, updatedAt: new Date().toISOString() });
      return thread;
    }
    return AppDataBindings.UpdateAIChatThread(input);
  },
  async deleteThread(id: string): Promise<void> {
    if (!isWailsRuntime()) {
      const index = mockAIThreads.findIndex((thread) => thread.id === id);
      if (index >= 0) mockAIThreads.splice(index, 1);
      for (let i = mockAIMessages.length - 1; i >= 0; i -= 1) {
        if (mockAIMessages[i].threadId === id) mockAIMessages.splice(i, 1);
      }
      return;
    }
    return AppDataBindings.DeleteAIChatThread({ id });
  },
  async listMessages(threadId: string): Promise<AIChatMessage[]> {
    if (!isWailsRuntime()) {
      return mockAIMessages.filter((message) => message.threadId === threadId);
    }
    return AppDataBindings.ListAIChatMessages({ threadId, limit: 120 });
  },
  async saveMessage(input: SaveAIChatMessageRequest): Promise<AIChatMessage> {
    if (!isWailsRuntime()) {
      const message = {
        ...input,
        id: input.id || crypto.randomUUID(),
        createdAt: input.createdAt || new Date().toISOString()
      } as AIChatMessage;
      mockAIMessages.push(message);
      const thread = mockAIThreads.find((item) => item.id === input.threadId);
      if (thread) thread.updatedAt = message.createdAt;
      return message;
    }
    return AppDataBindings.SaveAIChatMessage(input as Parameters<typeof AppDataBindings.SaveAIChatMessage>[0]);
  },
  async clearMessages(threadId: string): Promise<void> {
    if (!isWailsRuntime()) {
      for (let i = mockAIMessages.length - 1; i >= 0; i -= 1) {
        if (mockAIMessages[i].threadId === threadId) mockAIMessages.splice(i, 1);
      }
      return;
    }
    return AppDataBindings.ClearAIChatMessages({ threadId });
  },
  async listQueryHistory(connectionId: string): Promise<QueryHistoryEntry[]> {
    if (!isWailsRuntime()) {
      return mockQueryHistory
        .filter((item) => item.connectionId === (connectionId || "global"))
        .slice(0, 50);
    }
    return (await AppDataBindings.ListQueryHistory({ connectionId, limit: 50 })).map(normalizeQueryHistoryItem);
  },
  async saveQueryHistory(input: SaveQueryHistoryRequest): Promise<QueryHistoryEntry> {
    if (!isWailsRuntime()) {
      const item = {
        ...input,
        id: input.id || crypto.randomUUID(),
        executedAt: input.executedAt || new Date().toISOString(),
      };
      const existingIndex = mockQueryHistory.findIndex(
        (entry) => entry.connectionId === item.connectionId && entry.sql === item.sql,
      );
      if (existingIndex >= 0) mockQueryHistory.splice(existingIndex, 1);
      mockQueryHistory.unshift(item);
      return item;
    }
    return normalizeQueryHistoryItem(
      await AppDataBindings.SaveQueryHistory(input as Parameters<typeof AppDataBindings.SaveQueryHistory>[0]),
    );
  }
};

function normalizeQueryHistoryItem(item: {
  id: string;
  connectionId: string;
  sql: string;
  mode: string;
  durationMs: number;
  executedAt: string;
  success: boolean;
  rowCount: number;
  affectedRows: number;
  error?: string;
}): QueryHistoryEntry {
  return {
    ...item,
    mode: item.mode === "explain" ? "explain" : "query",
  };
}

export const schemaService = {
  async fingerprint(connectionId: string): Promise<SchemaFingerprint> {
    if (!isWailsRuntime()) return { hash: "preview-schema" };
    return SchemaBindings.SchemaFingerprint(connectionId);
  },
  async schemas(connectionId: string): Promise<SchemaSummary[]> {
    if (!isWailsRuntime()) return [{ name: "public" }, { name: "analytics" }];
    return SchemaBindings.ListSchemas(connectionId);
  },
  async refresh(connectionId: string): Promise<SchemaSummary[]> {
    if (!isWailsRuntime()) return [{ name: "public" }, { name: "analytics" }];
    return SchemaBindings.RefreshMetadata(connectionId);
  },
  async tables(connectionId: string, schema: string): Promise<TableSummary[]> {
    if (!isWailsRuntime()) {
      return [
        { schema, name: "users", type: "BASE TABLE", rowEstimate: 1240 },
        { schema, name: "subscriptions", type: "BASE TABLE", rowEstimate: 438 },
        { schema, name: "daily_revenue", type: "VIEW", rowEstimate: 0 }
      ];
    }
    return SchemaBindings.ListTables(connectionId, schema);
  },
  async describe(connectionId: string, schema: string, table: string): Promise<TableDetails> {
    if (!isWailsRuntime()) {
      return {
        schema,
        name: table,
        type: "BASE TABLE",
        columns: [
          { name: "id", dataType: "uuid", nullable: false, default: "gen_random_uuid()", position: 1, isPrimary: true },
          { name: "email", dataType: "text", nullable: false, default: "", position: 2, isPrimary: false },
          { name: "created_at", dataType: "timestamptz", nullable: false, default: "now()", position: 3, isPrimary: false }
        ],
        indexes: [{ name: `${table}_pkey`, definition: `CREATE UNIQUE INDEX ${table}_pkey ON ${schema}.${table} USING btree (id)` }],
        constraints: [{ name: `${table}_pkey`, type: "PRIMARY KEY", definition: "PRIMARY KEY (id)" }]
      };
    }
    return SchemaBindings.DescribeTable(connectionId, schema, table);
  }
};

export const queryService = {
  async analyze(sql: string): Promise<SQLAnalysis> {
    if (!isWailsRuntime()) {
      const destructive = /\b(drop|truncate|alter)\b/i.test(sql) || /\b(delete|update)\b/i.test(sql);
      return { destructive, warnings: destructive ? ["This query may modify or remove data."] : [] };
    }
    return QueryBindings.AnalyzeSQL(sql);
  },
  async execute(request: QueryRequest): Promise<QueryResult> {
    if (!isWailsRuntime()) {
      return {
        columns: [
          { name: "id", dataType: "uuid" },
          { name: "email", dataType: "text" },
          { name: "plan", dataType: "text" }
        ],
        rows: [
          ["7fd4b2a4", "ada@example.com", "pro"],
          ["d36c984a", "linus@example.com", "team"]
        ],
        affectedRows: 2,
        durationMs: 18,
        notices: [],
        error: "",
        truncated: false
      };
    }
    return normalizeQueryResult(await QueryBindings.ExecuteQuery(request));
  },
  async explain(request: QueryRequest): Promise<QueryResult> {
    if (!isWailsRuntime()) {
      return {
        columns: [
          { name: "QUERY PLAN", dataType: "text" }
        ],
        rows: [
          ["Hash Join  (cost=128.43..163.94 rows=554 width=283)"],
          ["  Hash Cond: (s.owner_id = o.id)"],
          ["  ->  Seq Scan on subscriptions s  (cost=0.00..33.99 rows=581 width=283)"],
          ["        Filter: is_active"],
          ["  ->  Hash  (cost=97.75..97.75 rows=2454 width=16)"],
          ["        ->  Seq Scan on organizations o  (cost=0.00..97.75 rows=2454 width=16)"],
          ["              Filter: is_active"]
        ],
        affectedRows: 0,
        durationMs: 9,
        notices: [],
        error: "",
        truncated: false
      };
    }
    return normalizeQueryResult(await QueryBindings.ExplainQuery(request));
  },
  async cancel(requestId: string): Promise<void> {
    if (!isWailsRuntime()) return;
    return QueryBindings.CancelQuery(requestId);
  },
  async history(): Promise<QueryHistoryItem[]> {
    if (!isWailsRuntime()) return [];
    return QueryBindings.GetQueryHistory();
  }
};

function normalizeQueryResult(result: QueryResult): QueryResult {
  return {
    ...result,
    columns: Array.isArray(result.columns) ? result.columns : [],
    rows: Array.isArray(result.rows) ? result.rows.filter(Array.isArray) : [],
    notices: Array.isArray(result.notices) ? result.notices : [],
  };
}

export const settingsService = {
  async get(): Promise<AppSettings> {
    if (!isWailsRuntime()) return defaultSettings;
    return SettingsBindings.GetSettings();
  },
  async update(input: AppSettings): Promise<AppSettings> {
    if (!isWailsRuntime()) Object.assign(defaultSettings, input);
    if (!isWailsRuntime()) return defaultSettings;
    return SettingsBindings.UpdateSettings(input);
  }
};

export const updateService = {
  async check(): Promise<UpdateCheckResult> {
    if (!isWailsRuntime()) {
      return {
        currentVersion: "0.1.0",
        currentReleaseHash: "dev",
        latestVersion: "0.1.0",
        latestReleaseHash: "dev",
        releaseName: "Datapanel preview",
        releaseUrl: "https://github.com/aquibbaig/datapanel/releases",
        publishedAt: "",
        assetName: "",
        assetSize: 0,
        assetDigest: "",
        updateAvailable: false,
        canInstall: false,
        message: "Datapanel is up to date.",
      };
    }
    return UpdaterBindings.CheckForUpdate();
  },
  async install(assetName: string): Promise<void> {
    if (!isWailsRuntime()) return;
    await UpdaterBindings.InstallUpdate({ assetName });
  }
};
