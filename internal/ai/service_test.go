package ai

import (
	"context"
	"strings"
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

func TestProviderHTTPErrorIncludesStatusAndPlainBody(t *testing.T) {
	err := providerHTTPError(429, []byte("rate limit exceeded"))
	if err == nil {
		t.Fatal("expected error")
	}
	for _, expected := range []string{"429 Too Many Requests", "rate limit exceeded"} {
		if !strings.Contains(err.Error(), expected) {
			t.Fatalf("expected error to contain %q, got %q", expected, err.Error())
		}
	}
}

func TestOpenAIChatPayloadOmitsTemperature(t *testing.T) {
	payload := openAIChatPayload("gpt-5.4", "system", "user")
	if _, ok := payload["temperature"]; ok {
		t.Fatal("expected OpenAI payload to omit temperature")
	}
	responseFormat, ok := payload["response_format"].(map[string]string)
	if !ok || responseFormat["type"] != "json_object" {
		t.Fatalf("expected JSON response format, got %#v", payload["response_format"])
	}
}

func TestPlanUserMessageIncludesConversationContext(t *testing.T) {
	message := planUserMessage(PlanRequest{
		TableContext: "public.subscribers",
		Conversation: []ChatTurn{
			{Role: "user", Content: "Can you get me a list of subscribers max 100"},
			{Role: "assistant", Content: "SQL:\nSELECT * FROM public.subscribers LIMIT 100;"},
			{Role: "system", Content: "ignored"},
		},
	}, "max 500")

	for _, expected := range []string{
		"Available database tables:\npublic.subscribers",
		"Recent conversation JSON, oldest to newest:",
		`"role": "user"`,
		`"content": "Can you get me a list of subscribers max 100"`,
		`"role": "assistant"`,
		`"content": "SQL:\nSELECT * FROM public.subscribers LIMIT 100;"`,
		"Current user request:\nmax 500",
	} {
		if !strings.Contains(message, expected) {
			t.Fatalf("expected plan message to contain %q, got:\n%s", expected, message)
		}
	}
	if strings.Contains(message, "ignored") {
		t.Fatalf("expected invalid conversation roles to be omitted, got:\n%s", message)
	}
}

func TestGenerateUserMessageIncludesPriorAssistantSQL(t *testing.T) {
	message := generateUserMessage(GenerateRequest{
		SchemaContext: "CREATE TABLE public.subscribers (id bigint);",
		Conversation: []ChatTurn{
			{Role: "assistant", Content: "SQL:\nSELECT * FROM public.subscribers LIMIT 100;"},
		},
	}, "make it max 500")

	for _, expected := range []string{
		"Database schema context:\nCREATE TABLE public.subscribers (id bigint);",
		"Recent conversation JSON, oldest to newest:",
		`"role": "assistant"`,
		`"content": "SQL:\nSELECT * FROM public.subscribers LIMIT 100;"`,
		"Current user request:\nmake it max 500",
	} {
		if !strings.Contains(message, expected) {
			t.Fatalf("expected generate message to contain %q, got:\n%s", expected, message)
		}
	}
}

func TestNormalizeConversationKeepsRecentBoundedTurns(t *testing.T) {
	turns := make([]ChatTurn, 0, maxConversationTurns+2)
	for i := 0; i < maxConversationTurns+2; i++ {
		turns = append(turns, ChatTurn{Role: "user", Content: "turn " + string(rune('a'+i))})
	}

	normalized := normalizeConversation(turns)
	if len(normalized) != maxConversationTurns {
		t.Fatalf("expected %d turns, got %d", maxConversationTurns, len(normalized))
	}
	if normalized[0].Content != "turn c" {
		t.Fatalf("expected oldest retained turn to be turn c, got %q", normalized[0].Content)
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
