package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"chat-gobelin-api/internal"
	"chat-gobelin-api/internal/users"
	"chat-gobelin-api/internal/channels"
	"chat-gobelin-api/internal/websockets"
)

type channelHandler struct {
	hub *websockets.BroadcastHub
	channelRepo channels.Repo
	userRepo users.Repo
}

func NewChannelHandler(h *websockets.BroadcastHub, s channels.Repo, u users.Repo) (*channelHandler, error) {
	return &channelHandler{
		hub: h,
		channelRepo: s,
		userRepo: u,
	}, nil
}

type createChannelRequest struct {
	Name string `json:"name" binding:"required"`
	Metadata *json.RawMessage `json:"metadata"`
}

type editChannelRequest struct {
	ID int64 `json:"id" binding:"required"`
	Name string `json:"name" binding:"required"`
	Metadata *json.RawMessage `json:"metadata" binding:"required"`
}

type EnterChannelRequest struct {
	ChannelName string `json:"channel" binding:"required"`
}

func (h channelHandler) Create(writer http.ResponseWriter, request *http.Request) {
	ctx := request.Context()

	userRaw := ctx.Value("user")
	user := userRaw.(*users.User)
	if user == nil {
		log.Printf("No user found")
		writer.WriteHeader(http.StatusInternalServerError)
		return
	}

	decoder := json.NewDecoder(request.Body)

	var req createChannelRequest
	err := decoder.Decode(&req)

	if err != nil {
		log.Printf("Error decoding request: %s", err)
		writer.WriteHeader(http.StatusInternalServerError)
		return
	}

	var meta json.RawMessage
	namespacedMeta := make(map[string]json.RawMessage)
	if req.Metadata != nil {
		namespace := internal.GetNamespace(ctx)
		if namespace == "" {
			log.Printf("Metadatas given without namespace")
			writer.WriteHeader(http.StatusInternalServerError)
			return
		}
		namespacedMeta[namespace] = *req.Metadata
		meta, err = json.Marshal(namespacedMeta)
		if err != nil {
			log.Printf("Error namespacing metadatas: %s", err.Error())
			writer.WriteHeader(http.StatusInternalServerError)
			return
		}
	}

	channel, err := h.channelRepo.Create(ctx, req.Name, meta)
	if err != nil {
		log.Printf("Error creating channel: %s", err.Error())
		writer.WriteHeader(http.StatusInternalServerError)
		return
	}
	channel.Metadata = namespacedMeta

	err = h.channelRepo.AddUserToChannel(ctx, *channel, *user)
	if err != nil {
		log.Printf("Error adding user to new channel: %s", err.Error())
		writer.WriteHeader(http.StatusInternalServerError)
		return
	}

	result, err := json.Marshal(channel)
	if err != nil {
		log.Printf("Error marshaling value: %s", err.Error())
		writer.WriteHeader(http.StatusInternalServerError)
		return
	}
	writer.WriteHeader(http.StatusOK)
	writer.Write(result)
}

func (h channelHandler) EnterChannel(writer http.ResponseWriter, request *http.Request) {
	ctx := request.Context()

	userRaw := ctx.Value("user")
	user := userRaw.(*users.User)
	if user == nil {
		log.Printf("No user found")
		writer.WriteHeader(http.StatusInternalServerError)
		return
	}

	decoder := json.NewDecoder(request.Body)

	var req EnterChannelRequest
	err := decoder.Decode(&req)

	if err != nil {
		log.Printf("Error decoding request: %s", err)
		writer.WriteHeader(http.StatusInternalServerError)
		return
	}

	channel, err := h.channelRepo.GetByName(ctx, req.ChannelName)
	if err != nil {
		log.Printf("Error finding channel: %s", err)
		writer.WriteHeader(http.StatusInternalServerError)
		return
	}

	err = h.channelRepo.AddUserToChannel(ctx, *channel, *user)
	if err != nil {
		log.Printf("Error adding user to new channel: %s", err.Error())
		writer.WriteHeader(http.StatusInternalServerError)
		return
	}

	result, err := json.Marshal(channel)
	if err != nil {
		log.Printf("Error marshaling value: %s", err.Error())
		writer.WriteHeader(http.StatusInternalServerError)
		return
	}
	h.hub.Broadcast(result, []int64{channel.ID})
	writer.WriteHeader(http.StatusOK)
	writer.Write(result)
}

func (h channelHandler) Edit(writer http.ResponseWriter, request *http.Request) {
	ctx := request.Context()

	userRaw := ctx.Value("user")
	user := userRaw.(*users.User)
	if user == nil {
		log.Printf("No user found")
		writer.WriteHeader(http.StatusInternalServerError)
		return
	}

	decoder := json.NewDecoder(request.Body)

	var req editChannelRequest
	err := decoder.Decode(&req)
	if err != nil {
		log.Printf("Error decoding request: %s", err)
		writer.WriteHeader(http.StatusInternalServerError)
		return
	}

	channel, err := h.channelRepo.GetByID(ctx, req.ID)
	if err != nil {
		log.Printf("Error retrieving channel: %s", err)
		writer.WriteHeader(http.StatusInternalServerError)
		return
	}

	var meta json.RawMessage
	namespacedMeta := channel.Metadata
	namespace := internal.GetNamespace(ctx)
	if namespace == "" {
		log.Printf("Metadatas given without namespace")
		writer.WriteHeader(http.StatusInternalServerError)
		return
	}
	namespacedMeta[namespace] = *req.Metadata
	meta, err = json.Marshal(namespacedMeta)
	if err != nil {
		log.Printf("Error namespacing metadatas: %s", err.Error())
		writer.WriteHeader(http.StatusInternalServerError)
		return
	}

	channel, err = h.channelRepo.Edit(ctx, *channel, req.Name, meta)
	if err != nil {
		log.Printf("Error editing message: %s", err.Error())
		writer.WriteHeader(http.StatusInternalServerError)
		return
	}
	channel.Metadata = namespacedMeta

	result, err := json.Marshal(channel)
	if err != nil {
		log.Printf("Error marshaling value: %s", err.Error())
		writer.WriteHeader(http.StatusInternalServerError)
		return
	}
	h.hub.Broadcast(result, []int64{channel.ID})
	writer.WriteHeader(http.StatusOK)
	writer.Write(result)
}

// serveWS create a websocket allowing to read events from one (or several) channel
func (h channelHandler) ServeWS(writer http.ResponseWriter, request *http.Request) {
	ctx := request.Context()

	userRaw := ctx.Value("user")
	user := userRaw.(*users.User)
	if user == nil {
		log.Printf("No user found")
		writer.WriteHeader(http.StatusInternalServerError)
		return
	}

	channelIDStrings := request.URL.Query()["channel"]
	if len(channelIDStrings) == 0 {
		log.Printf("No channel found: %s", request.URL.RawQuery)
		writer.WriteHeader(http.StatusInternalServerError)
		return
	}

	channels := make([]int64, 0, len(channelIDStrings))
	for _, channelIDString := range channelIDStrings {
		channelID, err := strconv.ParseInt(channelIDString, 10, 64)
		if err != nil {
			log.Printf("Error converting channel ID: %s", err.Error())
			writer.WriteHeader(http.StatusInternalServerError)
			return
		}
		channels = append(channels, channelID)
	}

	//It return the websocket, but we don't need it in the controller
	_, err := websockets.NewWebsocket(h.hub, writer, request, user.ID, channels)
	if err != nil {
		log.Println(err)
		return
	}
	event := users.ConnectedUser{
		Operation: internal.USER_CONNECTED,
		ID: user.ID,
	}
	result, err := json.Marshal(event)
	if err != nil {
		log.Printf("Error marshaling value: %s", err.Error())
		writer.WriteHeader(http.StatusInternalServerError)
		return
	}
	h.hub.Broadcast(result, channels)
}

func (h channelHandler) GetConnectedUsers(writer http.ResponseWriter, request *http.Request) {
	ctx := request.Context()

	channelIDStrings := request.URL.Query()["channel"]
	if len(channelIDStrings) == 0 {
		log.Printf("No channel found: %s", request.URL.RawQuery)
		writer.WriteHeader(http.StatusInternalServerError)
		return
	}

	channels := make([]int64, 0, len(channelIDStrings))
	for _, channelIDString := range channelIDStrings {
		channelID, err := strconv.ParseInt(channelIDString, 10, 64)
		if err != nil {
			log.Printf("Error converting channel ID: %s", err.Error())
			writer.WriteHeader(http.StatusInternalServerError)
			return
		}
		channels = append(channels, channelID)
	}

	connected := h.hub.GetConnectedUsers(channels)
	users, err := h.userRepo.GetByIDs(ctx, connected)
	if err != nil {
		log.Println(err)
		return
	}

	result, err := json.Marshal(users)
	if err != nil {
		log.Printf("Error marshaling value: %s", err.Error())
		writer.WriteHeader(http.StatusInternalServerError)
		return
	}
	writer.WriteHeader(http.StatusOK)
	writer.Write(result)
}
