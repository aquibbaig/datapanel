package appdata

import (
	"path/filepath"
	"testing"

	"datapanel/internal/ai"
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
		Model:        "gpt-4.1-mini",
	})
	if err != nil {
		t.Fatalf("CreateAIChatThread returned error: %v", err)
	}

	user, err := service.SaveAIChatMessage(SaveAIChatMessageRequest{
		ThreadID:     thread.ID,
		ConnectionID: "profile-1",
		Provider:     "openai",
		Model:        "gpt-4.1-mini",
		Role:         "user",
		Content:      "show recent orders",
	})
	if err != nil {
		t.Fatalf("SaveAIChatMessage user returned error: %v", err)
	}
	if user.ID == "" || user.CreatedAt == "" {
		t.Fatalf("expected generated id and timestamp: %#v", user)
	}

	_, err = service.SaveAIChatMessage(SaveAIChatMessageRequest{
		ThreadID:     thread.ID,
		ConnectionID: "profile-1",
		Provider:     "openai",
		Model:        "gpt-4.1-mini",
		Role:         "assistant",
		Content:      "Here is a query.",
		Response: &ai.GenerateResponse{
			Answer:      "Here is a query.",
			SQL:         "select * from orders limit 20;",
			Assumptions: []string{"orders exists"},
		},
	})
	if err != nil {
		t.Fatalf("SaveAIChatMessage assistant returned error: %v", err)
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
