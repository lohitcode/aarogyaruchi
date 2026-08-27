package websocket

import (
	"log"
	"sync"
	"sync/atomic"
)

// Hub maintains the set of active clients and routes events to them.
type Hub struct {
	clients map[*Client]bool

	// Indexed connection maps for O(1) targeted messaging.
	userConns    map[int64][]*Client // customer userID -> clients
	adminConns   map[int64][]*Client // adminID -> clients
	partnerConns map[int64][]*Client // delivery partnerID -> clients

	register       chan *Client
	unregister     chan *Client
	broadcastAdmin chan []byte

	// version is a process-wide monotonic event counter. Single API instance
	// per deployment, so in-memory is sufficient; a restart resets it and
	// clients refetch REST state on reconnect anyway.
	version atomic.Uint64

	mu      sync.RWMutex
	stopped bool
	done    chan struct{}
}

func NewHub() *Hub {
	return &Hub{
		clients:        make(map[*Client]bool),
		userConns:      make(map[int64][]*Client),
		adminConns:     make(map[int64][]*Client),
		partnerConns:   make(map[int64][]*Client),
		register:       make(chan *Client),
		unregister:     make(chan *Client),
		broadcastAdmin: make(chan []byte, 64),
		done:           make(chan struct{}),
	}
}

// Run starts the hub's main loop.
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.registerClient(client)

		case client := <-h.unregister:
			h.unregisterClient(client)

		case message := <-h.broadcastAdmin:
			h.broadcastToAdmins(message)

		case <-h.done:
			h.cleanup()
			return
		}
	}
}

// Stop gracefully stops the hub.
func (h *Hub) Stop() {
	h.mu.Lock()
	if h.stopped {
		h.mu.Unlock()
		return
	}
	h.stopped = true
	h.mu.Unlock()

	close(h.done)
}

// Register adds a new client to the hub.
func (h *Hub) Register(client *Client) {
	h.register <- client
}

func (h *Hub) registerClient(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	h.clients[client] = true

	switch client.UserType {
	case "user":
		h.userConns[client.UserID] = append(h.userConns[client.UserID], client)
	case "admin":
		h.adminConns[client.AdminID] = append(h.adminConns[client.AdminID], client)
	case "delivery_partner":
		h.partnerConns[client.PartnerID] = append(h.partnerConns[client.PartnerID], client)
	}
}

func (h *Hub) unregisterClient(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if _, ok := h.clients[client]; !ok {
		return
	}

	delete(h.clients, client)

	switch client.UserType {
	case "user":
		h.userConns[client.UserID] = removeClient(h.userConns[client.UserID], client)
		if len(h.userConns[client.UserID]) == 0 {
			delete(h.userConns, client.UserID)
		}
	case "admin":
		h.adminConns[client.AdminID] = removeClient(h.adminConns[client.AdminID], client)
		if len(h.adminConns[client.AdminID]) == 0 {
			delete(h.adminConns, client.AdminID)
		}
	case "delivery_partner":
		h.partnerConns[client.PartnerID] = removeClient(h.partnerConns[client.PartnerID], client)
		if len(h.partnerConns[client.PartnerID]) == 0 {
			delete(h.partnerConns, client.PartnerID)
		}
	}
}

func (h *Hub) broadcastToAdmins(message []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	for _, clients := range h.adminConns {
		for _, client := range clients {
			client.Send(message)
		}
	}
}

func (h *Hub) cleanup() {
	h.mu.Lock()
	defer h.mu.Unlock()

	for client := range h.clients {
		client.Close()
	}

	h.clients = make(map[*Client]bool)
	h.userConns = make(map[int64][]*Client)
	h.adminConns = make(map[int64][]*Client)
	h.partnerConns = make(map[int64][]*Client)
}

// SendToUser sends a message to all connections for a specific customer.
func (h *Hub) SendToUser(userID int64, data []byte) {
	h.mu.RLock()
	clients := h.userConns[userID]
	h.mu.RUnlock()

	for _, client := range clients {
		client.Send(data)
	}
}

// SendToUsers sends a message to several customers (each gets one copy per
// connection).
func (h *Hub) SendToUsers(userIDs []int64, data []byte) {
	seen := make(map[int64]bool, len(userIDs))
	for _, userID := range userIDs {
		if userID <= 0 || seen[userID] {
			continue
		}
		seen[userID] = true
		h.SendToUser(userID, data)
	}
}

// SendToPartner sends a message to all connections for a delivery partner.
func (h *Hub) SendToPartner(partnerID int64, data []byte) {
	h.mu.RLock()
	clients := h.partnerConns[partnerID]
	h.mu.RUnlock()

	for _, client := range clients {
		client.Send(data)
	}
}

// SendToAllAdmins sends a message to every admin connection.
func (h *Hub) SendToAllAdmins(data []byte) {
	select {
	case h.broadcastAdmin <- data:
	default:
		log.Printf("websocket: admin broadcast channel full, dropping message")
	}
}

// ConnectedPartners reports whether the partner currently has a WS session.
func (h *Hub) ConnectedPartners() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.partnerConns)
}

// removeClient removes a client from a slice.
func removeClient(clients []*Client, client *Client) []*Client {
	for i, c := range clients {
		if c == client {
			return append(clients[:i], clients[i+1:]...)
		}
	}
	return clients
}
