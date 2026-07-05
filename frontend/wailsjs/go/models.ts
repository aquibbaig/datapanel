export namespace ai {
	
	export class ChatTurn {
	    role: string;
	    content: string;
	
	    static createFrom(source: any = {}) {
	        return new ChatTurn(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.role = source["role"];
	        this.content = source["content"];
	    }
	}
	export class CredentialStatus {
	    provider: string;
	    connected: boolean;
	    keyHint: string;
	    label: string;
	    updatedAt: string;
	    storage: string;
	
	    static createFrom(source: any = {}) {
	        return new CredentialStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.provider = source["provider"];
	        this.connected = source["connected"];
	        this.keyHint = source["keyHint"];
	        this.label = source["label"];
	        this.updatedAt = source["updatedAt"];
	        this.storage = source["storage"];
	    }
	}
	export class GenerateRequest {
	    provider: string;
	    model: string;
	    prompt: string;
	    schemaContext: string;
	    dialect: string;
	    responseStyle: string;
	    conversation?: ChatTurn[];
	
	    static createFrom(source: any = {}) {
	        return new GenerateRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.provider = source["provider"];
	        this.model = source["model"];
	        this.prompt = source["prompt"];
	        this.schemaContext = source["schemaContext"];
	        this.dialect = source["dialect"];
	        this.responseStyle = source["responseStyle"];
	        this.conversation = this.convertValues(source["conversation"], ChatTurn);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class TokenUsage {
	    promptTokens: number;
	    completionTokens: number;
	    totalTokens: number;
	
	    static createFrom(source: any = {}) {
	        return new TokenUsage(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.promptTokens = source["promptTokens"];
	        this.completionTokens = source["completionTokens"];
	        this.totalTokens = source["totalTokens"];
	    }
	}
	export class PlanTable {
	    schema: string;
	    name: string;
	    confidence: number;
	    reason: string;
	
	    static createFrom(source: any = {}) {
	        return new PlanTable(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.schema = source["schema"];
	        this.name = source["name"];
	        this.confidence = source["confidence"];
	        this.reason = source["reason"];
	    }
	}
	export class GenerateResponse {
	    answer: string;
	    sql: string;
	    destructiveRisk: boolean;
	    assumptions: string[];
	    missingTables?: PlanTable[];
	    tokenUsage: TokenUsage;
	
	    static createFrom(source: any = {}) {
	        return new GenerateResponse(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.answer = source["answer"];
	        this.sql = source["sql"];
	        this.destructiveRisk = source["destructiveRisk"];
	        this.assumptions = source["assumptions"];
	        this.missingTables = this.convertValues(source["missingTables"], PlanTable);
	        this.tokenUsage = this.convertValues(source["tokenUsage"], TokenUsage);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class PlanRequest {
	    provider: string;
	    model: string;
	    prompt: string;
	    tableContext: string;
	    dialect: string;
	    conversation?: ChatTurn[];
	
	    static createFrom(source: any = {}) {
	        return new PlanRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.provider = source["provider"];
	        this.model = source["model"];
	        this.prompt = source["prompt"];
	        this.tableContext = source["tableContext"];
	        this.dialect = source["dialect"];
	        this.conversation = this.convertValues(source["conversation"], ChatTurn);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class PlanResponse {
	    needsClarification: boolean;
	    question: string;
	    tables: PlanTable[];
	    assumptions: string[];
	    tokenUsage: TokenUsage;
	
	    static createFrom(source: any = {}) {
	        return new PlanResponse(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.needsClarification = source["needsClarification"];
	        this.question = source["question"];
	        this.tables = this.convertValues(source["tables"], PlanTable);
	        this.assumptions = source["assumptions"];
	        this.tokenUsage = this.convertValues(source["tokenUsage"], TokenUsage);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class SaveCredentialRequest {
	    provider: string;
	    token: string;
	    label: string;
	
	    static createFrom(source: any = {}) {
	        return new SaveCredentialRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.provider = source["provider"];
	        this.token = source["token"];
	        this.label = source["label"];
	    }
	}

}

export namespace appdata {
	
	export class AIChatMessage {
	    id: string;
	    threadId: string;
	    connectionId: string;
	    provider: string;
	    model: string;
	    role: string;
	    content: string;
	    response?: ai.GenerateResponse;
	    createdAt: string;
	
	    static createFrom(source: any = {}) {
	        return new AIChatMessage(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.threadId = source["threadId"];
	        this.connectionId = source["connectionId"];
	        this.provider = source["provider"];
	        this.model = source["model"];
	        this.role = source["role"];
	        this.content = source["content"];
	        this.response = this.convertValues(source["response"], ai.GenerateResponse);
	        this.createdAt = source["createdAt"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class AIChatThread {
	    id: string;
	    connectionId: string;
	    title: string;
	    provider: string;
	    model: string;
	    promptTokens: number;
	    completionTokens: number;
	    totalTokens: number;
	    tokenUsage: ai.TokenUsage;
	    createdAt: string;
	    updatedAt: string;
	
	    static createFrom(source: any = {}) {
	        return new AIChatThread(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.connectionId = source["connectionId"];
	        this.title = source["title"];
	        this.provider = source["provider"];
	        this.model = source["model"];
	        this.promptTokens = source["promptTokens"];
	        this.completionTokens = source["completionTokens"];
	        this.totalTokens = source["totalTokens"];
	        this.tokenUsage = this.convertValues(source["tokenUsage"], ai.TokenUsage);
	        this.createdAt = source["createdAt"];
	        this.updatedAt = source["updatedAt"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ClearAIChatMessagesRequest {
	    threadId: string;
	
	    static createFrom(source: any = {}) {
	        return new ClearAIChatMessagesRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.threadId = source["threadId"];
	    }
	}
	export class CreateAIChatThreadRequest {
	    connectionId: string;
	    title: string;
	    provider: string;
	    model: string;
	
	    static createFrom(source: any = {}) {
	        return new CreateAIChatThreadRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.connectionId = source["connectionId"];
	        this.title = source["title"];
	        this.provider = source["provider"];
	        this.model = source["model"];
	    }
	}
	export class DeleteAIChatThreadRequest {
	    id: string;
	
	    static createFrom(source: any = {}) {
	        return new DeleteAIChatThreadRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	    }
	}
	export class GetQueryWorkspaceDraftsRequest {
	    connectionId: string;
	
	    static createFrom(source: any = {}) {
	        return new GetQueryWorkspaceDraftsRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.connectionId = source["connectionId"];
	    }
	}
	export class GetSchemaSnapshotRequest {
	    connectionId: string;
	
	    static createFrom(source: any = {}) {
	        return new GetSchemaSnapshotRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.connectionId = source["connectionId"];
	    }
	}
	export class ListAIChatMessagesRequest {
	    threadId: string;
	    limit: number;
	
	    static createFrom(source: any = {}) {
	        return new ListAIChatMessagesRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.threadId = source["threadId"];
	        this.limit = source["limit"];
	    }
	}
	export class ListAIChatThreadsRequest {
	    connectionId: string;
	
	    static createFrom(source: any = {}) {
	        return new ListAIChatThreadsRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.connectionId = source["connectionId"];
	    }
	}
	export class ListQueryHistoryRequest {
	    connectionId: string;
	    limit: number;
	
	    static createFrom(source: any = {}) {
	        return new ListQueryHistoryRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.connectionId = source["connectionId"];
	        this.limit = source["limit"];
	    }
	}
	export class QueryHistoryEntry {
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
	
	    static createFrom(source: any = {}) {
	        return new QueryHistoryEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.connectionId = source["connectionId"];
	        this.sql = source["sql"];
	        this.mode = source["mode"];
	        this.durationMs = source["durationMs"];
	        this.executedAt = source["executedAt"];
	        this.success = source["success"];
	        this.rowCount = source["rowCount"];
	        this.affectedRows = source["affectedRows"];
	        this.error = source["error"];
	    }
	}
	export class QueryWorkspaceDraft {
	    id: string;
	    title: string;
	    sql: string;
	
	    static createFrom(source: any = {}) {
	        return new QueryWorkspaceDraft(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.sql = source["sql"];
	    }
	}
	export class QueryWorkspaceDraftState {
	    connectionId: string;
	    activeWorkspaceId: string;
	    workspaces: QueryWorkspaceDraft[];
	    updatedAt: string;
	
	    static createFrom(source: any = {}) {
	        return new QueryWorkspaceDraftState(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.connectionId = source["connectionId"];
	        this.activeWorkspaceId = source["activeWorkspaceId"];
	        this.workspaces = this.convertValues(source["workspaces"], QueryWorkspaceDraft);
	        this.updatedAt = source["updatedAt"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SaveAIChatMessageRequest {
	    id: string;
	    threadId: string;
	    connectionId: string;
	    provider: string;
	    model: string;
	    role: string;
	    content: string;
	    response?: ai.GenerateResponse;
	    createdAt: string;
	
	    static createFrom(source: any = {}) {
	        return new SaveAIChatMessageRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.threadId = source["threadId"];
	        this.connectionId = source["connectionId"];
	        this.provider = source["provider"];
	        this.model = source["model"];
	        this.role = source["role"];
	        this.content = source["content"];
	        this.response = this.convertValues(source["response"], ai.GenerateResponse);
	        this.createdAt = source["createdAt"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SaveQueryHistoryRequest {
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
	
	    static createFrom(source: any = {}) {
	        return new SaveQueryHistoryRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.connectionId = source["connectionId"];
	        this.sql = source["sql"];
	        this.mode = source["mode"];
	        this.durationMs = source["durationMs"];
	        this.executedAt = source["executedAt"];
	        this.success = source["success"];
	        this.rowCount = source["rowCount"];
	        this.affectedRows = source["affectedRows"];
	        this.error = source["error"];
	    }
	}
	export class SaveQueryWorkspaceDraftsRequest {
	    connectionId: string;
	    activeWorkspaceId: string;
	    workspaces: QueryWorkspaceDraft[];
	
	    static createFrom(source: any = {}) {
	        return new SaveQueryWorkspaceDraftsRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.connectionId = source["connectionId"];
	        this.activeWorkspaceId = source["activeWorkspaceId"];
	        this.workspaces = this.convertValues(source["workspaces"], QueryWorkspaceDraft);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SaveSchemaSnapshotRequest {
	    connectionId: string;
	    schemas: postgres.SchemaSummary[];
	    tablesBySchema: Record<string, Array<postgres.TableSummary>>;
	    fingerprint: string;
	
	    static createFrom(source: any = {}) {
	        return new SaveSchemaSnapshotRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.connectionId = source["connectionId"];
	        this.schemas = this.convertValues(source["schemas"], postgres.SchemaSummary);
	        this.tablesBySchema = this.convertValues(source["tablesBySchema"], Array<postgres.TableSummary>, true);
	        this.fingerprint = source["fingerprint"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SchemaMetadataSnapshot {
	    connectionId: string;
	    schemas: postgres.SchemaSummary[];
	    tablesBySchema: Record<string, Array<postgres.TableSummary>>;
	    fingerprint: string;
	    updatedAt: string;
	
	    static createFrom(source: any = {}) {
	        return new SchemaMetadataSnapshot(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.connectionId = source["connectionId"];
	        this.schemas = this.convertValues(source["schemas"], postgres.SchemaSummary);
	        this.tablesBySchema = this.convertValues(source["tablesBySchema"], Array<postgres.TableSummary>, true);
	        this.fingerprint = source["fingerprint"];
	        this.updatedAt = source["updatedAt"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class UpdateAIChatThreadRequest {
	    id: string;
	    title: string;
	    provider: string;
	    model: string;
	
	    static createFrom(source: any = {}) {
	        return new UpdateAIChatThreadRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.provider = source["provider"];
	        this.model = source["model"];
	    }
	}

}

export namespace connections {
	
	export class ConnectRequest {
	    profileId: string;
	    password: string;
	    reconnectKeychain: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ConnectRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.profileId = source["profileId"];
	        this.password = source["password"];
	        this.reconnectKeychain = source["reconnectKeychain"];
	    }
	}
	export class ConnectionProfile {
	    id: string;
	    driver: string;
	    name: string;
	    host: string;
	    port: number;
	    database: string;
	    username: string;
	    endpoint: string;
	    sslMode: string;
	    color: string;
	    createdAt: string;
	    updatedAt: string;
	
	    static createFrom(source: any = {}) {
	        return new ConnectionProfile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.driver = source["driver"];
	        this.name = source["name"];
	        this.host = source["host"];
	        this.port = source["port"];
	        this.database = source["database"];
	        this.username = source["username"];
	        this.endpoint = source["endpoint"];
	        this.sslMode = source["sslMode"];
	        this.color = source["color"];
	        this.createdAt = source["createdAt"];
	        this.updatedAt = source["updatedAt"];
	    }
	}
	export class ConnectionStatus {
	    profileId: string;
	    connected: boolean;
	    message: string;
	
	    static createFrom(source: any = {}) {
	        return new ConnectionStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.profileId = source["profileId"];
	        this.connected = source["connected"];
	        this.message = source["message"];
	    }
	}
	export class SaveConnectionRequest {
	    id: string;
	    driver: string;
	    name: string;
	    host: string;
	    port: number;
	    database: string;
	    username: string;
	    endpoint: string;
	    password: string;
	    sslMode: string;
	    color: string;
	
	    static createFrom(source: any = {}) {
	        return new SaveConnectionRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.driver = source["driver"];
	        this.name = source["name"];
	        this.host = source["host"];
	        this.port = source["port"];
	        this.database = source["database"];
	        this.username = source["username"];
	        this.endpoint = source["endpoint"];
	        this.password = source["password"];
	        this.sslMode = source["sslMode"];
	        this.color = source["color"];
	    }
	}
	export class TestConnectionRequest {
	    profileId: string;
	    driver: string;
	    name: string;
	    host: string;
	    port: number;
	    database: string;
	    username: string;
	    endpoint: string;
	    password: string;
	    sslMode: string;
	    color: string;
	
	    static createFrom(source: any = {}) {
	        return new TestConnectionRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.profileId = source["profileId"];
	        this.driver = source["driver"];
	        this.name = source["name"];
	        this.host = source["host"];
	        this.port = source["port"];
	        this.database = source["database"];
	        this.username = source["username"];
	        this.endpoint = source["endpoint"];
	        this.password = source["password"];
	        this.sslMode = source["sslMode"];
	        this.color = source["color"];
	    }
	}

}

export namespace fileexport {
	
	export class SaveExportRequest {
	    filename: string;
	    contents: string;
	
	    static createFrom(source: any = {}) {
	        return new SaveExportRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.filename = source["filename"];
	        this.contents = source["contents"];
	    }
	}
	export class SaveExportResult {
	    filename: string;
	    directory: string;
	    path: string;
	
	    static createFrom(source: any = {}) {
	        return new SaveExportResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.filename = source["filename"];
	        this.directory = source["directory"];
	        this.path = source["path"];
	    }
	}

}

export namespace postgres {
	
	export class ColumnSummary {
	    name: string;
	    dataType: string;
	    nullable: boolean;
	    default: string;
	    position: number;
	    isPrimary: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ColumnSummary(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.dataType = source["dataType"];
	        this.nullable = source["nullable"];
	        this.default = source["default"];
	        this.position = source["position"];
	        this.isPrimary = source["isPrimary"];
	    }
	}
	export class ConstraintSummary {
	    name: string;
	    type: string;
	    definition: string;
	
	    static createFrom(source: any = {}) {
	        return new ConstraintSummary(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.type = source["type"];
	        this.definition = source["definition"];
	    }
	}
	export class IndexSummary {
	    name: string;
	    definition: string;
	
	    static createFrom(source: any = {}) {
	        return new IndexSummary(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.definition = source["definition"];
	    }
	}
	export class SchemaContext {
	    context: string;
	    detailedTables: number;
	    totalTables: number;
	    truncated: boolean;
	
	    static createFrom(source: any = {}) {
	        return new SchemaContext(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.context = source["context"];
	        this.detailedTables = source["detailedTables"];
	        this.totalTables = source["totalTables"];
	        this.truncated = source["truncated"];
	    }
	}
	export class SchemaContextTable {
	    schema: string;
	    name: string;
	
	    static createFrom(source: any = {}) {
	        return new SchemaContextTable(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.schema = source["schema"];
	        this.name = source["name"];
	    }
	}
	export class SchemaContextRequest {
	    connectionId: string;
	    prompt: string;
	    dialect: string;
	    maxDetailedTables: number;
	    tables: SchemaContextTable[];
	
	    static createFrom(source: any = {}) {
	        return new SchemaContextRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.connectionId = source["connectionId"];
	        this.prompt = source["prompt"];
	        this.dialect = source["dialect"];
	        this.maxDetailedTables = source["maxDetailedTables"];
	        this.tables = this.convertValues(source["tables"], SchemaContextTable);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class SchemaFingerprint {
	    hash: string;
	
	    static createFrom(source: any = {}) {
	        return new SchemaFingerprint(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.hash = source["hash"];
	    }
	}
	export class SchemaSummary {
	    name: string;
	
	    static createFrom(source: any = {}) {
	        return new SchemaSummary(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	    }
	}
	export class TableDetails {
	    schema: string;
	    name: string;
	    type: string;
	    columns: ColumnSummary[];
	    indexes: IndexSummary[];
	    constraints: ConstraintSummary[];
	
	    static createFrom(source: any = {}) {
	        return new TableDetails(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.schema = source["schema"];
	        this.name = source["name"];
	        this.type = source["type"];
	        this.columns = this.convertValues(source["columns"], ColumnSummary);
	        this.indexes = this.convertValues(source["indexes"], IndexSummary);
	        this.constraints = this.convertValues(source["constraints"], ConstraintSummary);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class TableSummary {
	    schema: string;
	    name: string;
	    type: string;
	    rowEstimate: number;
	
	    static createFrom(source: any = {}) {
	        return new TableSummary(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.schema = source["schema"];
	        this.name = source["name"];
	        this.type = source["type"];
	        this.rowEstimate = source["rowEstimate"];
	    }
	}

}

export namespace query {
	
	export class QueryColumn {
	    name: string;
	    dataType: string;
	    sourceSchema?: string;
	    sourceTable?: string;
	    sourceColumn?: string;
	
	    static createFrom(source: any = {}) {
	        return new QueryColumn(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.dataType = source["dataType"];
	        this.sourceSchema = source["sourceSchema"];
	        this.sourceTable = source["sourceTable"];
	        this.sourceColumn = source["sourceColumn"];
	    }
	}
	export class QueryHistoryItem {
	    id: string;
	    connectionId: string;
	    sql: string;
	    durationMs: number;
	    executedAt: string;
	    success: boolean;
	
	    static createFrom(source: any = {}) {
	        return new QueryHistoryItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.connectionId = source["connectionId"];
	        this.sql = source["sql"];
	        this.durationMs = source["durationMs"];
	        this.executedAt = source["executedAt"];
	        this.success = source["success"];
	    }
	}
	export class QueryRequest {
	    requestId: string;
	    connectionId: string;
	    sql: string;
	    maxRows: number;
	    timeoutSeconds: number;
	    confirmDestructive: boolean;
	
	    static createFrom(source: any = {}) {
	        return new QueryRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.requestId = source["requestId"];
	        this.connectionId = source["connectionId"];
	        this.sql = source["sql"];
	        this.maxRows = source["maxRows"];
	        this.timeoutSeconds = source["timeoutSeconds"];
	        this.confirmDestructive = source["confirmDestructive"];
	    }
	}
	export class QueryResult {
	    columns: QueryColumn[];
	    rows: any[][];
	    affectedRows: number;
	    durationMs: number;
	    notices: string[];
	    error: string;
	    truncated: boolean;
	
	    static createFrom(source: any = {}) {
	        return new QueryResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.columns = this.convertValues(source["columns"], QueryColumn);
	        this.rows = source["rows"];
	        this.affectedRows = source["affectedRows"];
	        this.durationMs = source["durationMs"];
	        this.notices = source["notices"];
	        this.error = source["error"];
	        this.truncated = source["truncated"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SQLAnalysis {
	    destructive: boolean;
	    warnings: string[];
	
	    static createFrom(source: any = {}) {
	        return new SQLAnalysis(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.destructive = source["destructive"];
	        this.warnings = source["warnings"];
	    }
	}

}

export namespace settings {
	
	export class AppSettings {
	    theme: string;
	    queryLimit: number;
	    queryTimeoutSeconds: number;
	    confirmDestructiveSql: boolean;
	    sidebarWidth: number;
	    inspectorWidth: number;
	    autoRefreshMetadata: boolean;
	    exportDirectory: string;
	    chatResponsePrompt: string;
	    cursorMode: string;
	    vimNavigationEnabled: boolean;
	    telemetryEnabled: boolean;
	    telemetryInstallId: string;
	
	    static createFrom(source: any = {}) {
	        return new AppSettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.theme = source["theme"];
	        this.queryLimit = source["queryLimit"];
	        this.queryTimeoutSeconds = source["queryTimeoutSeconds"];
	        this.confirmDestructiveSql = source["confirmDestructiveSql"];
	        this.sidebarWidth = source["sidebarWidth"];
	        this.inspectorWidth = source["inspectorWidth"];
	        this.autoRefreshMetadata = source["autoRefreshMetadata"];
	        this.exportDirectory = source["exportDirectory"];
	        this.chatResponsePrompt = source["chatResponsePrompt"];
	        this.cursorMode = source["cursorMode"];
	        this.vimNavigationEnabled = source["vimNavigationEnabled"];
	        this.telemetryEnabled = source["telemetryEnabled"];
	        this.telemetryInstallId = source["telemetryInstallId"];
	    }
	}

}

export namespace updater {
	
	export class InstallUpdateRequest {
	    assetName: string;
	
	    static createFrom(source: any = {}) {
	        return new InstallUpdateRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.assetName = source["assetName"];
	    }
	}
	export class InstallUpdateResult {
	    restarting: boolean;
	    message: string;
	
	    static createFrom(source: any = {}) {
	        return new InstallUpdateResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.restarting = source["restarting"];
	        this.message = source["message"];
	    }
	}
	export class ReleaseState {
	    currentVersion: string;
	    currentReleaseHash: string;
	    lastCheckedAt: string;
	    lastInstalledAt: string;
	
	    static createFrom(source: any = {}) {
	        return new ReleaseState(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.currentVersion = source["currentVersion"];
	        this.currentReleaseHash = source["currentReleaseHash"];
	        this.lastCheckedAt = source["lastCheckedAt"];
	        this.lastInstalledAt = source["lastInstalledAt"];
	    }
	}
	export class UpdateCheckResult {
	    currentVersion: string;
	    currentReleaseHash: string;
	    latestVersion: string;
	    latestReleaseHash: string;
	    releaseName: string;
	    releaseUrl: string;
	    publishedAt: string;
	    assetName: string;
	    assetSize: number;
	    assetDigest: string;
	    updateAvailable: boolean;
	    canInstall: boolean;
	    message: string;
	
	    static createFrom(source: any = {}) {
	        return new UpdateCheckResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.currentVersion = source["currentVersion"];
	        this.currentReleaseHash = source["currentReleaseHash"];
	        this.latestVersion = source["latestVersion"];
	        this.latestReleaseHash = source["latestReleaseHash"];
	        this.releaseName = source["releaseName"];
	        this.releaseUrl = source["releaseUrl"];
	        this.publishedAt = source["publishedAt"];
	        this.assetName = source["assetName"];
	        this.assetSize = source["assetSize"];
	        this.assetDigest = source["assetDigest"];
	        this.updateAvailable = source["updateAvailable"];
	        this.canInstall = source["canInstall"];
	        this.message = source["message"];
	    }
	}

}

