package chatbot

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

const testAPIKey = "test-secret-key"

// fakeZaiServer returns a test server that captures the outgoing request and
// replies with the given raw SSE body.
func fakeZaiServer(t *testing.T, capture *http.Request, captureBody *[]byte, sseBody string, status int) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Errorf("reading request body: %v", err)
		}
		if captureBody != nil {
			*captureBody = body
		}
		if capture != nil {
			captured := *r
			captured.Body = nil
			*capture = captured
		}
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(status)
		w.(http.Flusher).Flush()
		_, _ = io.WriteString(w, sseBody)
	}))
}

func TestStreamChatRequestConstruction(t *testing.T) {
	var req http.Request
	var body []byte
	sse := "data: {\"choices\":[{\"delta\":{\"content\":\"hi\"}}]}\n\ndata: [DONE]\n\n"
	srv := fakeZaiServer(t, &req, &body, sse, http.StatusOK)
	defer srv.Close()

	client := NewZaiClient(srv.URL, testAPIKey, "glm-4.7-flashx", 10*time.Second)
	events, err := client.StreamChat(context.Background(), []Message{
		{Role: "system", Content: "server prompt"},
		{Role: "user", Content: "what is ragi jawa?"},
	}, 512)
	if err != nil {
		t.Fatalf("StreamChat: %v", err)
	}
	for range events {
	}

	if got := req.Header.Get("Authorization"); got != "Bearer "+testAPIKey {
		t.Errorf("Authorization header = %q, want Bearer <key>", got)
	}
	if !strings.HasSuffix(req.URL.Path, "/chat/completions") {
		t.Errorf("request path = %q, want .../chat/completions", req.URL.Path)
	}

	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		t.Fatalf("request body is not JSON: %v", err)
	}
	if payload["model"] != "glm-4.7-flashx" {
		t.Errorf("model = %v, want glm-4.7-flashx", payload["model"])
	}
	if payload["stream"] != true {
		t.Errorf("stream = %v, want true", payload["stream"])
	}
	if maxTokens, ok := payload["max_tokens"].(float64); !ok || int(maxTokens) != 512 {
		t.Errorf("max_tokens = %v, want 512", payload["max_tokens"])
	}
	thinking, ok := payload["thinking"].(map[string]any)
	if !ok || thinking["type"] != "disabled" {
		t.Errorf("thinking = %v, want {type: disabled}", payload["thinking"])
	}

	msgs, ok := payload["messages"].([]any)
	if !ok || len(msgs) != 2 {
		t.Fatalf("messages = %v, want 2 entries", payload["messages"])
	}
	first, _ := msgs[0].(map[string]any)
	if first["role"] != "system" {
		t.Errorf("first message role = %v, want system", first["role"])
	}

	// The API key must never appear in the request body.
	if strings.Contains(string(body), testAPIKey) {
		t.Error("API key leaked into request body")
	}
}

func TestStreamChatParsesDeltasAndDone(t *testing.T) {
	sse := "event: message\n" +
		"data: {\"choices\":[{\"delta\":{\"content\":\"Ragi\"}}]}\n\n" +
		"data: {\"choices\":[{\"delta\":{\"reasoning_content\":\"hidden\",\"content\":\" Jawa\"}}]}\n\n" +
		": keep-alive comment\n\n" +
		"data: not-json-at-all\n\n" +
		"data: {\"choices\":[{\"delta\":{}}]}\n\n" +
		"data: [DONE]\n\n"
	srv := fakeZaiServer(t, nil, nil, sse, http.StatusOK)
	defer srv.Close()

	client := NewZaiClient(srv.URL, testAPIKey, "glm-4.7-flashx", 10*time.Second)
	events, err := client.StreamChat(context.Background(), []Message{{Role: "user", Content: "hi"}}, 512)
	if err != nil {
		t.Fatalf("StreamChat: %v", err)
	}

	var text strings.Builder
	sawDone := false
	for ev := range events {
		if ev.Err != nil {
			t.Fatalf("unexpected error event: %v", ev.Err)
		}
		if ev.Done {
			sawDone = true
		}
		text.WriteString(ev.Delta)
	}
	if got := text.String(); got != "Ragi Jawa" {
		t.Errorf("accumulated deltas = %q, want %q", got, "Ragi Jawa")
	}
	if !sawDone {
		t.Error("stream ended without a Done event")
	}
}

func TestStreamChatProviderErrorStatus(t *testing.T) {
	srv := fakeZaiServer(t, nil, nil, "", http.StatusInternalServerError)
	defer srv.Close()

	client := NewZaiClient(srv.URL, testAPIKey, "glm-4.7-flashx", 10*time.Second)
	_, err := client.StreamChat(context.Background(), []Message{{Role: "user", Content: "hi"}}, 512)
	if err == nil {
		t.Fatal("expected error for HTTP 500 from provider")
	}
	if strings.Contains(err.Error(), testAPIKey) {
		t.Error("error message leaked the API key")
	}
}

func TestStreamChatProviderStreamError(t *testing.T) {
	sse := "data: {\"error\":{\"message\":\"boom\"}}\n\n"
	srv := fakeZaiServer(t, nil, nil, sse, http.StatusOK)
	defer srv.Close()

	client := NewZaiClient(srv.URL, testAPIKey, "glm-4.7-flashx", 10*time.Second)
	events, err := client.StreamChat(context.Background(), []Message{{Role: "user", Content: "hi"}}, 512)
	if err != nil {
		t.Fatalf("StreamChat: %v", err)
	}
	for ev := range events {
		if ev.Err != nil {
			return // pass: error surfaced as event
		}
	}
	t.Fatal("expected an error event from provider error payload")
}

func TestStreamChatTimeout(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(300 * time.Millisecond)
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = io.WriteString(w, "data: [DONE]\n\n")
	}))
	defer srv.Close()

	client := NewZaiClient(srv.URL, testAPIKey, "glm-4.7-flashx", 50*time.Millisecond)
	events, err := client.StreamChat(context.Background(), []Message{{Role: "user", Content: "hi"}}, 512)
	if err != nil {
		// The initial POST timed out — the timeout surfaced as a request
		// error, which is exactly what we want to verify.
		return
	}
	for ev := range events {
		if ev.Err != nil {
			return // pass: timeout surfaced as an error event instead
		}
	}
	t.Fatal("expected the client timeout to produce an error")
}

func TestStreamChatWithoutAPIKey(t *testing.T) {
	client := NewZaiClient("https://example.invalid", "", "glm-4.7-flashx", time.Second)
	if _, err := client.StreamChat(context.Background(), []Message{{Role: "user", Content: "hi"}}, 512); err == nil {
		t.Fatal("expected error when API key is missing")
	}
}

// The provider's coding-plan limiter holds over-limit requests without
// answering; the client must cancel the held attempt and retry once.
func TestStreamChatRetriesHeldRequest(t *testing.T) {
	hits := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits++
		if hits == 1 {
			// Hold without responding; the watchdog cancels long before
			// this sleep finishes.
			time.Sleep(500 * time.Millisecond)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = io.WriteString(w, "data: {\"choices\":[{\"delta\":{\"content\":\"hi\"}}]}\n\ndata: [DONE]\n\n")
	}))
	defer srv.Close()

	client := NewZaiClient(srv.URL, testAPIKey, "glm-4.7", 5*time.Second)
	client.headerWait = 80 * time.Millisecond
	events, err := client.StreamChat(context.Background(), []Message{{Role: "user", Content: "hi"}}, 512)
	if err != nil {
		t.Fatalf("StreamChat: %v", err)
	}
	var text strings.Builder
	for ev := range events {
		if ev.Err != nil {
			t.Fatalf("unexpected error event: %v", ev.Err)
		}
		text.WriteString(ev.Delta)
	}
	if text.String() != "hi" {
		t.Errorf("deltas = %q, want %q", text.String(), "hi")
	}
	if hits != 2 {
		t.Errorf("provider hits = %d, want 2 (held attempt + retry)", hits)
	}
}

// A provider that holds every request exhausts the retry and errors out
// instead of hanging until the caller's deadline.
func TestStreamChatHeldForeverFailsFast(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(500 * time.Millisecond)
	}))
	defer srv.Close()

	client := NewZaiClient(srv.URL, testAPIKey, "glm-4.7", 5*time.Second)
	client.headerWait = 80 * time.Millisecond
	start := time.Now()
	_, err := client.StreamChat(context.Background(), []Message{{Role: "user", Content: "hi"}}, 512)
	if err == nil {
		t.Fatal("expected error when every attempt is held")
	}
	if elapsed := time.Since(start); elapsed > 450*time.Millisecond {
		t.Errorf("StreamChat took %v, want fast failure after two held attempts", elapsed)
	}
}
