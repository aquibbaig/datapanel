package appdata

import (
	"path/filepath"
	"testing"

	"datapanel/internal/ai"
	"datapanel/internal/postgres"
)

func TestAIChatMessagesRoundTrip(t *testing.T) {
	service, err := NewService(filepath.Join(t.TempDir(), "datapanel.sqlite3"))
	if err != nil {
		t.Fatalf("NewService returned error: %v", err)
	}
	defer service.CloseAll()

	thread, err := service.CreateAIChatThread(CreateAIChatThreadRequest{
		ConnectionID: "profile-1",
		Title:        "Orders",
		Provider:     "openai",
		Model:        "gpt-5.5",
	})
	if err != nil {
		t.Fatalf("CreateAIChatThread returned error: %v", err)
	}

	user, err := service.SaveAIChatMessage(SaveAIChatMessageRequest{
		ThreadID:     thread.ID,
		ConnectionID: "profile-1",
		Provider:     "openai",
		Model:        "gpt-5.5",
		Role:         "user",
		Content:      "show recent orders",
	})
	if err != nil {
		t.Fatalf("SaveAIChatMessage user returned error: %v", err)
	}
	if user.ID == "" || user.CreatedAt == "" {
		t.Fatalf("expected generated id and timestamp: %#v", user)
	}

	assistant, err := service.SaveAIChatMessage(SaveAIChatMessageRequest{
		ThreadID:     thread.ID,
		ConnectionID: "profile-1",
		Provider:     "openai",
		Model:        "gpt-5.5",
		Role:         "assistant",
		Content:      "Here is a query.",
		Response: &ai.GenerateResponse{
			Answer:      "Here is a query.",
			SQL:         "select * from orders limit 20;",
			Assumptions: []string{"orders exists"},
			TokenUsage: ai.TokenUsage{
				PromptTokens:     120,
				CompletionTokens: 30,
				TotalTokens:      150,
			},
		},
	})
	if err != nil {
		t.Fatalf("SaveAIChatMessage assistant returned error: %v", err)
	}
	_, err = service.SaveAIChatMessage(SaveAIChatMessageRequest{
		ID:           assistant.ID,
		ThreadID:     thread.ID,
		ConnectionID: "profile-1",
		Provider:     "openai",
		Model:        "gpt-5.5",
		Role:         "assistant",
		Content:      "Here is a query with extra notes.",
		Response: &ai.GenerateResponse{
			Answer:      "Here is a query with extra notes.",
			SQL:         "select * from orders limit 20;",
			Assumptions: []string{"orders exists"},
			TokenUsage: ai.TokenUsage{
				PromptTokens:     130,
				CompletionTokens: 35,
				TotalTokens:      165,
			},
		},
		CreatedAt: assistant.CreatedAt,
	})
	if err != nil {
		t.Fatalf("SaveAIChatMessage assistant update returned error: %v", err)
	}

	messages, err := service.ListAIChatMessages(ListAIChatMessagesRequest{
		ThreadID: thread.ID,
		Limit:    10,
	})
	if err != nil {
		t.Fatalf("ListAIChatMessages returned error: %v", err)
	}
	if len(messages) != 2 {
		t.Fatalf("expected two messages, got %d", len(messages))
	}
	if messages[0].Role != "user" || messages[1].Role != "assistant" {
		t.Fatalf("messages were not returned in chronological order: %#v", messages)
	}
	if messages[1].Response == nil || messages[1].Response.SQL == "" {
		t.Fatalf("expected assistant response to round trip: %#v", messages[1])
	}
	if messages[1].Response.TokenUsage.TotalTokens != 165 {
		t.Fatalf("expected response token usage to round trip: %#v", messages[1].Response.TokenUsage)
	}

	threads, err := service.ListAIChatThreads(ListAIChatThreadsRequest{ConnectionID: "profile-1"})
	if err != nil {
		t.Fatalf("ListAIChatThreads returned error: %v", err)
	}
	if len(threads) != 1 {
		t.Fatalf("expected one thread, got %d", len(threads))
	}
	if threads[0].PromptTokens != 130 || threads[0].CompletionTokens != 35 || threads[0].TotalTokens != 165 {
		t.Fatalf("expected thread token totals to update, got %#v", threads[0])
	}
	if threads[0].TokenUsage.TotalTokens != 165 {
		t.Fatalf("expected nested token usage to match totals, got %#v", threads[0].TokenUsage)
	}
}

func TestClearAIChatMessagesUsesThreadScope(t *testing.T) {
	service, err := NewService(filepath.Join(t.TempDir(), "datapanel.sqlite3"))
	if err != nil {
		t.Fatalf("NewService returned error: %v", err)
	}
	defer service.CloseAll()

	var threadIDs []string
	for _, title := range []string{"first", "second"} {
		thread, err := service.CreateAIChatThread(CreateAIChatThreadRequest{
			ConnectionID: "profile-1",
			Title:        title,
		})
		if err != nil {
			t.Fatalf("CreateAIChatThread returned error: %v", err)
		}
		threadIDs = append(threadIDs, thread.ID)
		if _, err := service.SaveAIChatMessage(SaveAIChatMessageRequest{
			ThreadID:     thread.ID,
			ConnectionID: "profile-1",
			Role:         "user",
			Content:      "hello",
		}); err != nil {
			t.Fatalf("SaveAIChatMessage returned error: %v", err)
		}
	}

	if err := service.ClearAIChatMessages(ClearAIChatMessagesRequest{ThreadID: threadIDs[0]}); err != nil {
		t.Fatalf("ClearAIChatMessages returned error: %v", err)
	}

	messages, err := service.ListAIChatMessages(ListAIChatMessagesRequest{ThreadID: threadIDs[0]})
	if err != nil {
		t.Fatalf("ListAIChatMessages returned error: %v", err)
	}
	if len(messages) != 0 {
		t.Fatalf("expected first thread messages to be cleared, got %d", len(messages))
	}

	messages, err = service.ListAIChatMessages(ListAIChatMessagesRequest{ThreadID: threadIDs[1]})
	if err != nil {
		t.Fatalf("ListAIChatMessages returned error: %v", err)
	}
	if len(messages) != 1 {
		t.Fatalf("expected second thread message to remain, got %d", len(messages))
	}
}

func TestQueryHistoryRoundTripAndDedupe(t *testing.T) {
	service, err := NewService(filepath.Join(t.TempDir(), "datapanel.sqlite3"))
	if err != nil {
		t.Fatalf("NewService returned error: %v", err)
	}
	defer service.CloseAll()

	first, err := service.SaveQueryHistory(SaveQueryHistoryRequest{
		ConnectionID: "profile-1",
		SQL:          "select 1;",
		Mode:         "query",
		DurationMS:   12,
		ExecutedAt:   "2026-01-01T00:00:00Z",
		Success:      true,
		RowCount:     1,
	})
	if err != nil {
		t.Fatalf("SaveQueryHistory first returned error: %v", err)
	}
	if first.ID == "" {
		t.Fatalf("expected generated id")
	}

	_, err = service.SaveQueryHistory(SaveQueryHistoryRequest{
		ConnectionID: "profile-1",
		SQL:          "select 1;",
		Mode:         "explain",
		DurationMS:   18,
		ExecutedAt:   "2026-01-01T00:01:00Z",
		Success:      false,
		Error:        "failed",
	})
	if err != nil {
		t.Fatalf("SaveQueryHistory duplicate returned error: %v", err)
	}

	items, err := service.ListQueryHistory(ListQueryHistoryRequest{
		ConnectionID: "profile-1",
		Limit:        10,
	})
	if err != nil {
		t.Fatalf("ListQueryHistory returned error: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("expected deduped history, got %d items", len(items))
	}
	if items[0].Mode != "explain" || items[0].Success || items[0].Error != "failed" {
		t.Fatalf("unexpected history item: %#v", items[0])
	}
}

func TestQueryWorkspaceDraftsRoundTripPerConnection(t *testing.T) {
	service, err := NewService(filepath.Join(t.TempDir(), "datapanel.sqlite3"))
	if err != nil {
		t.Fatalf("NewService returned error: %v", err)
	}
	defer service.CloseAll()

	saved, err := service.SaveQueryWorkspaceDrafts(SaveQueryWorkspaceDraftsRequest{
		ConnectionID:      "profile-1",
		ActiveWorkspaceID: "query-2",
		Workspaces: []QueryWorkspaceDraft{
			{ID: "query-1", Title: "Scratch", SQL: "select 1;"},
			{ID: "query-2", Title: "Report", SQL: "select * from reports;"},
		},
	})
	if err != nil {
		t.Fatalf("SaveQueryWorkspaceDrafts returned error: %v", err)
	}
	if saved.UpdatedAt == "" {
		t.Fatalf("expected updated timestamp")
	}

	got, err := service.GetQueryWorkspaceDrafts(GetQueryWorkspaceDraftsRequest{
		ConnectionID: "profile-1",
	})
	if err != nil {
		t.Fatalf("GetQueryWorkspaceDrafts returned error: %v", err)
	}
	if got.ActiveWorkspaceID != "query-2" || len(got.Workspaces) != 2 {
		t.Fatalf("unexpected draft state: %#v", got)
	}
	if got.Workspaces[1].SQL != "select * from reports;" {
		t.Fatalf("unexpected SQL: %q", got.Workspaces[1].SQL)
	}

	empty, err := service.GetQueryWorkspaceDrafts(GetQueryWorkspaceDraftsRequest{
		ConnectionID: "profile-2",
	})
	if err != nil {
		t.Fatalf("GetQueryWorkspaceDrafts empty returned error: %v", err)
	}
	if empty.ConnectionID != "profile-2" || len(empty.Workspaces) != 0 {
		t.Fatalf("expected empty state for separate connection, got %#v", empty)
	}
}

func TestSchemaSnapshotRoundTripPerConnection(t *testing.T) {
	service, err := NewService(filepath.Join(t.TempDir(), "datapanel.sqlite3"))
	if err != nil {
		t.Fatalf("NewService returned error: %v", err)
	}
	defer service.CloseAll()

	_, err = service.SaveSchemaSnapshot(SaveSchemaSnapshotRequest{
		ConnectionID: "profile-1",
		Fingerprint:  "abc123",
		Schemas: []postgres.SchemaSummary{
			{Name: "public"},
		},
		TablesBySchema: map[string][]postgres.TableSummary{
			"public": {
				{Schema: "public", Name: "users", Type: "BASE TABLE", RowEstimate: 12},
			},
		},
	})
	if err != nil {
		t.Fatalf("SaveSchemaSnapshot returned error: %v", err)
	}

	got, err := service.GetSchemaSnapshot(GetSchemaSnapshotRequest{
		ConnectionID: "profile-1",
	})
	if err != nil {
		t.Fatalf("GetSchemaSnapshot returned error: %v", err)
	}
	if got.Fingerprint != "abc123" || len(got.Schemas) != 1 || len(got.TablesBySchema["public"]) != 1 {
		t.Fatalf("unexpected snapshot: %#v", got)
	}

	empty, err := service.GetSchemaSnapshot(GetSchemaSnapshotRequest{
		ConnectionID: "profile-2",
	})
	if err != nil {
		t.Fatalf("GetSchemaSnapshot empty returned error: %v", err)
	}
	if empty.ConnectionID != "profile-2" || len(empty.Schemas) != 0 || len(empty.TablesBySchema) != 0 {
		t.Fatalf("expected empty snapshot for separate connection, got %#v", empty)
	}
}
