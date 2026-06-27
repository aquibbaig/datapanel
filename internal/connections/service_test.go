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

func TestConnectUsesSavedBigQuerySecretWhenPresent(t *testing.T) {
	profile := ConnectionProfile{
		ID:       "local-bq",
		Driver:   "bigquery",
		Name:     "Local BigQuery",
		Host:     "local-project",
		Database: "analytics",
	}
	secrets := NewMemorySecretStore()
	if err := secrets.Save(context.Background(), profile.ID, "/Users/me/key.json"); err != nil {
		t.Fatalf("save secret: %v", err)
	}
	connector := &fakeConnector{}
	service := NewService(
		fakeProfileStore{profile: profile},
		secrets,
		connector,
	)

	status, err := service.Connect(ConnectRequest{ProfileID: profile.ID})
	if err != nil {
		t.Fatalf("expected saved BigQuery credentials to connect: %v", err)
	}
	if !status.Connected {
		t.Fatal("expected connected status")
	}
	if connector.password != "/Users/me/key.json" {
		t.Fatalf("expected saved credentials path, got %q", connector.password)
	}
}

func TestTestConnectionDoesNotUseSavedSecret(t *testing.T) {
	profile := ConnectionProfile{
		ID:       "postgres-prod",
		Driver:   "postgres",
		Name:     "Production",
		Host:     "db.example.com",
		Port:     5432,
		Database: "app",
		Username: "postgres",
		SSLMode:  "prefer",
	}
	secrets := NewMemorySecretStore()
	if err := secrets.Save(context.Background(), profile.ID, "saved-password"); err != nil {
		t.Fatalf("save secret: %v", err)
	}
	connector := &fakeConnector{}
	service := NewService(
		fakeProfileStore{profile: profile},
		secrets,
		connector,
	)

	status, err := service.TestConnection(TestConnectionRequest{
		ProfileID: profile.ID,
		Driver:    profile.Driver,
		Name:      profile.Name,
		Host:      profile.Host,
		Port:      profile.Port,
		Database:  profile.Database,
		Username:  profile.Username,
		SSLMode:   profile.SSLMode,
	})
	if err != nil {
		t.Fatalf("expected test connection to succeed: %v", err)
	}
	if !status.Connected {
		t.Fatal("expected connected status")
	}
	if connector.testPassword != "" {
		t.Fatalf("expected saved password not to be used for tests, got %q", connector.testPassword)
	}
}

func TestSaveConnectionClearsBlankBigQuerySecret(t *testing.T) {
	profile := ConnectionProfile{
		ID:     "local-bq",
		Driver: "bigquery",
		Name:   "Local BigQuery",
		Host:   "local-project",
	}
	secrets := NewMemorySecretStore()
	if err := secrets.Save(context.Background(), profile.ID, "/Users/me/key.json"); err != nil {
		t.Fatalf("save secret: %v", err)
	}
	service := NewService(
		fakeProfileStore{profile: profile},
		secrets,
		&fakeConnector{},
	)

	if _, err := service.SaveConnection(SaveConnectionRequest{
		ID:     profile.ID,
		Driver: "bigquery",
		Name:   profile.Name,
		Host:   profile.Host,
	}); err != nil {
		t.Fatalf("save connection: %v", err)
	}
	if _, err := secrets.Get(context.Background(), profile.ID); err == nil {
		t.Fatal("expected blank BigQuery credentials to clear saved secret")
	}
}

func TestSaveConnectionDeletesSavedSecretWhenScopeChangesWithoutPassword(t *testing.T) {
	profile := ConnectionProfile{
		ID:       "postgres-prod",
		Driver:   "postgres",
		Name:     "Production",
		Host:     "db.example.com",
		Port:     5432,
		Database: "app",
		Username: "postgres",
		SSLMode:  "prefer",
	}
	secrets := NewMemorySecretStore()
	if err := secrets.Save(context.Background(), profile.ID, "saved-password"); err != nil {
		t.Fatalf("save secret: %v", err)
	}
	service := NewService(
		fakeProfileStore{profile: profile},
		secrets,
		&fakeConnector{},
	)

	if _, err := service.SaveConnection(SaveConnectionRequest{
		ID:       profile.ID,
		Driver:   profile.Driver,
		Name:     profile.Name,
		Host:     "attacker.example.com",
		Port:     profile.Port,
		Database: profile.Database,
		Username: profile.Username,
		SSLMode:  profile.SSLMode,
	}); err != nil {
		t.Fatalf("save connection: %v", err)
	}
	if _, err := secrets.Get(context.Background(), profile.ID); err == nil {
		t.Fatal("expected retargeted profile to clear saved secret")
	}
}

func TestSaveConnectionKeepsSavedSecretWhenOnlyMetadataChanges(t *testing.T) {
	profile := ConnectionProfile{
		ID:       "postgres-prod",
		Driver:   "postgres",
		Name:     "Production",
		Host:     "db.example.com",
		Port:     5432,
		Database: "app",
		Username: "postgres",
		SSLMode:  "prefer",
	}
	secrets := NewMemorySecretStore()
	if err := secrets.Save(context.Background(), profile.ID, "saved-password"); err != nil {
		t.Fatalf("save secret: %v", err)
	}
	service := NewService(
		fakeProfileStore{profile: profile},
		secrets,
		&fakeConnector{},
	)

	if _, err := service.SaveConnection(SaveConnectionRequest{
		ID:       profile.ID,
		Driver:   profile.Driver,
		Name:     "Renamed Production",
		Host:     profile.Host,
		Port:     profile.Port,
		Database: profile.Database,
		Username: profile.Username,
		SSLMode:  profile.SSLMode,
		Color:    "#22c55e",
	}); err != nil {
		t.Fatalf("save connection: %v", err)
	}
	password, err := secrets.Get(context.Background(), profile.ID)
	if err != nil {
		t.Fatalf("expected saved secret to remain: %v", err)
	}
	if password != "saved-password" {
		t.Fatalf("expected saved password to remain, got %q", password)
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
	password     string
	testPassword string
}

func (c *fakeConnector) Test(ctx context.Context, profile ConnectionProfile, password string) error {
	c.testPassword = password
	return nil
}

func (c *fakeConnector) Connect(ctx context.Context, profile ConnectionProfile, password string) error {
	c.password = password
	return nil
}

func (c *fakeConnector) Disconnect(ctx context.Context, profileID string) error {
	return nil
}
