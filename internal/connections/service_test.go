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
