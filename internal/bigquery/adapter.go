package bigquery

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"math/big"
	"sort"
	"strings"
	"sync"
	"time"

	gcbigquery "cloud.google.com/go/bigquery"
	"cloud.google.com/go/civil"
	"datapanel/internal/apperrors"
	"datapanel/internal/connections"
	"datapanel/internal/postgres"
	"datapanel/internal/query"
	"google.golang.org/api/iterator"
	"google.golang.org/api/option"
)

type Adapter struct {
	mu      sync.RWMutex
	clients map[string]*clientState
}

type clientState struct {
	client  *gcbigquery.Client
	profile connections.ConnectionProfile
}

func NewAdapter() *Adapter {
	return &Adapter{clients: map[string]*clientState{}}
}

func (a *Adapter) Test(ctx context.Context, profile connections.ConnectionProfile, password string) error {
	client, err := newClient(ctx, profile, password)
	if err != nil {
		return err
	}
	defer client.Close()

	it := client.Datasets(ctx)
	it.ProjectID = strings.TrimSpace(profile.Host)
	_, err = it.Next()
	if err != nil && err != iterator.Done {
		return apperrors.New(apperrors.CodeDatabase, sanitizeError(err))
	}
	return nil
}

func (a *Adapter) Connect(ctx context.Context, profile connections.ConnectionProfile, password string) error {
	client, err := newClient(ctx, profile, password)
	if err != nil {
		return err
	}

	it := client.Datasets(ctx)
	it.ProjectID = strings.TrimSpace(profile.Host)
	_, err = it.Next()
	if err != nil && err != iterator.Done {
		_ = client.Close()
		return apperrors.New(apperrors.CodeDatabase, sanitizeError(err))
	}

	a.mu.Lock()
	old := a.clients[profile.ID]
	a.clients[profile.ID] = &clientState{client: client, profile: profile}
	a.mu.Unlock()

	if old != nil {
		_ = old.client.Close()
	}
	return nil
}

func (a *Adapter) Disconnect(ctx context.Context, profileID string) error {
	_ = ctx
	a.mu.Lock()
	state := a.clients[profileID]
	delete(a.clients, profileID)
	a.mu.Unlock()
	if state != nil {
		_ = state.client.Close()
	}
	return nil
}

func (a *Adapter) CloseAll() {
	a.mu.Lock()
	defer a.mu.Unlock()
	for id, state := range a.clients {
		_ = state.client.Close()
		delete(a.clients, id)
	}
}

func (a *Adapter) ListSchemas(ctx context.Context, connectionID string) ([]postgres.SchemaSummary, error) {
	state, err := a.client(connectionID)
	if err != nil {
		return nil, err
	}

	it := state.client.Datasets(ctx)
	it.ProjectID = state.projectID()
	schemas := []postgres.SchemaSummary{}
	for {
		dataset, err := it.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			return nil, apperrors.New(apperrors.CodeDatabase, "could not load BigQuery datasets")
		}
		schemas = append(schemas, postgres.SchemaSummary{Name: dataset.DatasetID})
	}
	return schemas, nil
}

func (a *Adapter) ListTables(ctx context.Context, connectionID string, schema string) ([]postgres.TableSummary, error) {
	state, err := a.client(connectionID)
	if err != nil {
		return nil, err
	}

	it := state.client.DatasetInProject(state.projectID(), schema).Tables(ctx)
	tables := []postgres.TableSummary{}
	for {
		table, err := it.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			return nil, apperrors.New(apperrors.CodeDatabase, "could not load BigQuery tables")
		}
		metadata, err := table.Metadata(ctx)
		if err != nil {
			return nil, apperrors.New(apperrors.CodeDatabase, "could not read BigQuery table metadata")
		}
		tables = append(tables, postgres.TableSummary{
			Schema:      schema,
			Name:        table.TableID,
			Type:        bigQueryTableType(metadata.Type),
			RowEstimate: int64(metadata.NumRows),
		})
	}
	return tables, nil
}

func (a *Adapter) DescribeTable(ctx context.Context, connectionID string, schema string, table string) (postgres.TableDetails, error) {
	state, err := a.client(connectionID)
	if err != nil {
		return postgres.TableDetails{}, err
	}

	metadata, err := state.client.DatasetInProject(state.projectID(), schema).Table(table).Metadata(ctx)
	if err != nil {
		return postgres.TableDetails{}, apperrors.New(apperrors.CodeDatabase, "could not read BigQuery table metadata")
	}
	details := postgres.TableDetails{
		Schema:      schema,
		Name:        table,
		Type:        bigQueryTableType(metadata.Type),
		Columns:     columnsFromSchema(metadata.Schema),
		Indexes:     []postgres.IndexSummary{},
		Constraints: []postgres.ConstraintSummary{},
	}
	return details, nil
}

func (a *Adapter) SchemaFingerprint(ctx context.Context, connectionID string) (postgres.SchemaFingerprint, error) {
	state, err := a.client(connectionID)
	if err != nil {
		return postgres.SchemaFingerprint{}, err
	}

	lines := []string{}
	datasets := state.client.Datasets(ctx)
	datasets.ProjectID = state.projectID()
	for {
		dataset, err := datasets.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			return postgres.SchemaFingerprint{}, apperrors.New(apperrors.CodeDatabase, "could not fingerprint BigQuery schema")
		}
		lines = append(lines, "schema\x1f"+dataset.DatasetID)
		tables := dataset.Tables(ctx)
		for {
			table, err := tables.Next()
			if err == iterator.Done {
				break
			}
			if err != nil {
				return postgres.SchemaFingerprint{}, apperrors.New(apperrors.CodeDatabase, "could not fingerprint BigQuery tables")
			}
			metadata, err := table.Metadata(ctx)
			if err != nil {
				return postgres.SchemaFingerprint{}, apperrors.New(apperrors.CodeDatabase, "could not fingerprint BigQuery table metadata")
			}
			lines = append(lines, strings.Join([]string{"table", dataset.DatasetID, table.TableID, bigQueryTableType(metadata.Type)}, "\x1f"))
			for _, column := range columnsFromSchema(metadata.Schema) {
				lines = append(lines, strings.Join([]string{
					"column",
					dataset.DatasetID,
					table.TableID,
					fmt.Sprintf("%d", column.Position),
					column.Name,
					column.DataType,
					fmt.Sprintf("%t", column.Nullable),
				}, "\x1f"))
			}
		}
	}

	sort.Strings(lines)
	hash := sha256.New()
	for _, line := range lines {
		hash.Write([]byte(line))
		hash.Write([]byte{'\n'})
	}
	return postgres.SchemaFingerprint{Hash: hex.EncodeToString(hash.Sum(nil))}, nil
}

func (a *Adapter) Execute(ctx context.Context, request query.QueryRequest) (query.QueryResult, error) {
	state, err := a.client(request.ConnectionID)
	if err != nil {
		return query.QueryResult{}, err
	}

	started := time.Now()
	q := state.client.Query(request.SQL)
	q.UseLegacySQL = false
	if dataset := strings.TrimSpace(state.profile.Database); dataset != "" {
		q.DefaultProjectID = state.projectID()
		q.DefaultDatasetID = dataset
	}

	job, err := q.Run(ctx)
	if err != nil {
		return query.QueryResult{}, databaseError(ctx, err)
	}
	status, err := job.Wait(ctx)
	if err != nil {
		return query.QueryResult{}, databaseError(ctx, err)
	}
	if err := status.Err(); err != nil {
		return query.QueryResult{}, databaseError(ctx, err)
	}

	affectedRows := affectedRows(status)
	it, err := job.Read(ctx)
	if err != nil {
		return query.QueryResult{}, databaseError(ctx, err)
	}
	columns := queryColumns(it.Schema)

	limit := request.MaxRows
	if limit <= 0 {
		limit = 500
	}
	data := make([][]any, 0)
	truncated := false
	for {
		var row []gcbigquery.Value
		err := it.Next(&row)
		if err == iterator.Done {
			break
		}
		if err != nil {
			return query.QueryResult{}, databaseError(ctx, err)
		}
		if len(data) >= limit {
			truncated = true
			break
		}
		data = append(data, normalizeRow(row))
	}

	return query.QueryResult{
		Columns:      columns,
		Rows:         data,
		AffectedRows: affectedRows,
		DurationMS:   time.Since(started).Milliseconds(),
		Truncated:    truncated,
	}, nil
}

func (a *Adapter) client(connectionID string) (*clientState, error) {
	a.mu.RLock()
	defer a.mu.RUnlock()
	state := a.clients[connectionID]
	if state == nil {
		return nil, apperrors.New(apperrors.CodeNotFound, "connection is not active")
	}
	return state, nil
}

func newClient(ctx context.Context, profile connections.ConnectionProfile, password string) (*gcbigquery.Client, error) {
	projectID := strings.TrimSpace(profile.Host)
	if projectID == "" {
		return nil, apperrors.New(apperrors.CodeValidation, "project id is required")
	}

	opts := []option.ClientOption{}
	endpoint := strings.TrimSpace(profile.Endpoint)
	if endpoint != "" {
		opts = append(opts, option.WithEndpoint(endpoint))
	}
	if credentialsJSON := strings.TrimSpace(password); credentialsJSON != "" {
		opts = append(opts, option.WithCredentialsJSON([]byte(credentialsJSON)))
	} else if endpoint != "" {
		opts = append(opts, option.WithoutAuthentication())
	}
	client, err := gcbigquery.NewClient(ctx, projectID, opts...)
	if err != nil {
		return nil, apperrors.New(apperrors.CodeDatabase, "could not create BigQuery client")
	}
	if location := strings.TrimSpace(profile.Username); location != "" {
		client.Location = location
	}
	return client, nil
}

func (s *clientState) projectID() string {
	return strings.TrimSpace(s.profile.Host)
}

func columnsFromSchema(schema gcbigquery.Schema) []postgres.ColumnSummary {
	columns := make([]postgres.ColumnSummary, 0, len(schema))
	for index, field := range schema {
		columns = append(columns, postgres.ColumnSummary{
			Name:      field.Name,
			DataType:  fieldType(field),
			Nullable:  !field.Required && !field.Repeated,
			Default:   field.DefaultValueExpression,
			Position:  index + 1,
			IsPrimary: false,
		})
	}
	return columns
}

func queryColumns(schema gcbigquery.Schema) []query.QueryColumn {
	columns := make([]query.QueryColumn, 0, len(schema))
	for _, field := range schema {
		columns = append(columns, query.QueryColumn{Name: field.Name, DataType: fieldType(field)})
	}
	return columns
}

func fieldType(field *gcbigquery.FieldSchema) string {
	dataType := string(field.Type)
	if field.Repeated {
		dataType = "ARRAY<" + dataType + ">"
	}
	if len(field.Schema) > 0 {
		dataType = "STRUCT"
		if field.Repeated {
			dataType = "ARRAY<STRUCT>"
		}
	}
	return dataType
}

func bigQueryTableType(tableType gcbigquery.TableType) string {
	switch tableType {
	case gcbigquery.RegularTable:
		return "BASE TABLE"
	case gcbigquery.ViewTable:
		return "VIEW"
	case gcbigquery.ExternalTable:
		return "EXTERNAL TABLE"
	case gcbigquery.MaterializedView:
		return "MATERIALIZED VIEW"
	case gcbigquery.Snapshot:
		return "SNAPSHOT"
	default:
		if tableType == "" {
			return "TABLE"
		}
		return strings.ToUpper(string(tableType))
	}
}

func affectedRows(status *gcbigquery.JobStatus) int64 {
	if status == nil || status.Statistics == nil {
		return 0
	}
	stats, ok := status.Statistics.Details.(*gcbigquery.QueryStatistics)
	if !ok || stats == nil {
		return 0
	}
	if stats.NumDMLAffectedRows > 0 {
		return stats.NumDMLAffectedRows
	}
	if stats.DMLStats == nil {
		return 0
	}
	return stats.DMLStats.InsertedRowCount + stats.DMLStats.DeletedRowCount + stats.DMLStats.UpdatedRowCount
}

func normalizeRow(values []gcbigquery.Value) []any {
	row := make([]any, len(values))
	for index, value := range values {
		row[index] = normalizeValue(value)
	}
	return row
}

func normalizeValue(value any) any {
	switch typed := value.(type) {
	case nil:
		return nil
	case []byte:
		return string(typed)
	case *big.Rat:
		return typed.FloatString(38)
	case civil.Date:
		return typed.String()
	case civil.Time:
		return gcbigquery.CivilTimeString(typed)
	case civil.DateTime:
		return gcbigquery.CivilDateTimeString(typed)
	case time.Time:
		return typed.Format(time.RFC3339Nano)
	case []gcbigquery.Value:
		items := make([]any, len(typed))
		for index, item := range typed {
			items[index] = normalizeValue(item)
		}
		return items
	case map[string]gcbigquery.Value:
		items := map[string]any{}
		for key, item := range typed {
			items[key] = normalizeValue(item)
		}
		return items
	default:
		return typed
	}
}

func databaseError(ctx context.Context, err error) error {
	if ctx.Err() != nil {
		return apperrors.New(apperrors.CodeCanceled, "query was canceled")
	}
	return apperrors.New(apperrors.CodeDatabase, sanitizeError(err))
}

func sanitizeError(err error) string {
	message := strings.TrimSpace(err.Error())
	if message == "" {
		return "BigQuery error"
	}
	return fmt.Sprintf("BigQuery error: %s", message)
}
