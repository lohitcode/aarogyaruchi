package websocket

import (
	"context"
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/coder/websocket"
)

const (
	writeWait = 10 * time.Second

	// How long a protocol ping may wait for its pong. A suspended phone
	// stops answering entirely, so the socket must be torn down within
	// this window or the hub keeps a phantom "connected" client that
	// suppresses realtime routing and push decisions.
	pongWait = 45 * time.Second

	// Server pings with this period. It must stay under proxies' ~100s
	// idle cutoff (Cloudflare) and above pongWait so pings never overlap.
	pingPeriod = 60 * time.Second

	// Location batches from the partner app can carry several fixes.
	maxMessageSize = 16 * 1024
)

// MessageHandler processes client→server messages. It runs on the read pump
// goroutine with the client's identity already resolved.
type MessageHandler func(client *Client, msg IncomingMessage)

// Client represents a WebSocket client connection.
type Client struct {
	hub  *Hub
	conn *websocket.Conn
	send chan []byte

	// Identity — only one is set based on UserType.
	UserID    int64 // customer
	AdminID   int64
	PartnerID int64 // delivery partner

	UserType string // user, admin, delivery_partner

	onMessage MessageHandler

	mu     sync.Mutex
	closed bool
}

// NewClient creates a new WebSocket client.
func NewClient(hub *Hub, conn *websocket.Conn, userType string, onMessage MessageHandler) *Client {
	return &Client{
		hub:       hub,
		conn:      conn,
		send:      make(chan []byte, 256),
		UserType:  userType,
		onMessage: onMessage,
	}
}

// ReadPump pumps messages from the WebSocket connection to the hub.
func (c *Client) ReadPump(ctx context.Context) {
	defer func() {
		c.hub.unregister <- c
		c.Close()
	}()

	c.conn.SetReadLimit(maxMessageSize)

	for {
		_, msg, err := c.conn.Read(ctx)
		if err != nil {
			if websocket.CloseStatus(err) != websocket.StatusNormalClosure {
				log.Printf("websocket read error: %v", err)
			}
			return
		}

		var incoming IncomingMessage
		if err := json.Unmarshal(msg, &incoming); err != nil {
			continue
		}

		switch incoming.Type {
		case EventPing:
			c.sendPong()
		case EventPartnerLocationReport:
			// Only partners may report GPS; the handler re-validates the
			// partner identity and active-run state against the database.
			if c.UserType == "delivery_partner" && c.onMessage != nil {
				c.onMessage(c, incoming)
			}
		}
	}
}

// WritePump pumps messages from the hub to the WebSocket connection.
func (c *Client) WritePump(ctx context.Context) {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			if !ok {
				c.conn.Close(websocket.StatusNormalClosure, "connection closed")
				return
			}

			ctx, cancel := context.WithTimeout(ctx, writeWait)
			err := c.conn.Write(ctx, websocket.MessageText, message)
			cancel()

			if err != nil {
				return
			}

		case <-ticker.C:
			// Protocol-level ping: browsers answer automatically in the
			// network stack. A client that cannot answer within pongWait
			// (suspended page, half-dead TCP) is dropped, which unregisters
			// it from the hub and lets push take over delivery.
			pingCtx, cancel := context.WithTimeout(context.Background(), pongWait)
			err := c.conn.Ping(pingCtx)
			cancel()
			if err != nil {
				return
			}

		case <-ctx.Done():
			return
		}
	}
}

// Send sends a message to the client.
func (c *Client) Send(data []byte) bool {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.closed {
		return false
	}

	select {
	case c.send <- data:
		return true
	default:
		c.closed = true
		close(c.send)
		return false
	}
}

// Close closes the client connection.
func (c *Client) Close() {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.closed {
		return
	}

	c.closed = true
	close(c.send)
	c.conn.Close(websocket.StatusNormalClosure, "connection closed")
}

func (c *Client) sendPong() {
	c.WriteEnvelope(&Envelope{Type: EventPong})
}

// WriteEnvelope marshals and writes a single envelope (ping/pong path).
func (c *Client) WriteEnvelope(envelope *Envelope) {
	data, err := json.Marshal(envelope)
	if err != nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), writeWait)
	defer cancel()

	c.conn.Write(ctx, websocket.MessageText, data)
}
