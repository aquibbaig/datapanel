package connections

import "testing"

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
