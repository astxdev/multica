package handler

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	db "github.com/multica-ai/multica/server/pkg/db/generated"
)

// DailyTaskResponse is the JSON shape returned by the daily task API.
type DailyTaskResponse struct {
	ID          string `json:"id"`
	WorkspaceID string `json:"workspace_id"`
	UserID      string `json:"user_id"`
	Text        string `json:"text"`
	Done        bool   `json:"done"`
	CreatedAt   string `json:"created_at"`
	UpdatedAt   string `json:"updated_at"`
}

func dailyTaskToResponse(t db.DailyTask) DailyTaskResponse {
	return DailyTaskResponse{
		ID:          uuidToString(t.ID),
		WorkspaceID: uuidToString(t.WorkspaceID),
		UserID:      uuidToString(t.UserID),
		Text:        t.Text,
		Done:        t.Done,
		CreatedAt:   timestampToString(t.CreatedAt),
		UpdatedAt:   timestampToString(t.UpdatedAt),
	}
}

// CreateDailyTaskRequest is the body for POST /api/daily-tasks.
type CreateDailyTaskRequest struct {
	Text string `json:"text"`
}

// UpdateDailyTaskRequest is the body for PATCH /api/daily-tasks/{id}.
type UpdateDailyTaskRequest struct {
	Done bool `json:"done"`
}

// loadDailyTaskForUser resolves a daily task, scoped to the requesting
// workspace member. Daily tasks are personal: the GetDailyTaskForUser query
// filters by workspace_id AND user_id, so a task owned by a different member
// of the same workspace 404s exactly like one that doesn't exist.
func (h *Handler) loadDailyTaskForUser(w http.ResponseWriter, r *http.Request, idParam string) (db.DailyTask, bool) {
	taskUUID, ok := parseUUIDOrBadRequest(w, idParam, "daily task id")
	if !ok {
		return db.DailyTask{}, false
	}
	wsUUID, ok := parseUUIDOrBadRequest(w, h.resolveWorkspaceID(r), "workspace id")
	if !ok {
		return db.DailyTask{}, false
	}
	userID, ok := requireUserID(w, r)
	if !ok {
		return db.DailyTask{}, false
	}
	userUUID, ok := parseUUIDOrBadRequest(w, userID, "user id")
	if !ok {
		return db.DailyTask{}, false
	}
	task, err := h.Queries.GetDailyTaskForUser(r.Context(), db.GetDailyTaskForUserParams{
		ID: taskUUID, WorkspaceID: wsUUID, UserID: userUUID,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "daily task not found")
		return db.DailyTask{}, false
	}
	return task, true
}

// ListDailyTasks returns the requesting member's own daily tasks.
func (h *Handler) ListDailyTasks(w http.ResponseWriter, r *http.Request) {
	wsUUID, ok := parseUUIDOrBadRequest(w, h.resolveWorkspaceID(r), "workspace id")
	if !ok {
		return
	}
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}
	userUUID, ok := parseUUIDOrBadRequest(w, userID, "user id")
	if !ok {
		return
	}
	tasks, err := h.Queries.ListDailyTasks(r.Context(), db.ListDailyTasksParams{
		WorkspaceID: wsUUID, UserID: userUUID,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list daily tasks")
		return
	}
	resp := make([]DailyTaskResponse, len(tasks))
	for i, t := range tasks {
		resp[i] = dailyTaskToResponse(t)
	}
	writeJSON(w, http.StatusOK, map[string]any{"tasks": resp, "total": len(resp)})
}

// CreateDailyTask adds a new item to the requesting member's checklist.
func (h *Handler) CreateDailyTask(w http.ResponseWriter, r *http.Request) {
	wsUUID, ok := parseUUIDOrBadRequest(w, h.resolveWorkspaceID(r), "workspace id")
	if !ok {
		return
	}
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}
	userUUID, ok := parseUUIDOrBadRequest(w, userID, "user id")
	if !ok {
		return
	}
	var req CreateDailyTaskRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	text := strings.TrimSpace(req.Text)
	if text == "" {
		writeError(w, http.StatusBadRequest, "text is required")
		return
	}
	task, err := h.Queries.CreateDailyTask(r.Context(), db.CreateDailyTaskParams{
		WorkspaceID: wsUUID, UserID: userUUID, Text: text,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create daily task")
		return
	}
	writeJSON(w, http.StatusCreated, dailyTaskToResponse(task))
}

// ToggleDailyTask sets the done state of an existing daily task.
func (h *Handler) ToggleDailyTask(w http.ResponseWriter, r *http.Request) {
	existing, ok := h.loadDailyTaskForUser(w, r, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	var req UpdateDailyTaskRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	updated, err := h.Queries.SetDailyTaskDone(r.Context(), db.SetDailyTaskDoneParams{
		ID: existing.ID, Done: req.Done,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update daily task")
		return
	}
	writeJSON(w, http.StatusOK, dailyTaskToResponse(updated))
}

// DeleteDailyTask removes a daily task from the requesting member's checklist.
func (h *Handler) DeleteDailyTask(w http.ResponseWriter, r *http.Request) {
	existing, ok := h.loadDailyTaskForUser(w, r, chi.URLParam(r, "id"))
	if !ok {
		return
	}
	if err := h.Queries.DeleteDailyTask(r.Context(), existing.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete daily task")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
