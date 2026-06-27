package bigquery

import (
	"context"
	"datapanel/internal/connections"
	"os"
	"path/filepath"
	"testing"
)

func TestLooksLikeCredentialsJSON(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want bool
	}{
		{name: "object", in: `{"type":"service_account"}`, want: true},
		{name: "array", in: `[{"type":"service_account"}]`, want: true},
		{name: "path", in: "/Users/me/key.json", want: false},
		{name: "empty", in: " ", want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := looksLikeCredentialsJSON(tt.in); got != tt.want {
				t.Fatalf("looksLikeCredentialsJSON(%q) = %t, want %t", tt.in, got, tt.want)
			}
		})
	}
}

func TestExpandCredentialsFilePath(t *testing.T) {
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		t.Skip("home directory unavailable")
	}
	t.Setenv("DATAPANEL_BQ_KEY", filepath.Join(home, "keys", "bq.json"))

	tests := []struct {
		name string
		in   string
		want string
	}{
		{name: "tilde", in: "~/.config/gcloud/application_default_credentials.json", want: filepath.Join(home, ".config", "gcloud", "application_default_credentials.json")},
		{name: "home only", in: "~", want: home},
		{name: "environment variable", in: "$DATAPANEL_BQ_KEY", want: filepath.Join(home, "keys", "bq.json")},
		{name: "absolute path", in: "/tmp/key.json", want: "/tmp/key.json"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := expandCredentialsFilePath(tt.in); got != tt.want {
				t.Fatalf("expandCredentialsFilePath(%q) = %q, want %q", tt.in, got, tt.want)
			}
		})
	}
}

func TestNormalizeBigQueryEndpoint(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		{name: "google host", in: "https://bigquery.googleapis.com", want: "https://bigquery.googleapis.com/bigquery/v2/"},
		{name: "google host trailing slash", in: "https://bigquery.googleapis.com/", want: "https://bigquery.googleapis.com/bigquery/v2/"},
		{name: "explicit base path", in: "https://bigquery.googleapis.com/bigquery/v2", want: "https://bigquery.googleapis.com/bigquery/v2/"},
		{name: "local host", in: "http://localhost:9050", want: "http://localhost:9050/bigquery/v2/"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := normalizeBigQueryEndpoint(tt.in); got != tt.want {
				t.Fatalf("normalizeBigQueryEndpoint(%q) = %q, want %q", tt.in, got, tt.want)
			}
		})
	}
}

func TestClientStateDefaultDataset(t *testing.T) {
	state := clientState{
		profile: connections.ConnectionProfile{
			Database: " analytics ",
		},
	}
	if got := state.defaultDataset(); got != "analytics" {
		t.Fatalf("defaultDataset() = %q, want %q", got, "analytics")
	}
}

func TestQuoteBigQueryIdentifier(t *testing.T) {
	got, err := quoteBigQueryIdentifier("coderabbitprod")
	if err != nil {
		t.Fatalf("quoteBigQueryIdentifier returned error: %v", err)
	}
	if got != "`coderabbitprod`" {
		t.Fatalf("quoteBigQueryIdentifier() = %q, want %q", got, "`coderabbitprod`")
	}
	if _, err := quoteBigQueryIdentifier("bad`dataset"); err == nil {
		t.Fatal("expected backtick validation error")
	}
}

func TestNormalizeInformationSchemaTableType(t *testing.T) {
	if got := normalizeInformationSchemaTableType("base table"); got != "BASE TABLE" {
		t.Fatalf("normalizeInformationSchemaTableType() = %q", got)
	}
	if got := normalizeInformationSchemaTableType(""); got != "TABLE" {
		t.Fatalf("normalizeInformationSchemaTableType(empty) = %q", got)
	}
}

func TestUsesUnauthenticatedEndpoint(t *testing.T) {
	tests := []struct {
		name     string
		endpoint string
		want     bool
	}{
		{name: "blank", endpoint: "", want: false},
		{name: "google default", endpoint: "https://bigquery.googleapis.com", want: false},
		{name: "google regional", endpoint: "https://us-bigquery.googleapis.com", want: false},
		{name: "local http", endpoint: "http://localhost:9050", want: true},
		{name: "loopback ip http", endpoint: "http://127.0.0.1:9050", want: true},
		{name: "loopback ip https", endpoint: "https://127.0.0.1:9050", want: true},
		{name: "nonlocal http", endpoint: "http://bigquery.googleapis.com", want: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := usesUnauthenticatedEndpoint(tt.endpoint); got != tt.want {
				t.Fatalf("usesUnauthenticatedEndpoint(%q) = %t, want %t", tt.endpoint, got, tt.want)
			}
		})
	}
}

func TestIsTrustedAuthenticatedBigQueryEndpoint(t *testing.T) {
	tests := []struct {
		name     string
		endpoint string
		want     bool
	}{
		{name: "blank default", endpoint: "", want: true},
		{name: "google default", endpoint: "https://bigquery.googleapis.com", want: true},
		{name: "google regional", endpoint: "https://us-bigquery.googleapis.com", want: true},
		{name: "http google", endpoint: "http://bigquery.googleapis.com", want: false},
		{name: "lookalike", endpoint: "https://evil-bigquery.googleapis.com.evil.test", want: false},
		{name: "localhost", endpoint: "http://localhost:9050", want: false},
		{name: "custom https", endpoint: "https://bigquery.example.com", want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := isTrustedAuthenticatedBigQueryEndpoint(tt.endpoint); got != tt.want {
				t.Fatalf("isTrustedAuthenticatedBigQueryEndpoint(%q) = %t, want %t", tt.endpoint, got, tt.want)
			}
		})
	}
}

func TestBigQueryAuthOptionsRejectCredentialsForUntrustedEndpoint(t *testing.T) {
	_, err := bigQueryAuthOptions(context.Background(), `{"type":"service_account"}`, "https://bigquery.example.com")
	if err == nil {
		t.Fatal("expected custom endpoint with credentials to be rejected")
	}
}

func TestBigQueryAuthOptionsAllowsUnauthenticatedLocalEndpoint(t *testing.T) {
	if _, err := bigQueryAuthOptions(context.Background(), "", "http://localhost:9050"); err != nil {
		t.Fatalf("expected local unauthenticated endpoint to be allowed: %v", err)
	}
}

func TestIntegrationGcloudAuthListSchemas(t *testing.T) {
	projectID := os.Getenv("DATAPANEL_BIGQUERY_INTEGRATION_PROJECT")
	if projectID == "" {
		t.Skip("set DATAPANEL_BIGQUERY_INTEGRATION_PROJECT to run")
	}

	adapter := NewAdapter()
	profile := connections.ConnectionProfile{
		ID:       "integration-bigquery",
		Driver:   "bigquery",
		Name:     "Integration BigQuery",
		Host:     projectID,
		Endpoint: "https://bigquery.googleapis.com",
	}

	if err := adapter.Connect(context.Background(), profile, ""); err != nil {
		t.Fatalf("Connect() returned error: %v", err)
	}
	defer func() {
		if err := adapter.Disconnect(context.Background(), profile.ID); err != nil {
			t.Fatalf("Disconnect() returned error: %v", err)
		}
	}()

	schemas, err := adapter.ListSchemas(context.Background(), profile.ID)
	if err != nil {
		t.Fatalf("ListSchemas() returned error: %v", err)
	}
	if len(schemas) == 0 {
		t.Fatal("expected at least one BigQuery dataset")
	}
}
