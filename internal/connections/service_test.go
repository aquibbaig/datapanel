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
