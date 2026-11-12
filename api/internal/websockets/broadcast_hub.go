package websockets

import (
	"log"
)

type BroadcastHub struct {
	// Registered clients.
	clients map[*Websocket]struct{}

	// Inbound messages from the clients.
	broadcast chan message

	// Register requests from the clients.
	register chan *Websocket

	// Unregister requests from clients.
	unregister chan *Websocket
}

type message struct{
	Body []byte
	Channel []int64
}

func NewBroadcastHub() *BroadcastHub {
	return &BroadcastHub{
		broadcast:  make(chan message),
		register:   make(chan *Websocket),
		unregister: make(chan *Websocket),
		clients:    make(map[*Websocket]struct{}),
	}
}

func (h *BroadcastHub) Run() {
	for {
		select {
		case client := <-h.register:
			h.clients[client] = struct{}{}
		case client := <-h.unregister:
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
			}
		case message := <-h.broadcast:
			log.Printf("message: %s", message.Body)
			for client := range h.clients {
				if client.IsInterested(message.Channel) {
					log.Printf("interested client: %v", client)
					select {
					case client.send <- message.Body:
						log.Printf("message sent")
					default:
						close(client.send)
						delete(h.clients, client)
					}
				}
			}
		}
	}
}

func (h *BroadcastHub) Broadcast(body []byte, channel []int64) {
	m := message{
		Body: body,
		Channel: channel,
	}
	h.broadcast <- m
}

func (h *BroadcastHub) GetConnectedUsers(channelIDs []int64) []int64 {
	connected := make([]int64, 0)
	for client := range h.clients {
		if client.IsInterested(channelIDs) {
			connected = append(connected, client.UserID)
		}
	}
	return connected
}
