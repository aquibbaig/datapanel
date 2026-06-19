package connections

import (
	"context"
	"testing"
)

func TestProfileFromSaveInputDefaultsAndValidates(t *testing.T) {
	profile, err := profileFromSaveInput(SaveConnectionRequest{
		Name:     "Local",
		Host:     "localhost",
		Port:     5432,
		Database: "app",
		Username: "postgres",
	})
	if err != nil {
		t.Fatalf("expected valid profile: %v", err)
	}
	if profile.ID == "" {
		t.Fatal("expected generated id")
	}
	if profile.Driver != "postgres" {
		t.Fatalf("expected default driver postgres, got %q", profile.Driver)
	}
	if profile.SSLMode != "prefer" {
		t.Fatalf("expected default ssl mode prefer, got %q", profile.SSLMode)
	}
	if profile.Color == "" {
		t.Fatal("expected default color")
	}
}

func TestProfileFromSaveInputRejectsInvalidPort(t *testing.T) {
	_, err := profileFromSaveInput(SaveConnectionRequest{
		Name:     "Local",
		Host:     "localhost",
		Port:     70000,
		Database: "app",
		Username: "postgres",
	})
	if err == nil {
		t.Fatal("expected invalid port error")
	}
}

func TestProfileFromSaveInputSplitsHostPort(t *testing.T) {
	profile, err := profileFromSaveInput(SaveConnectionRequest{
		Name:     "Remote Postgres",
		Host:     "10.253.0.3:5432",
		Port:     1234,
		Database: "postgres",
		Username: "postgres",
	})
	if err != nil {
		t.Fatalf("expected valid profile: %v", err)
	}
	if profile.Host != "10.253.0.3" {
		t.Fatalf("expected host without port, got %q", profile.Host)
	}
	if profile.Port != 5432 {
		t.Fatalf("expected port from host, got %d", profile.Port)
	}
}

func TestProfileFromSaveInputSplitsBracketedIPv6HostPort(t *testing.T) {
	profile, err := profileFromSaveInput(SaveConnectionRequest{
		Name:     "IPv6 Postgres",
		Host:     "[::1]:5433",
		Port:     5432,
		Database: "postgres",
		Username: "postgres",
	})
	if err != nil {
		t.Fatalf("expected valid profile: %v", err)
	}
	if profile.Host != "::1" {
		t.Fatalf("expected unbracketed host, got %q", profile.Host)
	}
	if profile.Port != 5433 {
		t.Fatalf("expected port from host, got %d", profile.Port)
	}
}

func TestProfileFromSaveInputAcceptsMySQLDriver(t *testing.T) {
	profile, err := profileFromSaveInput(SaveConnectionRequest{
		Driver:   "mysql",
		Name:     "Local MySQL",
		Host:     "localhost",
		Port:     3306,
		Database: "app",
		Username: "root",
	})
	if err != nil {
		t.Fatalf("expected valid profile: %v", err)
	}
	if profile.Driver != "mysql" {
		t.Fatalf("expected mysql driver, got %q", profile.Driver)
	}
}

func TestProfileFromSaveInputAcceptsBigQueryDriver(t *testing.T) {
	profile, err := profileFromSaveInput(SaveConnectionRequest{
		Driver:   "bigquery",
		Name:     "Analytics Warehouse",
		Host:     "acme-data",
		Endpoint: " http://localhost:9050/ ",
	})
	if err != nil {
		t.Fatalf("expected valid profile: %v", err)
	}
	if profile.Driver != "bigquery" {
		t.Fatalf("expected bigquery driver, got %q", profile.Driver)
	}
	if profile.Host != "acme-data" {
		t.Fatalf("expected project id in host, got %q", profile.Host)
	}
	if profile.Endpoint != "http://localhost:9050" {
		t.Fatalf("expected normalized endpoint, got %q", profile.Endpoint)
	}
}

func TestProfileFromSaveInputRequiresBigQueryProjectID(t *testing.T) {
	_, err := profileFromSaveInput(SaveConnectionRequest{
		Driver: "bigquery",
		Name:   "Analytics Warehouse",
	})
	if err == nil {
		t.Fatal("expected project id validation error")
	}
}

func TestConnectAllowsBigQueryWithoutSavedSecret(t *testing.T) {
	profile := ConnectionProfile{
		ID:       "local-bq",
		Driver:   "bigquery",
		Name:     "Local BigQuery",
		Host:     "local-project",
		Database: "analytics",
		Endpoint: "http://localhost:9050",
	}
	connector := &fakeConnector{}
	service := NewService(
		fakeProfileStore{profile: profile},
		NewMemorySecretStore(),
		connector,
	)

	status, err := service.Connect(ConnectRequest{ProfileID: profile.ID})
	if err != nil {
		t.Fatalf("expected blank BigQuery credentials to connect: %v", err)
	}
	if !status.Connected {
		t.Fatal("expected connected status")
	}
	if connector.password != "" {
		t.Fatalf("expected blank password, got %q", connector.password)
	}
}

type fakeProfileStore struct {
	profile ConnectionProfile
}

func (s fakeProfileStore) List() ([]ConnectionProfile, error) {
	return []ConnectionProfile{s.profile}, nil
}

func (s fakeProfileStore) Find(id string) (ConnectionProfile, error) {
	return s.profile, nil
}

func (s fakeProfileStore) Save(profile ConnectionProfile) error {
	return nil
}

func (s fakeProfileStore) Delete(id string) error {
	return nil
}

type fakeConnector struct {
	password string
}

func (c *fakeConnector) Test(ctx context.Context, profile ConnectionProfile, password string) error {
	return nil
}

func (c *fakeConnector) Connect(ctx context.Context, profile ConnectionProfile, password string) error {
	c.password = password
	return nil
}

func (c *fakeConnector) Disconnect(ctx context.Context, profileID string) error {
	return nil
}
