package ai

import (
	"context"
	"testing"

	"datapanel/internal/connections"
)

func TestSaveCredentialReturnsOnlyRedactedStatus(t *testing.T) {
	store := connections.NewMemorySecretStore()
	service := NewService(store, "session")

	status, err := service.SaveCredential(SaveCredentialRequest{
		Provider: "openai",
		Token:    "test-secret-value",
		Label:    "Local dev",
	})
	if err != nil {
		t.Fatalf("SaveCredential returned error: %v", err)
	}

	if !status.Connected {
		t.Fatalf("expected connected status")
	}
	if status.KeyHint != "....alue" {
		t.Fatalf("unexpected key hint: %q", status.KeyHint)
	}
	if status.Label != "Local dev" {
		t.Fatalf("unexpected label: %q", status.Label)
	}

	raw, err := store.Get(context.Background(), "ai:openai")
	if err != nil {
		t.Fatalf("credential was not written to key store: %v", err)
	}
	if raw == "test-secret-value" {
		t.Fatalf("expected serialized keychain payload, got raw token")
	}
}

func TestDeleteCredentialClearsStatus(t *testing.T) {
	store := connections.NewMemorySecretStore()
	service := NewService(store, "session")

	if _, err := service.SaveCredential(SaveCredentialRequest{
		Provider: "anthropic",
		Token:    "test-anthropic-secret",
	}); err != nil {
		t.Fatalf("SaveCredential returned error: %v", err)
	}
	if err := service.DeleteCredential("anthropic"); err != nil {
		t.Fatalf("DeleteCredential returned error: %v", err)
	}

	status, err := service.GetCredentialStatus("anthropic")
	if err != nil {
		t.Fatalf("GetCredentialStatus returned error: %v", err)
	}
	if status.Connected {
		t.Fatalf("expected disconnected status")
	}
}
