export namespace connections {
	
	export class ConnectRequest {
	    profileId: string;
	    password: string;
	
	    static createFrom(source: any = {}) {
	        return new ConnectRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.profileId = source["profileId"];
	        this.password = source["password"];
	    }
	}
	export class ConnectionProfile {
	    id: string;
	    name: string;
	    host: string;
	    port: number;
	    database: string;
	    username: string;
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
	        this.name = source["name"];
	        this.host = source["host"];
	        this.port = source["port"];
	        this.database = source["database"];
	        this.username = source["username"];
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
	    name: string;
	    host: string;
	    port: number;
	    database: string;
	    username: string;
	    password: string;
	    sslMode: string;
	    color: string;
	
	    static createFrom(source: any = {}) {
	        return new SaveConnectionRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.host = source["host"];
	        this.port = source["port"];
	        this.database = source["database"];
	        this.username = source["username"];
	        this.password = source["password"];
	        this.sslMode = source["sslMode"];
	        this.color = source["color"];
	    }
	}
	export class TestConnectionRequest {
	    profileId: string;
	    name: string;
	    host: string;
	    port: number;
	    database: string;
	    username: string;
	    password: string;
	    sslMode: string;
	    color: string;
	
	    static createFrom(source: any = {}) {
	        return new TestConnectionRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.profileId = source["profileId"];
	        this.name = source["name"];
	        this.host = source["host"];
	        this.port = source["port"];
	        this.database = source["database"];
	        this.username = source["username"];
	        this.password = source["password"];
	        this.sslMode = source["sslMode"];
	        this.color = source["color"];
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
	
	    static createFrom(source: any = {}) {
	        return new QueryColumn(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.dataType = source["dataType"];
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
	    }
	}

}

