import type { connections, postgres, query, settings } from "../../wailsjs/go/models";

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
