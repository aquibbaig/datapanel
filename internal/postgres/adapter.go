package postgres

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"datapanel/internal/apperrors"
	"datapanel/internal/connections"
	"datapanel/internal/query"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Adapter struct {
	mu    sync.RWMutex
	pools map[string]*pgxpool.Pool
}

func NewAdapter() *Adapter {
	return &Adapter{pools: map[string]*pgxpool.Pool{}}
}

func (a *Adapter) Test(ctx context.Context, profile connections.ConnectionProfile, password string) error {
	pool, err := pgxpool.New(ctx, connectionString(profile, password))
	if err != nil {
		return apperrors.New(apperrors.CodeDatabase, "could not create Postgres connection")
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		return apperrors.New(apperrors.CodeDatabase, "could not reach Postgres database")
	}
	return nil
}

func (a *Adapter) Connect(ctx context.Context, profile connections.ConnectionProfile, password string) error {
	pool, err := pgxpool.New(ctx, connectionString(profile, password))
	if err != nil {
		return apperrors.New(apperrors.CodeDatabase, "could not create Postgres connection")
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return apperrors.New(apperrors.CodeDatabase, "could not reach Postgres database")
	}

	a.mu.Lock()
	old := a.pools[profile.ID]
	a.pools[profile.ID] = pool
	a.mu.Unlock()

	if old != nil {
		old.Close()
	}
	return nil
}

func (a *Adapter) Disconnect(ctx context.Context, profileID string) error {
	_ = ctx
	a.mu.Lock()
	pool := a.pools[profileID]
	delete(a.pools, profileID)
	a.mu.Unlock()
	if pool != nil {
		pool.Close()
	}
	return nil
}

func (a *Adapter) CloseAll() {
	a.mu.Lock()
	defer a.mu.Unlock()
	for id, pool := range a.pools {
		pool.Close()
		delete(a.pools, id)
	}
}

func (a *Adapter) ListSchemas(ctx context.Context, connectionID string) ([]SchemaSummary, error) {
	pool, err := a.pool(connectionID)
	if err != nil {
		return nil, err
	}

	rows, err := pool.Query(ctx, `
		select schema_name
		from information_schema.schemata
		where schema_name not in ('pg_catalog', 'information_schema')
		  and schema_name not like 'pg_toast%'
		order by schema_name
	`)
	if err != nil {
		return nil, apperrors.New(apperrors.CodeDatabase, "could not load schemas")
	}
	defer rows.Close()

	schemas := []SchemaSummary{}
	for rows.Next() {
		var schema SchemaSummary
		if err := rows.Scan(&schema.Name); err != nil {
			return nil, apperrors.New(apperrors.CodeDatabase, "could not read schema metadata")
		}
		schemas = append(schemas, schema)
	}
	return schemas, rows.Err()
}

func (a *Adapter) ListTables(ctx context.Context, connectionID string, schema string) ([]TableSummary, error) {
	pool, err := a.pool(connectionID)
	if err != nil {
		return nil, err
	}

	rows, err := pool.Query(ctx, `
		select
			n.nspname as table_schema,
			c.relname as table_name,
			case c.relkind
				when 'r' then 'BASE TABLE'
				when 'v' then 'VIEW'
				when 'm' then 'MATERIALIZED VIEW'
				when 'f' then 'FOREIGN TABLE'
				else c.relkind::text
			end as table_type,
			coalesce(c.reltuples::bigint, 0) as row_estimate
		from pg_class c
		join pg_namespace n on n.oid = c.relnamespace
		where n.nspname = $1
		  and c.relkind in ('r', 'v', 'm', 'f')
		order by c.relname
	`, schema)
	if err != nil {
		return nil, apperrors.New(apperrors.CodeDatabase, "could not load tables")
	}
	defer rows.Close()

	tables := []TableSummary{}
	for rows.Next() {
		var table TableSummary
		if err := rows.Scan(&table.Schema, &table.Name, &table.Type, &table.RowEstimate); err != nil {
			return nil, apperrors.New(apperrors.CodeDatabase, "could not read table metadata")
		}
		tables = append(tables, table)
	}
	return tables, rows.Err()
}

func (a *Adapter) DescribeTable(ctx context.Context, connectionID string, schema string, table string) (TableDetails, error) {
	pool, err := a.pool(connectionID)
	if err != nil {
		return TableDetails{}, err
	}

	details := TableDetails{Schema: schema, Name: table}
	details.Columns, err = loadColumns(ctx, pool, schema, table)
	if err != nil {
		return TableDetails{}, err
	}
	details.Indexes, err = loadIndexes(ctx, pool, schema, table)
	if err != nil {
		return TableDetails{}, err
	}
	details.Constraints, err = loadConstraints(ctx, pool, schema, table)
	if err != nil {
		return TableDetails{}, err
	}
	details.Type, _ = loadTableType(ctx, pool, schema, table)
	return details, nil
}

func (a *Adapter) SchemaFingerprint(ctx context.Context, connectionID string) (SchemaFingerprint, error) {
	pool, err := a.pool(connectionID)
	if err != nil {
		return SchemaFingerprint{}, err
	}

	rows, err := pool.Query(ctx, `
		select fingerprint_row
		from (
			select concat_ws(chr(31), 'schema', schema_name) as fingerprint_row
			from information_schema.schemata
			where schema_name not in ('pg_catalog', 'information_schema')
			  and schema_name not like 'pg_toast%'
			union all
			select concat_ws(chr(31), 'table', n.nspname, c.relname, c.relkind::text)
			from pg_class c
			join pg_namespace n on n.oid = c.relnamespace
			where n.nspname not in ('pg_catalog', 'information_schema')
			  and n.nspname not like 'pg_toast%'
			  and c.relkind in ('r', 'v', 'm', 'f')
			union all
			select concat_ws(
				chr(31),
				'column',
				c.table_schema,
				c.table_name,
				c.ordinal_position::text,
				c.column_name,
				coalesce(c.udt_name, c.data_type),
				c.is_nullable,
				coalesce(c.column_default, '')
			)
			from information_schema.columns c
			where c.table_schema not in ('pg_catalog', 'information_schema')
			  and c.table_schema not like 'pg_toast%'
			union all
			select concat_ws(chr(31), 'index', schemaname, tablename, indexname, indexdef)
			from pg_indexes
			where schemaname not in ('pg_catalog', 'information_schema')
			  and schemaname not like 'pg_toast%'
			union all
			select concat_ws(
				chr(31),
				'constraint',
				tc.table_schema,
				tc.table_name,
				tc.constraint_name,
				tc.constraint_type,
				coalesce(string_agg(kcu.column_name, ',' order by kcu.ordinal_position), '')
			)
			from information_schema.table_constraints tc
			left join information_schema.key_column_usage kcu
			  on tc.constraint_name = kcu.constraint_name
			 and tc.table_schema = kcu.table_schema
			 and tc.table_name = kcu.table_name
			where tc.table_schema not in ('pg_catalog', 'information_schema')
			  and tc.table_schema not like 'pg_toast%'
			group by tc.table_schema, tc.table_name, tc.constraint_name, tc.constraint_type
		) rows
		order by fingerprint_row
	`)
	if err != nil {
		return SchemaFingerprint{}, apperrors.New(apperrors.CodeDatabase, "could not fingerprint schema")
	}
	defer rows.Close()

	hash := sha256.New()
	for rows.Next() {
		var row string
		if err := rows.Scan(&row); err != nil {
			return SchemaFingerprint{}, apperrors.New(apperrors.CodeDatabase, "could not read schema fingerprint")
		}
		hash.Write([]byte(row))
		hash.Write([]byte{'\n'})
	}
	if err := rows.Err(); err != nil {
		return SchemaFingerprint{}, apperrors.New(apperrors.CodeDatabase, "could not read schema fingerprint")
	}
	return SchemaFingerprint{Hash: hex.EncodeToString(hash.Sum(nil))}, nil
}

func (a *Adapter) Execute(ctx context.Context, request query.QueryRequest) (query.QueryResult, error) {
	pool, err := a.pool(request.ConnectionID)
	if err != nil {
		return query.QueryResult{}, err
	}

	started := time.Now()
	if !returnsRows(request.SQL) {
		tag, err := pool.Exec(ctx, request.SQL)
		if err != nil {
			if ctx.Err() != nil {
				return query.QueryResult{}, apperrors.New(apperrors.CodeCanceled, "query was canceled")
			}
			return query.QueryResult{}, apperrors.New(apperrors.CodeDatabase, sanitizeDatabaseError(err))
		}
		return query.QueryResult{
			Columns:      []query.QueryColumn{},
			Rows:         [][]any{},
			AffectedRows: tag.RowsAffected(),
			DurationMS:   time.Since(started).Milliseconds(),
		}, nil
	}

	rows, err := pool.Query(ctx, request.SQL)
	if err != nil {
		if ctx.Err() != nil {
			return query.QueryResult{}, apperrors.New(apperrors.CodeCanceled, "query was canceled")
		}
		return query.QueryResult{}, apperrors.New(apperrors.CodeDatabase, sanitizeDatabaseError(err))
	}
	defer rows.Close()

	fields := rows.FieldDescriptions()
	columnSources := loadQueryColumnSources(ctx, pool, fields)
	columns := make([]query.QueryColumn, 0, len(fields))
	for _, field := range fields {
		column := query.QueryColumn{
			Name:     string(field.Name),
			DataType: strconv.FormatUint(uint64(field.DataTypeOID), 10),
		}
		if source, ok := columnSources[columnSourceKey(field.TableOID, field.TableAttributeNumber)]; ok {
			column.SourceSchema = source.schema
			column.SourceTable = source.table
			column.SourceColumn = source.column
		}
		columns = append(columns, column)
	}

	limit := request.MaxRows
	if limit <= 0 {
		limit = 500
	}
	data := make([][]any, 0)
	truncated := false
	for rows.Next() {
		values, err := rows.Values()
		if err != nil {
			return query.QueryResult{}, apperrors.New(apperrors.CodeDatabase, "could not read query row")
		}
		if len(data) >= limit {
			truncated = true
			break
		}
		data = append(data, normalizeRow(values))
	}
	if rows.Err() != nil {
		if ctx.Err() != nil {
			return query.QueryResult{}, apperrors.New(apperrors.CodeCanceled, "query was canceled")
		}
		return query.QueryResult{}, apperrors.New(apperrors.CodeDatabase, sanitizeDatabaseError(rows.Err()))
	}

	tag := rows.CommandTag()
	return query.QueryResult{
		Columns:      columns,
		Rows:         data,
		AffectedRows: tag.RowsAffected(),
		DurationMS:   time.Since(started).Milliseconds(),
		Truncated:    truncated,
	}, nil
}

type queryColumnSource struct {
	schema string
	table  string
	column string
}

func loadQueryColumnSources(ctx context.Context, pool *pgxpool.Pool, fields []pgconn.FieldDescription) map[string]queryColumnSource {
	tableOIDs := make([]uint32, 0)
	seen := map[uint32]bool{}
	for _, field := range fields {
		if field.TableOID == 0 || field.TableAttributeNumber == 0 || seen[field.TableOID] {
			continue
		}
		seen[field.TableOID] = true
		tableOIDs = append(tableOIDs, field.TableOID)
	}
	if len(tableOIDs) == 0 {
		return map[string]queryColumnSource{}
	}

	rows, err := pool.Query(ctx, `
		select
			c.oid::int8,
			a.attnum::int2,
			n.nspname,
			c.relname,
			a.attname
		from pg_catalog.pg_attribute a
		join pg_catalog.pg_class c on c.oid = a.attrelid
		join pg_catalog.pg_namespace n on n.oid = c.relnamespace
		where c.oid = any($1::oid[])
		  and a.attnum > 0
		  and not a.attisdropped
	`, tableOIDs)
	if err != nil {
		return map[string]queryColumnSource{}
	}
	defer rows.Close()

	sources := map[string]queryColumnSource{}
	for rows.Next() {
		var tableOID uint64
		var attributeNumber int16
		var source queryColumnSource
		if err := rows.Scan(&tableOID, &attributeNumber, &source.schema, &source.table, &source.column); err != nil {
			return map[string]queryColumnSource{}
		}
		sources[columnSourceKey(uint32(tableOID), uint16(attributeNumber))] = source
	}
	if rows.Err() != nil {
		return map[string]queryColumnSource{}
	}
	return sources
}

func columnSourceKey(tableOID uint32, attributeNumber uint16) string {
	return fmt.Sprintf("%d:%d", tableOID, attributeNumber)
}

func (a *Adapter) pool(connectionID string) (*pgxpool.Pool, error) {
	a.mu.RLock()
	defer a.mu.RUnlock()
	pool := a.pools[connectionID]
	if pool == nil {
		return nil, apperrors.New(apperrors.CodeNotFound, "connection is not active")
	}
	return pool, nil
}

func connectionString(profile connections.ConnectionProfile, password string) string {
	host, port := connectionEndpoint(profile.Host, profile.Port)

	u := url.URL{
		Scheme: "postgres",
		User:   url.UserPassword(profile.Username, password),
		Host:   net.JoinHostPort(host, strconv.Itoa(port)),
		Path:   profile.Database,
	}
	q := u.Query()
	q.Set("sslmode", profile.SSLMode)
	u.RawQuery = q.Encode()
	return u.String()
}

func connectionEndpoint(host string, fallbackPort int) (string, int) {
	trimmedHost := strings.TrimSpace(host)
	parsedHost, parsedPort, err := net.SplitHostPort(trimmedHost)
	if err == nil {
		port, portErr := strconv.Atoi(parsedPort)
		if portErr == nil {
			return normalizeConnectionHost(parsedHost), port
		}
	}
	return normalizeConnectionHost(trimmedHost), fallbackPort
}

func normalizeConnectionHost(host string) string {
	if strings.HasPrefix(host, "[") && strings.HasSuffix(host, "]") {
		return strings.TrimSuffix(strings.TrimPrefix(host, "["), "]")
	}
	return host
}

func loadColumns(ctx context.Context, pool *pgxpool.Pool, schema string, table string) ([]ColumnSummary, error) {
	rows, err := pool.Query(ctx, `
		with primary_keys as (
			select kcu.column_name
			from information_schema.table_constraints tc
			join information_schema.key_column_usage kcu
			  on tc.constraint_name = kcu.constraint_name
			 and tc.table_schema = kcu.table_schema
			where tc.constraint_type = 'PRIMARY KEY'
			  and tc.table_schema = $1
			  and tc.table_name = $2
		)
		select
			c.column_name,
			coalesce(pg_catalog.format_type(a.atttypid, a.atttypmod), c.udt_name, c.data_type),
			c.is_nullable = 'YES',
			coalesce(c.column_default, ''),
			c.ordinal_position,
			pk.column_name is not null
		from information_schema.columns c
		left join pg_catalog.pg_namespace n on n.nspname = c.table_schema
		left join pg_catalog.pg_class cl on cl.relnamespace = n.oid and cl.relname = c.table_name
		left join pg_catalog.pg_attribute a
		  on a.attrelid = cl.oid
		 and a.attname = c.column_name
		 and a.attnum > 0
		 and not a.attisdropped
		left join primary_keys pk on pk.column_name = c.column_name
		where c.table_schema = $1 and c.table_name = $2
		order by c.ordinal_position
	`, schema, table)
	if err != nil {
		return nil, apperrors.New(apperrors.CodeDatabase, "could not load columns")
	}
	defer rows.Close()

	columns := []ColumnSummary{}
	for rows.Next() {
		var column ColumnSummary
		if err := rows.Scan(&column.Name, &column.DataType, &column.Nullable, &column.Default, &column.Position, &column.IsPrimary); err != nil {
			return nil, apperrors.New(apperrors.CodeDatabase, "could not read column metadata")
		}
		columns = append(columns, column)
	}
	return columns, rows.Err()
}

func loadIndexes(ctx context.Context, pool *pgxpool.Pool, schema string, table string) ([]IndexSummary, error) {
	rows, err := pool.Query(ctx, `
		select indexname, indexdef
		from pg_indexes
		where schemaname = $1 and tablename = $2
		order by indexname
	`, schema, table)
	if err != nil {
		return nil, apperrors.New(apperrors.CodeDatabase, "could not load indexes")
	}
	defer rows.Close()

	indexes := []IndexSummary{}
	for rows.Next() {
		var index IndexSummary
		if err := rows.Scan(&index.Name, &index.Definition); err != nil {
			return nil, apperrors.New(apperrors.CodeDatabase, "could not read index metadata")
		}
		indexes = append(indexes, index)
	}
	return indexes, rows.Err()
}

func loadConstraints(ctx context.Context, pool *pgxpool.Pool, schema string, table string) ([]ConstraintSummary, error) {
	rows, err := pool.Query(ctx, `
		select
			con.conname,
			case con.contype
				when 'p' then 'PRIMARY KEY'
				when 'f' then 'FOREIGN KEY'
				when 'u' then 'UNIQUE'
				when 'c' then 'CHECK'
				else con.contype::text
			end,
			pg_get_constraintdef(con.oid)
		from pg_constraint con
		join pg_class rel on rel.oid = con.conrelid
		join pg_namespace nsp on nsp.oid = con.connamespace
		where nsp.nspname = $1 and rel.relname = $2
		order by con.conname
	`, schema, table)
	if err != nil {
		return nil, apperrors.New(apperrors.CodeDatabase, "could not load constraints")
	}
	defer rows.Close()

	constraints := []ConstraintSummary{}
	for rows.Next() {
		var constraint ConstraintSummary
		if err := rows.Scan(&constraint.Name, &constraint.Type, &constraint.Definition); err != nil {
			return nil, apperrors.New(apperrors.CodeDatabase, "could not read constraint metadata")
		}
		constraints = append(constraints, constraint)
	}
	return constraints, rows.Err()
}

func loadTableType(ctx context.Context, pool *pgxpool.Pool, schema string, table string) (string, error) {
	var tableType string
	err := pool.QueryRow(ctx, `
		select case c.relkind
			when 'r' then 'BASE TABLE'
			when 'v' then 'VIEW'
			when 'm' then 'MATERIALIZED VIEW'
			when 'f' then 'FOREIGN TABLE'
			else c.relkind::text
		end
		from pg_class c
		join pg_namespace n on n.oid = c.relnamespace
		where n.nspname = $1 and c.relname = $2
	`, schema, table).Scan(&tableType)
	if err != nil {
		return "", err
	}
	return tableType, nil
}

func normalizeRow(values []any) []any {
	row := make([]any, len(values))
	for index, value := range values {
		switch typed := value.(type) {
		case nil:
			row[index] = nil
		case [16]byte:
			row[index] = formatUUIDBytes(typed)
		case []byte:
			row[index] = string(typed)
		case time.Time:
			row[index] = typed.Format(time.RFC3339Nano)
		default:
			row[index] = typed
		}
	}
	return row
}

func formatUUIDBytes(value [16]byte) string {
	return fmt.Sprintf("%x-%x-%x-%x-%x", value[0:4], value[4:6], value[6:8], value[8:10], value[10:16])
}

func returnsRows(sql string) bool {
	keyword := firstKeyword(sql)
	switch keyword {
	case "select", "show", "explain", "with", "values":
		return true
	case "insert", "update", "delete":
		return containsKeyword(sql, "returning")
	default:
		return false
	}
}

func containsKeyword(sql string, keyword string) bool {
	for _, field := range strings.Fields(strings.ToLower(sql)) {
		if strings.Trim(field, ";") == keyword {
			return true
		}
	}
	return false
}

func firstKeyword(sql string) string {
	trimmed := strings.TrimSpace(sql)
	for strings.HasPrefix(trimmed, "--") || strings.HasPrefix(trimmed, "/*") {
		if strings.HasPrefix(trimmed, "--") {
			lineEnd := strings.IndexByte(trimmed, '\n')
			if lineEnd == -1 {
				return ""
			}
			trimmed = strings.TrimSpace(trimmed[lineEnd+1:])
			continue
		}
		blockEnd := strings.Index(trimmed, "*/")
		if blockEnd == -1 {
			return ""
		}
		trimmed = strings.TrimSpace(trimmed[blockEnd+2:])
	}
	fields := strings.Fields(trimmed)
	if len(fields) == 0 {
		return ""
	}
	return strings.ToLower(fields[0])
}

func sanitizeDatabaseError(err error) string {
	if err == nil {
		return ""
	}
	if err == pgx.ErrNoRows {
		return "no rows returned"
	}
	message := err.Error()
	if len(message) > 600 {
		message = message[:600] + "..."
	}
	return fmt.Sprintf("Postgres error: %s", message)
}
