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

func TestParsePlanResponseNormalizesTables(t *testing.T) {
	plan, err := parsePlanResponse(`{
		"needsClarification": false,
		"question": "",
		"tables": [
			{"schema": " public ", "name": " pr_comment_metrics ", "confidence": 1.2, "reason": "requested table"},
			{"schema": "public", "name": "pr_comment_metrics", "confidence": 0.9, "reason": "duplicate"},
			{"schema": "", "name": "ignored", "confidence": 0.5, "reason": ""}
		],
		"assumptions": null
	}`)
	if err != nil {
		t.Fatalf("parsePlanResponse returned error: %v", err)
	}
	if plan.NeedsClarification {
		t.Fatalf("did not expect clarification")
	}
	if len(plan.Tables) != 1 {
		t.Fatalf("expected one normalized table, got %d", len(plan.Tables))
	}
	if plan.Tables[0].Schema != "public" || plan.Tables[0].Name != "pr_comment_metrics" {
		t.Fatalf("unexpected table: %+v", plan.Tables[0])
	}
	if plan.Tables[0].Confidence != 1 {
		t.Fatalf("expected confidence to be clamped to 1, got %f", plan.Tables[0].Confidence)
	}
	if plan.Assumptions == nil {
		t.Fatalf("expected assumptions to be normalized to an empty slice")
	}
}

func TestParsePlanResponseRequiresTableOrClarification(t *testing.T) {
	plan, err := parsePlanResponse(`{
		"needsClarification": false,
		"question": "",
		"tables": [],
		"assumptions": []
	}`)
	if err != nil {
		t.Fatalf("parsePlanResponse returned error: %v", err)
	}
	if !plan.NeedsClarification {
		t.Fatalf("expected clarification when no tables are planned")
	}
	if plan.Question == "" {
		t.Fatalf("expected fallback clarification question")
	}
}
