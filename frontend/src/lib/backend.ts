import type {
  AppSettings,
  ConnectRequest,
  ConnectionProfile,
  ConnectionStatus,
  QueryHistoryItem,
  QueryRequest,
  QueryResult,
  SaveConnectionRequest,
  SchemaSummary,
  SQLAnalysis,
  TableDetails,
  TableSummary,
  TestConnectionRequest
} from "./types";
import * as ConnectionBindings from "../../wailsjs/go/connections/Service";
import * as SchemaBindings from "../../wailsjs/go/postgres/SchemaService";
import * as QueryBindings from "../../wailsjs/go/query/Service";
import * as SettingsBindings from "../../wailsjs/go/settings/Service";

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
  autoRefreshMetadata: true
};

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

export const schemaService = {
  async schemas(connectionId: string): Promise<SchemaSummary[]> {
    if (!isWailsRuntime()) return [{ name: "public" }, { name: "analytics" }];
    return SchemaBindings.ListSchemas(connectionId);
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
    return QueryBindings.ExecuteQuery(request);
  },
  async explain(request: QueryRequest): Promise<QueryResult> {
    if (!isWailsRuntime()) {
      return {
        columns: [
          { name: "QUERY PLAN", dataType: "text" },
          { name: "cost", dataType: "text" }
        ],
        rows: [
          ["Seq Scan on users", "0.00..18.20"],
          ["Filter: active = true", ""]
        ],
        affectedRows: 0,
        durationMs: 9,
        notices: [],
        error: "",
        truncated: false
      };
    }
    return QueryBindings.ExplainQuery(request);
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
