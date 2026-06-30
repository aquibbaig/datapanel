package bigquery

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"math/big"
	"net"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
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
	"golang.org/x/oauth2"
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
	if strings.TrimSpace(password) == "" {
		a.mu.RLock()
		current := a.clients[profile.ID]
		a.mu.RUnlock()
		if current != nil && sameBigQueryProfile(current.profile, profile) {
			return nil
		}
	}

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

func sameBigQueryProfile(left connections.ConnectionProfile, right connections.ConnectionProfile) bool {
	return strings.TrimSpace(left.ID) == strings.TrimSpace(right.ID) &&
		strings.TrimSpace(left.Host) == strings.TrimSpace(right.Host) &&
		strings.TrimSpace(left.Database) == strings.TrimSpace(right.Database) &&
		strings.TrimSpace(left.Username) == strings.TrimSpace(right.Username) &&
		strings.TrimSpace(left.Endpoint) == strings.TrimSpace(right.Endpoint)
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

	if schema := state.defaultDataset(); schema != "" {
		return []postgres.SchemaSummary{{Name: schema}}, nil
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
			return nil, apperrors.New(apperrors.CodeDatabase, fmt.Sprintf("could not load BigQuery datasets: %s", sanitizeError(err)))
		}
		schemas = append(schemas, postgres.SchemaSummary{Name: dataset.DatasetID})
	}
	sort.Slice(schemas, func(i, j int) bool {
		return schemas[i].Name < schemas[j].Name
	})
	return schemas, nil
}

func (a *Adapter) ListTables(ctx context.Context, connectionID string, schema string) ([]postgres.TableSummary, error) {
	state, err := a.client(connectionID)
	if err != nil {
		return nil, err
	}

	return state.listInformationSchemaTables(ctx, schema)
}

func (a *Adapter) DescribeTable(ctx context.Context, connectionID string, schema string, table string) (postgres.TableDetails, error) {
	state, err := a.client(connectionID)
	if err != nil {
		return postgres.TableDetails{}, err
	}

	return state.describeInformationSchemaTable(ctx, schema, table)
}

func (a *Adapter) ListForeignKeys(ctx context.Context, connectionID string) ([]postgres.ForeignKeySummary, error) {
	_ = ctx
	_ = connectionID
	return []postgres.ForeignKeySummary{}, nil
}

func (a *Adapter) SchemaFingerprint(ctx context.Context, connectionID string) (postgres.SchemaFingerprint, error) {
	state, err := a.client(connectionID)
	if err != nil {
		return postgres.SchemaFingerprint{}, err
	}

	lines := []string{}
	schemas, err := a.ListSchemas(ctx, connectionID)
	if err != nil {
		return postgres.SchemaFingerprint{}, err
	}
	for _, schema := range schemas {
		lines = append(lines, "schema\x1f"+schema.Name)
		tables, err := state.listInformationSchemaTables(ctx, schema.Name)
		if err != nil {
			return postgres.SchemaFingerprint{}, err
		}
		for _, table := range tables {
			lines = append(lines, strings.Join([]string{"table", schema.Name, table.Name, table.Type}, "\x1f"))
		}
		columnLines, err := state.listInformationSchemaColumnFingerprintLines(ctx, schema.Name)
		if err != nil {
			return postgres.SchemaFingerprint{}, err
		}
		lines = append(lines, columnLines...)
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
		opts = append(opts, option.WithEndpoint(normalizeBigQueryEndpoint(endpoint)))
	}

	authOpts, err := bigQueryAuthOptions(ctx, strings.TrimSpace(password), endpoint)
	if err != nil {
		return nil, err
	}
	opts = append(opts, authOpts...)

	client, err := gcbigquery.NewClient(ctx, projectID, opts...)
	if err != nil {
		return nil, apperrors.New(apperrors.CodeDatabase, "could not create BigQuery client")
	}
	if location := strings.TrimSpace(profile.Username); location != "" {
		client.Location = location
	}
	return client, nil
}

func bigQueryAuthOptions(ctx context.Context, credentialsSource string, endpoint string) ([]option.ClientOption, error) {
	if !isTrustedAuthenticatedBigQueryEndpoint(endpoint) {
		if credentialsSource != "" {
			return nil, apperrors.New(apperrors.CodeValidation, "credentials can only be used with trusted BigQuery endpoints")
		}
		if usesUnauthenticatedEndpoint(endpoint) {
			return []option.ClientOption{option.WithoutAuthentication()}, nil
		}
		return nil, apperrors.New(apperrors.CodeValidation, "custom BigQuery endpoints must be unauthenticated or use a trusted Google BigQuery host")
	}

	if credentialsSource != "" {
		if looksLikeCredentialsJSON(credentialsSource) {
			return []option.ClientOption{option.WithCredentialsJSON([]byte(credentialsSource))}, nil
		}
		return []option.ClientOption{option.WithCredentialsFile(expandCredentialsFilePath(credentialsSource))}, nil
	}

	tokenSource := &gcloudTokenSource{}
	if _, err := tokenSource.Token(); err != nil {
		return nil, apperrors.New(
			apperrors.CodeDatabase,
			fmt.Sprintf("Failed to obtain a BigQuery access token from `gcloud auth login`: %v", err),
		)
	}
	return []option.ClientOption{option.WithTokenSource(tokenSource)}, nil
}

type gcloudTokenSource struct {
	mu    sync.Mutex
	token *oauth2.Token
}

func (s *gcloudTokenSource) Token() (*oauth2.Token, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.token != nil && s.token.Valid() {
		return s.token, nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	output, err := exec.CommandContext(ctx, "gcloud", "auth", "print-access-token").Output()
	if ctx.Err() != nil {
		return nil, fmt.Errorf("gcloud auth print-access-token timed out")
	}
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			message := strings.TrimSpace(string(exitErr.Stderr))
			if message != "" {
				return nil, fmt.Errorf("%s", message)
			}
		}
		return nil, err
	}

	accessToken := strings.TrimSpace(string(output))
	if accessToken == "" {
		return nil, fmt.Errorf("gcloud auth print-access-token returned an empty token")
	}
	s.token = &oauth2.Token{
		AccessToken: accessToken,
		TokenType:   "Bearer",
		Expiry:      time.Now().Add(50 * time.Minute),
	}
	return s.token, nil
}

func looksLikeCredentialsJSON(value string) bool {
	trimmed := strings.TrimSpace(value)
	return strings.HasPrefix(trimmed, "{") || strings.HasPrefix(trimmed, "[")
}

func expandCredentialsFilePath(value string) string {
	expanded := os.ExpandEnv(strings.TrimSpace(value))
	if expanded == "~" || strings.HasPrefix(expanded, "~/") {
		home, err := os.UserHomeDir()
		if err == nil && home != "" {
			if expanded == "~" {
				return home
			}
			return filepath.Join(home, strings.TrimPrefix(expanded, "~/"))
		}
	}
	return expanded
}

func normalizeBigQueryEndpoint(value string) string {
	trimmed := strings.TrimRight(strings.TrimSpace(value), "/")
	if trimmed == "" {
		return ""
	}

	parsed, err := url.Parse(trimmed)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return value
	}
	if parsed.Path == "" {
		parsed.Path = "/bigquery/v2"
	}
	return strings.TrimRight(parsed.String(), "/") + "/"
}

func isTrustedAuthenticatedBigQueryEndpoint(endpoint string) bool {
	trimmed := strings.TrimSpace(endpoint)
	if trimmed == "" {
		return true
	}

	parsed, err := url.Parse(trimmed)
	if err != nil {
		return false
	}
	if parsed.Scheme != "https" {
		return false
	}
	host := strings.ToLower(parsed.Hostname())
	return host == "bigquery.googleapis.com" ||
		strings.HasSuffix(host, "-bigquery.googleapis.com")
}

func usesUnauthenticatedEndpoint(endpoint string) bool {
	trimmed := strings.TrimSpace(endpoint)
	if trimmed == "" {
		return false
	}

	parsed, err := url.Parse(trimmed)
	if err != nil {
		return false
	}
	host := parsed.Hostname()
	if host == "" {
		return false
	}
	if parsed.Scheme == "http" {
		return true
	}
	ip := net.ParseIP(host)
	return host == "localhost" || ip != nil && ip.IsLoopback()
}

func (s *clientState) projectID() string {
	return strings.TrimSpace(s.profile.Host)
}

func (s *clientState) defaultDataset() string {
	return strings.TrimSpace(s.profile.Database)
}

func (s *clientState) listInformationSchemaTables(ctx context.Context, schema string) ([]postgres.TableSummary, error) {
	projectID, err := quoteBigQueryIdentifier(s.projectID())
	if err != nil {
		return nil, err
	}
	datasetID, err := quoteBigQueryIdentifier(schema)
	if err != nil {
		return nil, err
	}

	q := s.client.Query(fmt.Sprintf(
		"SELECT table_name, table_type FROM %s.%s.INFORMATION_SCHEMA.TABLES ORDER BY table_name",
		projectID,
		datasetID,
	))
	q.UseLegacySQL = false
	it, err := q.Read(ctx)
	if err != nil {
		return nil, apperrors.New(apperrors.CodeDatabase, fmt.Sprintf("could not load BigQuery tables for dataset %q: %s", schema, sanitizeError(err)))
	}

	tables := []postgres.TableSummary{}
	for {
		var row []gcbigquery.Value
		if err := it.Next(&row); err == iterator.Done {
			break
		} else if err != nil {
			return nil, apperrors.New(apperrors.CodeDatabase, fmt.Sprintf("could not load BigQuery tables for dataset %q: %s", schema, sanitizeError(err)))
		}
		name, _ := rowString(row, 0)
		if name == "" {
			continue
		}
		tableType, _ := rowString(row, 1)
		tables = append(tables, postgres.TableSummary{
			Schema: schema,
			Name:   name,
			Type:   normalizeInformationSchemaTableType(tableType),
		})
	}
	return tables, nil
}

func (s *clientState) listInformationSchemaColumnFingerprintLines(ctx context.Context, schema string) ([]string, error) {
	projectID, err := quoteBigQueryIdentifier(s.projectID())
	if err != nil {
		return nil, err
	}
	datasetID, err := quoteBigQueryIdentifier(schema)
	if err != nil {
		return nil, err
	}

	q := s.client.Query(fmt.Sprintf(
		"SELECT table_name, ordinal_position, column_name, data_type, is_nullable FROM %s.%s.INFORMATION_SCHEMA.COLUMNS ORDER BY table_name, ordinal_position",
		projectID,
		datasetID,
	))
	q.UseLegacySQL = false
	it, err := q.Read(ctx)
	if err != nil {
		return nil, apperrors.New(apperrors.CodeDatabase, fmt.Sprintf("could not fingerprint BigQuery columns for dataset %q: %s", schema, sanitizeError(err)))
	}

	lines := []string{}
	for {
		var row []gcbigquery.Value
		if err := it.Next(&row); err == iterator.Done {
			break
		} else if err != nil {
			return nil, apperrors.New(apperrors.CodeDatabase, fmt.Sprintf("could not fingerprint BigQuery columns for dataset %q: %s", schema, sanitizeError(err)))
		}
		tableName, _ := rowString(row, 0)
		position, _ := rowString(row, 1)
		columnName, _ := rowString(row, 2)
		dataType, _ := rowString(row, 3)
		isNullable, _ := rowString(row, 4)
		if tableName == "" || columnName == "" {
			continue
		}
		lines = append(lines, strings.Join([]string{
			"column",
			schema,
			tableName,
			position,
			columnName,
			dataType,
			isNullable,
		}, "\x1f"))
	}
	return lines, nil
}

func (s *clientState) describeInformationSchemaTable(ctx context.Context, schema string, table string) (postgres.TableDetails, error) {
	projectID, err := quoteBigQueryIdentifier(s.projectID())
	if err != nil {
		return postgres.TableDetails{}, err
	}
	datasetID, err := quoteBigQueryIdentifier(schema)
	if err != nil {
		return postgres.TableDetails{}, err
	}

	q := s.client.Query(fmt.Sprintf(
		"SELECT column_name, data_type, is_nullable FROM %s.%s.INFORMATION_SCHEMA.COLUMNS WHERE table_name = @table_name ORDER BY ordinal_position",
		projectID,
		datasetID,
	))
	q.UseLegacySQL = false
	q.Parameters = []gcbigquery.QueryParameter{{Name: "table_name", Value: table}}
	it, err := q.Read(ctx)
	if err != nil {
		return postgres.TableDetails{}, apperrors.New(apperrors.CodeDatabase, fmt.Sprintf("could not read BigQuery table metadata for %q.%q: %s", schema, table, sanitizeError(err)))
	}

	columns := []postgres.ColumnSummary{}
	for {
		var row []gcbigquery.Value
		if err := it.Next(&row); err == iterator.Done {
			break
		} else if err != nil {
			return postgres.TableDetails{}, apperrors.New(apperrors.CodeDatabase, fmt.Sprintf("could not read BigQuery table metadata for %q.%q: %s", schema, table, sanitizeError(err)))
		}
		name, _ := rowString(row, 0)
		if name == "" {
			continue
		}
		dataType, _ := rowString(row, 1)
		isNullable, _ := rowString(row, 2)
		columns = append(columns, postgres.ColumnSummary{
			Name:      name,
			DataType:  dataType,
			Nullable:  !strings.EqualFold(isNullable, "NO"),
			Position:  len(columns) + 1,
			IsPrimary: false,
		})
	}

	return postgres.TableDetails{
		Schema:      schema,
		Name:        table,
		Type:        "TABLE",
		Columns:     columns,
		Indexes:     []postgres.IndexSummary{},
		Constraints: []postgres.ConstraintSummary{},
	}, nil
}

func quoteBigQueryIdentifier(value string) (string, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return "", apperrors.New(apperrors.CodeValidation, "BigQuery identifier is required")
	}
	if strings.Contains(trimmed, "`") {
		return "", apperrors.New(apperrors.CodeValidation, "BigQuery identifier cannot contain backticks")
	}
	return "`" + trimmed + "`", nil
}

func rowString(row []gcbigquery.Value, index int) (string, bool) {
	if index < 0 || index >= len(row) || row[index] == nil {
		return "", false
	}
	switch value := row[index].(type) {
	case string:
		return value, true
	case []byte:
		return string(value), true
	default:
		return fmt.Sprint(value), true
	}
}

func normalizeInformationSchemaTableType(value string) string {
	normalized := strings.ToUpper(strings.TrimSpace(value))
	if normalized == "" {
		return "TABLE"
	}
	return normalized
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
