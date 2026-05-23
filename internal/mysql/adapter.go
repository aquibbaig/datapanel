package mysql

import (
	"context"
	"database/sql"
	"fmt"
	"net"
	"strconv"
	"strings"
	"sync"
	"time"

	"datapanel/internal/apperrors"
	"datapanel/internal/connections"
	"datapanel/internal/postgres"
	"datapanel/internal/query"

	mysqlDriver "github.com/go-sql-driver/mysql"
)

type Adapter struct {
	mu  sync.RWMutex
	dbs map[string]*sql.DB
}

func NewAdapter() *Adapter {
	return &Adapter{dbs: map[string]*sql.DB{}}
}

func (a *Adapter) Test(ctx context.Context, profile connections.ConnectionProfile, password string) error {
	db, err := sql.Open("mysql", connectionString(profile, password))
	if err != nil {
		return apperrors.New(apperrors.CodeDatabase, "could not create MySQL connection")
	}
	defer db.Close()

	if err := db.PingContext(ctx); err != nil {
		return apperrors.New(apperrors.CodeDatabase, "could not reach MySQL database")
	}
	return nil
}

func (a *Adapter) Connect(ctx context.Context, profile connections.ConnectionProfile, password string) error {
	db, err := sql.Open("mysql", connectionString(profile, password))
	if err != nil {
		return apperrors.New(apperrors.CodeDatabase, "could not create MySQL connection")
	}
	db.SetMaxOpenConns(8)
	db.SetMaxIdleConns(4)
	db.SetConnMaxIdleTime(5 * time.Minute)

	if err := db.PingContext(ctx); err != nil {
		_ = db.Close()
		return apperrors.New(apperrors.CodeDatabase, "could not reach MySQL database")
	}

	a.mu.Lock()
	old := a.dbs[profile.ID]
	a.dbs[profile.ID] = db
	a.mu.Unlock()

	if old != nil {
		_ = old.Close()
	}
	return nil
}

func (a *Adapter) Disconnect(ctx context.Context, profileID string) error {
	_ = ctx
	a.mu.Lock()
	db := a.dbs[profileID]
	delete(a.dbs, profileID)
	a.mu.Unlock()
	if db != nil {
		_ = db.Close()
	}
	return nil
}

func (a *Adapter) CloseAll() {
	a.mu.Lock()
	defer a.mu.Unlock()
	for id, db := range a.dbs {
		_ = db.Close()
		delete(a.dbs, id)
	}
}

func (a *Adapter) ListSchemas(ctx context.Context, connectionID string) ([]postgres.SchemaSummary, error) {
	db, err := a.db(connectionID)
	if err != nil {
		return nil, err
	}

	rows, err := db.QueryContext(ctx, `
		select schema_name
		from information_schema.schemata
		where schema_name not in ('information_schema', 'mysql', 'performance_schema', 'sys')
		order by schema_name
	`)
	if err != nil {
		return nil, apperrors.New(apperrors.CodeDatabase, "could not load schemas")
	}
	defer rows.Close()

	schemas := []postgres.SchemaSummary{}
	for rows.Next() {
		var schema postgres.SchemaSummary
		if err := rows.Scan(&schema.Name); err != nil {
			return nil, apperrors.New(apperrors.CodeDatabase, "could not read schema metadata")
		}
		schemas = append(schemas, schema)
	}
	return schemas, rows.Err()
}

func (a *Adapter) ListTables(ctx context.Context, connectionID string, schema string) ([]postgres.TableSummary, error) {
	db, err := a.db(connectionID)
	if err != nil {
		return nil, err
	}

	rows, err := db.QueryContext(ctx, `
		select table_schema, table_name, table_type, coalesce(table_rows, 0)
		from information_schema.tables
		where table_schema = ?
		order by table_name
	`, schema)
	if err != nil {
		return nil, apperrors.New(apperrors.CodeDatabase, "could not load tables")
	}
	defer rows.Close()

	tables := []postgres.TableSummary{}
	for rows.Next() {
		var table postgres.TableSummary
		var rowEstimate sql.NullInt64
		if err := rows.Scan(&table.Schema, &table.Name, &table.Type, &rowEstimate); err != nil {
			return nil, apperrors.New(apperrors.CodeDatabase, "could not read table metadata")
		}
		if rowEstimate.Valid {
			table.RowEstimate = rowEstimate.Int64
		}
		tables = append(tables, table)
	}
	return tables, rows.Err()
}

func (a *Adapter) DescribeTable(ctx context.Context, connectionID string, schema string, table string) (postgres.TableDetails, error) {
	db, err := a.db(connectionID)
	if err != nil {
		return postgres.TableDetails{}, err
	}

	details := postgres.TableDetails{Schema: schema, Name: table}
	details.Columns, err = loadColumns(ctx, db, schema, table)
	if err != nil {
		return postgres.TableDetails{}, err
	}
	details.Indexes, err = loadIndexes(ctx, db, schema, table)
	if err != nil {
		return postgres.TableDetails{}, err
	}
	details.Constraints, err = loadConstraints(ctx, db, schema, table)
	if err != nil {
		return postgres.TableDetails{}, err
	}
	details.Type, _ = loadTableType(ctx, db, schema, table)
	return details, nil
}

func (a *Adapter) Execute(ctx context.Context, request query.QueryRequest) (query.QueryResult, error) {
	db, err := a.db(request.ConnectionID)
	if err != nil {
		return query.QueryResult{}, err
	}

	if !returnsRows(request.SQL) {
		started := time.Now()
		result, err := db.ExecContext(ctx, request.SQL)
		if err != nil {
			if ctx.Err() != nil {
				return query.QueryResult{}, apperrors.New(apperrors.CodeCanceled, "query was canceled")
			}
			return query.QueryResult{}, apperrors.New(apperrors.CodeDatabase, sanitizeDatabaseError(err))
		}
		affected, _ := result.RowsAffected()
		return query.QueryResult{
			Columns:      []query.QueryColumn{},
			Rows:         [][]any{},
			AffectedRows: affected,
			DurationMS:   time.Since(started).Milliseconds(),
		}, nil
	}

	started := time.Now()
	rows, err := db.QueryContext(ctx, request.SQL)
	if err != nil {
		if ctx.Err() != nil {
			return query.QueryResult{}, apperrors.New(apperrors.CodeCanceled, "query was canceled")
		}
		return query.QueryResult{}, apperrors.New(apperrors.CodeDatabase, sanitizeDatabaseError(err))
	}
	defer rows.Close()

	names, err := rows.Columns()
	if err != nil {
		return query.QueryResult{}, apperrors.New(apperrors.CodeDatabase, "could not read query columns")
	}
	columnTypes, _ := rows.ColumnTypes()
	columns := make([]query.QueryColumn, 0, len(names))
	for index, name := range names {
		dataType := ""
		if index < len(columnTypes) {
			dataType = columnTypes[index].DatabaseTypeName()
		}
		columns = append(columns, query.QueryColumn{Name: name, DataType: dataType})
	}

	limit := request.MaxRows
	if limit <= 0 {
		limit = 500
	}
	data := make([][]any, 0)
	for rows.Next() {
		if len(data) >= limit {
			break
		}
		values := make([]any, len(names))
		destinations := make([]any, len(names))
		for index := range values {
			destinations[index] = &values[index]
		}
		if err := rows.Scan(destinations...); err != nil {
			return query.QueryResult{}, apperrors.New(apperrors.CodeDatabase, "could not read query row")
		}
		data = append(data, normalizeRow(values))
	}
	if rows.Err() != nil {
		if ctx.Err() != nil {
			return query.QueryResult{}, apperrors.New(apperrors.CodeCanceled, "query was canceled")
		}
		return query.QueryResult{}, apperrors.New(apperrors.CodeDatabase, sanitizeDatabaseError(rows.Err()))
	}

	return query.QueryResult{
		Columns:    columns,
		Rows:       data,
		DurationMS: time.Since(started).Milliseconds(),
		Truncated:  len(data) >= limit,
	}, nil
}

func (a *Adapter) db(connectionID string) (*sql.DB, error) {
	a.mu.RLock()
	defer a.mu.RUnlock()
	db := a.dbs[connectionID]
	if db == nil {
		return nil, apperrors.New(apperrors.CodeNotFound, "connection is not active")
	}
	return db, nil
}

func connectionString(profile connections.ConnectionProfile, password string) string {
	cfg := mysqlDriver.NewConfig()
	cfg.User = profile.Username
	cfg.Passwd = password
	cfg.Net = "tcp"
	cfg.Addr = net.JoinHostPort(profile.Host, strconv.Itoa(profile.Port))
	cfg.DBName = profile.Database
	cfg.ParseTime = true
	cfg.Timeout = 8 * time.Second
	cfg.ReadTimeout = 60 * time.Second
	cfg.WriteTimeout = 60 * time.Second

	switch strings.ToLower(strings.TrimSpace(profile.SSLMode)) {
	case "require", "verify-ca", "verify-full":
		cfg.TLSConfig = "true"
	case "prefer":
		cfg.TLSConfig = "preferred"
	}
	return cfg.FormatDSN()
}

func loadColumns(ctx context.Context, db *sql.DB, schema string, table string) ([]postgres.ColumnSummary, error) {
	rows, err := db.QueryContext(ctx, `
		select
			column_name,
			column_type,
			is_nullable,
			column_default,
			ordinal_position,
			column_key
		from information_schema.columns
		where table_schema = ? and table_name = ?
		order by ordinal_position
	`, schema, table)
	if err != nil {
		return nil, apperrors.New(apperrors.CodeDatabase, "could not load columns")
	}
	defer rows.Close()

	columns := []postgres.ColumnSummary{}
	for rows.Next() {
		var column postgres.ColumnSummary
		var defaultValue sql.NullString
		var isNullable string
		var columnKey string
		if err := rows.Scan(&column.Name, &column.DataType, &isNullable, &defaultValue, &column.Position, &columnKey); err != nil {
			return nil, apperrors.New(apperrors.CodeDatabase, "could not read column metadata")
		}
		column.Nullable = strings.EqualFold(isNullable, "YES")
		column.IsPrimary = strings.EqualFold(columnKey, "PRI")
		if defaultValue.Valid {
			column.Default = defaultValue.String
		}
		columns = append(columns, column)
	}
	return columns, rows.Err()
}

func loadIndexes(ctx context.Context, db *sql.DB, schema string, table string) ([]postgres.IndexSummary, error) {
	rows, err := db.QueryContext(ctx, `
		select
			index_name,
			non_unique,
			group_concat(column_name order by seq_in_index separator ', ')
		from information_schema.statistics
		where table_schema = ? and table_name = ?
		group by index_name, non_unique
		order by index_name
	`, schema, table)
	if err != nil {
		return nil, apperrors.New(apperrors.CodeDatabase, "could not load indexes")
	}
	defer rows.Close()

	indexes := []postgres.IndexSummary{}
	for rows.Next() {
		var index postgres.IndexSummary
		var nonUnique int
		var columns string
		if err := rows.Scan(&index.Name, &nonUnique, &columns); err != nil {
			return nil, apperrors.New(apperrors.CodeDatabase, "could not read index metadata")
		}
		prefix := "INDEX"
		if nonUnique == 0 {
			prefix = "UNIQUE INDEX"
		}
		index.Definition = fmt.Sprintf("%s `%s` (%s)", prefix, index.Name, quoteColumnList(columns))
		indexes = append(indexes, index)
	}
	return indexes, rows.Err()
}

func loadConstraints(ctx context.Context, db *sql.DB, schema string, table string) ([]postgres.ConstraintSummary, error) {
	rows, err := db.QueryContext(ctx, `
		select
			tc.constraint_name,
			tc.constraint_type,
			coalesce(group_concat(kcu.column_name order by kcu.ordinal_position separator ', '), '')
		from information_schema.table_constraints tc
		left join information_schema.key_column_usage kcu
		  on kcu.constraint_schema = tc.constraint_schema
		 and kcu.constraint_name = tc.constraint_name
		 and kcu.table_schema = tc.table_schema
		 and kcu.table_name = tc.table_name
		where tc.table_schema = ? and tc.table_name = ?
		group by tc.constraint_name, tc.constraint_type
		order by tc.constraint_name
	`, schema, table)
	if err != nil {
		return nil, apperrors.New(apperrors.CodeDatabase, "could not load constraints")
	}
	defer rows.Close()

	constraints := []postgres.ConstraintSummary{}
	for rows.Next() {
		var constraint postgres.ConstraintSummary
		var columns string
		if err := rows.Scan(&constraint.Name, &constraint.Type, &columns); err != nil {
			return nil, apperrors.New(apperrors.CodeDatabase, "could not read constraint metadata")
		}
		if columns != "" {
			constraint.Definition = fmt.Sprintf("%s (%s)", constraint.Type, quoteColumnList(columns))
		} else {
			constraint.Definition = constraint.Type
		}
		constraints = append(constraints, constraint)
	}
	return constraints, rows.Err()
}

func loadTableType(ctx context.Context, db *sql.DB, schema string, table string) (string, error) {
	var tableType string
	err := db.QueryRowContext(ctx, `
		select table_type
		from information_schema.tables
		where table_schema = ? and table_name = ?
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

func returnsRows(sql string) bool {
	keyword := firstKeyword(sql)
	switch keyword {
	case "select", "show", "describe", "desc", "explain", "with":
		return true
	default:
		return false
	}
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

func quoteColumnList(columns string) string {
	parts := strings.Split(columns, ",")
	for index, part := range parts {
		parts[index] = "`" + strings.ReplaceAll(strings.TrimSpace(part), "`", "``") + "`"
	}
	return strings.Join(parts, ", ")
}

func sanitizeDatabaseError(err error) string {
	if err == nil {
		return ""
	}
	message := err.Error()
	if len(message) > 600 {
		message = message[:600] + "..."
	}
	return fmt.Sprintf("MySQL error: %s", message)
}
