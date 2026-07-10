import type {
  ai,
  appdata,
  connections,
  fileexport,
  postgres,
  query,
  settings,
  updater,
} from "../../wailsjs/go/models";

export type AICredentialStatus = ai.CredentialStatus;
export interface AIChatTurn {
  role: "assistant" | "user";
  content: string;
}
export interface AIGenerateRequest
  extends Omit<ai.GenerateRequest, "convertValues" | "conversation"> {
  conversation?: AIChatTurn[];
}
export interface AIGenerateResponse
  extends Omit<ai.GenerateResponse, "convertValues" | "missingTables"> {
  missingTables?: AIPlanResponse["tables"];
  tokenUsage: ai.TokenUsage;
}
export interface AIPlanRequest
  extends Omit<ai.PlanRequest, "convertValues" | "conversation"> {
  conversation?: AIChatTurn[];
}
export interface AIPlanResponse {
  needsClarification: boolean;
  question: string;
  tables: Array<{
    schema: string;
    name: string;
    confidence: number;
    reason: string;
  }>;
  assumptions: string[];
  tokenUsage: ai.TokenUsage;
}
export type SaveAICredentialRequest = ai.SaveCredentialRequest;
export interface AIChatThread
  extends Omit<appdata.AIChatThread, "convertValues"> {
  tokenUsage: ai.TokenUsage;
}
export interface AIChatMessage
  extends Omit<appdata.AIChatMessage, "convertValues" | "response"> {
  response?: AIGenerateResponse;
}
export type CreateAIChatThreadRequest = appdata.CreateAIChatThreadRequest;
export type UpdateAIChatThreadRequest = appdata.UpdateAIChatThreadRequest;
export interface SaveAIChatMessageRequest {
  id: string;
  threadId: string;
  connectionId: string;
  provider: string;
  model: string;
  role: string;
  content: string;
  response?: AIGenerateResponse;
  createdAt: string;
}
export type AppQueryHistoryEntry = appdata.QueryHistoryEntry;
export interface QueryWorkspaceDraftState {
  connectionId: string;
  activeWorkspaceId: string;
  workspaces: Array<{
    id: string;
    title: string;
    sql: string;
  }>;
  updatedAt: string;
}
export interface SchemaMetadataSnapshot {
  connectionId: string;
  schemas: SchemaSummary[];
  tablesBySchema: Record<string, TableSummary[]>;
  fingerprint: string;
  updatedAt: string;
}
export interface SaveQueryHistoryRequest {
  id: string;
  connectionId: string;
  sql: string;
  mode: "query" | "explain";
  durationMs: number;
  executedAt: string;
  success: boolean;
  rowCount: number;
  affectedRows: number;
  error?: string;
}
export interface SaveQueryWorkspaceDraftsRequest {
  connectionId: string;
  activeWorkspaceId: string;
  workspaces: Array<{
    id: string;
    title: string;
    sql: string;
  }>;
}
export interface SaveSchemaSnapshotRequest {
  connectionId: string;
  schemas: SchemaSummary[];
  tablesBySchema: Record<string, TableSummary[]>;
  fingerprint: string;
}

export type ConnectionProfile = connections.ConnectionProfile;
export type SaveConnectionRequest = connections.SaveConnectionRequest;
export type TestConnectionRequest = connections.TestConnectionRequest;
export type ConnectRequest = connections.ConnectRequest;
export type ConnectionStatus = connections.ConnectionStatus;

export type SchemaSummary = postgres.SchemaSummary;
export type SchemaFingerprint = postgres.SchemaFingerprint;
export type SchemaContext = postgres.SchemaContext;
export interface SchemaContextRequest {
  connectionId: string;
  prompt: string;
  dialect: string;
  maxDetailedTables: number;
  tables?: Array<{ schema: string; name: string }>;
}
export type TableSummary = postgres.TableSummary;
export type ColumnSummary = postgres.ColumnSummary;
export type IndexSummary = postgres.IndexSummary;
export type ConstraintSummary = postgres.ConstraintSummary;
export type TableDetails = Omit<postgres.TableDetails, "convertValues">;

export type QueryRequest = query.QueryRequest;
export type QueryColumn = query.QueryColumn;
export type QueryResult = Omit<query.QueryResult, "convertValues">;
export type QueryHistoryItem = query.QueryHistoryItem;
export type SQLAnalysis = query.SQLAnalysis;

export interface AppSettings extends settings.AppSettings {
  telemetryEnabled: boolean;
  userId: string;
}
export type SaveFileExportRequest = fileexport.SaveExportRequest;
export type SaveFileExportResult = fileexport.SaveExportResult;
export type ReleaseState = updater.ReleaseState;
export type AppVersionInfo = updater.AppVersionInfo;
export type UpdateCheckResult = updater.UpdateCheckResult;
export type InstallUpdateRequest = updater.InstallUpdateRequest;
export type InstallUpdateResult = updater.InstallUpdateResult;

export interface QueryHistoryEntry {
  id: string;
  connectionId: string;
  sql: string;
  mode: "query" | "explain";
  durationMs: number;
  executedAt: string;
  success: boolean;
  rowCount: number;
  affectedRows: number;
  error?: string;
}

export interface ConnectionHealth {
  connectionId?: string;
  connected: boolean;
  latencyMs?: number;
  lastPingAt?: string;
  connectedAt?: string;
  error?: string;
}
