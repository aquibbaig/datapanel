import type { ai, connections, postgres, query, settings } from "../../wailsjs/go/models";

export type AICredentialStatus = ai.CredentialStatus;
export type AIGenerateRequest = ai.GenerateRequest;
export type AIGenerateResponse = ai.GenerateResponse;
export type SaveAICredentialRequest = ai.SaveCredentialRequest;

export type ConnectionProfile = connections.ConnectionProfile;
export type SaveConnectionRequest = connections.SaveConnectionRequest;
export type TestConnectionRequest = connections.TestConnectionRequest;
export type ConnectRequest = connections.ConnectRequest;
export type ConnectionStatus = connections.ConnectionStatus;

export type SchemaSummary = postgres.SchemaSummary;
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

export type AppSettings = settings.AppSettings;

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
  connected: boolean;
  latencyMs?: number;
  lastPingAt?: string;
  connectedAt?: string;
  error?: string;
}
