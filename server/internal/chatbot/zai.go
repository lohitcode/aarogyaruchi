package chatbot

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// Message is a single chat message exchanged with the provider.
type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// UnmarshalJSON accepts the canonical {role, content} public shape and, for
// compatibility with already-shipped frontend bundles that send the field as
// `text`, falls back to that alias when `content` is absent. Only `content`
// is ever marshaled back out to the provider.
func (m *Message) UnmarshalJSON(data []byte) error {
	var wire struct {
		Role    string `json:"role"`
		Content string `json:"content"`
		Text    string `json:"text"`
	}
	if err := json.Unmarshal(data, &wire); err != nil {
		return err
	}
	m.Role = wire.Role
	m.Content = wire.Content
	if m.Content == "" {
		m.Content = wire.Text
	}
	return nil
}

// ZaiEvent is one parsed streaming event from the provider.
type ZaiEvent struct {
	// Delta is a content fragment to forward to the visitor.
	Delta string
	// Err is set when the stream failed (timeout, malformed response, HTTP error).
	Err error
	// Done marks a clean end of stream.
	Done bool
}

// ZaiClient talks to Z.AI's OpenAI-compatible chat completion endpoint with
// streaming enabled. The API key never leaves this struct except in the
// Authorization header.
type ZaiClient struct {
	baseURL string
	apiKey  string
	model   string
	http    *http.Client
	// headerWait bounds how long an attempt may wait for response headers
	// before it is treated as held by the provider's concurrency limiter
	// and retried (see postStream).
	headerWait time.Duration
}

// NewZaiClient builds a client. timeout bounds a whole streaming exchange.
func NewZaiClient(baseURL, apiKey, model string, timeout time.Duration) *ZaiClient {
	// Keep-alives stay enabled for warm traffic, but each request carries a
	// header-phase watchdog: the provider's coding-plan limiter holds
	// over-limit requests in a queue without answering, and a cancel+retry
	// is served immediately, so visitors never see the hold.
	transport := &http.Transport{
		TLSHandshakeTimeout: 10 * time.Second,
	}
	return &ZaiClient{
		baseURL:    strings.TrimRight(baseURL, "/"),
		apiKey:     apiKey,
		model:      model,
		http:       &http.Client{Timeout: timeout, Transport: transport},
		headerWait: 10 * time.Second,
	}
}

type zaiStreamRequest struct {
	Model       string      `json:"model"`
	Messages    []Message   `json:"messages"`
	Stream      bool        `json:"stream"`
	MaxTokens   int         `json:"max_tokens"`
	Thinking    zaiThinking `json:"thinking"`
	Temperature float64     `json:"temperature"`
}

// zaiThinking disables chain-of-thought: unnecessary for grounded product
// help and it wastes the token budget.
type zaiThinking struct {
	Type string `json:"type"`
}

type zaiStreamChunk struct {
	Choices []struct {
		Delta struct {
			// reasoning_content is intentionally ignored.
			Content string `json:"content"`
		} `json:"delta"`
		FinishReason *string `json:"finish_reason"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}

// StreamChat starts a streaming completion and returns a channel of events.
// The channel is closed after Done or Err. Callers should cancel ctx to stop
// reading early.
func (c *ZaiClient) StreamChat(ctx context.Context, messages []Message, maxTokens int) (<-chan ZaiEvent, error) {
	if c.apiKey == "" {
		return nil, fmt.Errorf("z.ai api key is not configured")
	}

	body, err := json.Marshal(zaiStreamRequest{
		Model:       c.model,
		Messages:    messages,
		Stream:      true,
		MaxTokens:   maxTokens,
		Thinking:    zaiThinking{Type: "disabled"},
		Temperature: 0.4,
	})
	if err != nil {
		return nil, err
	}

	resp, err := c.postStream(ctx, body)
	if err != nil {
		return nil, err
	}

	events := make(chan ZaiEvent, 16)
	go c.readStream(resp.Body, events)
	return events, nil
}

// streamAttempts is the number of POST attempts per chat exchange: one
// initial try plus a single retry when the provider held the request.
const streamAttempts = 2

// postStream sends the completion request and returns the SSE response with
// headers received. The provider's coding-plan concurrency limiter does not
// reject excess requests — it holds them without answering. If headers do
// not arrive within headerWait, the attempt is cancelled and retried once;
// the fresh attempt is served immediately in practice. Errors caused by the
// caller's context (disconnect, overall deadline) are never retried.
func (c *ZaiClient) postStream(ctx context.Context, body []byte) (*http.Response, error) {
	var lastErr error
	for attempt := 1; attempt <= streamAttempts; attempt++ {
		attemptCtx, cancel := context.WithCancel(ctx)
		held := make(chan struct{})
		watchdog := time.AfterFunc(c.headerWait, func() {
			cancel()
			close(held)
		})

		req, err := http.NewRequestWithContext(
			attemptCtx,
			http.MethodPost,
			c.baseURL+"/chat/completions",
			bytes.NewReader(body),
		)
		if err != nil {
			watchdog.Stop()
			cancel()
			return nil, err
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Accept", "text/event-stream")
		req.Header.Set("Authorization", "Bearer "+c.apiKey)

		resp, err := c.http.Do(req)
		watchdog.Stop()
		if err != nil {
			cancel()
			// The watchdog cancels attemptCtx immediately before closing
			// `held`; accept either signal so the retry never loses the
			// race. A caller-side cancellation is excluded below.
			select {
			case <-held:
			case <-attemptCtx.Done():
			default:
				return nil, err
			}
			if ctx.Err() != nil || attempt >= streamAttempts {
				return nil, err
			}
			lastErr = err
			continue
		}
		if resp.StatusCode != http.StatusOK {
			// Read a bounded slice so a broken provider can't blow up memory;
			// only the status code is surfaced to visitors.
			_, _ = io.CopyN(io.Discard, resp.Body, 4096)
			resp.Body.Close()
			statusErr := fmt.Errorf("z.ai returned status %d", resp.StatusCode)
			if resp.StatusCode >= 500 && ctx.Err() == nil && attempt < streamAttempts {
				lastErr = statusErr
				cancel()
				continue
			}
			cancel()
			return nil, statusErr
		}

		// Headers arrived: the body now streams under attemptCtx, which must
		// stay alive until the caller's context ends. Cancel leaks are
		// bounded because handler contexts always resolve.
		go func() {
			<-ctx.Done()
			cancel()
		}()
		return resp, nil
	}
	return nil, lastErr
}

func (c *ZaiClient) readStream(body io.ReadCloser, events chan<- ZaiEvent) {
	defer body.Close()
	defer close(events)

	scanner := bufio.NewScanner(body)
	// Provider lines can be long; allow up to 1 MB per line.
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

	for scanner.Scan() {
		line := scanner.Text()
		if line == "" || strings.HasPrefix(line, ":") {
			continue
		}
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if data == "" {
			continue
		}
		if data == "[DONE]" {
			events <- ZaiEvent{Done: true}
			return
		}

		var chunk zaiStreamChunk
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			// Malformed chunk: skip rather than kill the whole stream.
			continue
		}
		if chunk.Error != nil {
			events <- ZaiEvent{Err: fmt.Errorf("z.ai stream error")}
			return
		}
		if len(chunk.Choices) > 0 && chunk.Choices[0].Delta.Content != "" {
			events <- ZaiEvent{Delta: chunk.Choices[0].Delta.Content}
		}
	}

	if err := scanner.Err(); err != nil {
		events <- ZaiEvent{Err: fmt.Errorf("z.ai stream read failed")}
		return
	}
	// Provider closed without [DONE]; treat as complete.
	events <- ZaiEvent{Done: true}
}
