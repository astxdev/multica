package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestDailyTaskLifecycle(t *testing.T) {
	if testHandler == nil {
		t.Skip("database not available")
	}

	// Create.
	w := httptest.NewRecorder()
	req := newRequest("POST", "/api/daily-tasks", map[string]any{"text": "Buy milk"})
	testHandler.CreateDailyTask(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("CreateDailyTask: expected 201, got %d: %s", w.Code, w.Body.String())
	}
	var created DailyTaskResponse
	if err := json.NewDecoder(w.Body).Decode(&created); err != nil {
		t.Fatalf("decode CreateDailyTask: %v", err)
	}
	if created.Text != "Buy milk" || created.Done {
		t.Errorf("created = %+v, want text=Buy milk done=false", created)
	}
	defer func() {
		r := newRequest("DELETE", "/api/daily-tasks/"+created.ID, nil)
		r = withURLParam(r, "id", created.ID)
		testHandler.DeleteDailyTask(httptest.NewRecorder(), r)
	}()

	// List must include the new task.
	w = httptest.NewRecorder()
	req = newRequest("GET", "/api/daily-tasks", nil)
	testHandler.ListDailyTasks(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("ListDailyTasks: expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var listResp struct {
		Tasks []DailyTaskResponse `json:"tasks"`
		Total int                 `json:"total"`
	}
	if err := json.NewDecoder(w.Body).Decode(&listResp); err != nil {
		t.Fatalf("decode list: %v", err)
	}
	found := false
	for _, task := range listResp.Tasks {
		if task.ID == created.ID {
			found = true
		}
	}
	if !found {
		t.Fatalf("list does not contain created task: %+v", listResp)
	}

	// Toggle done.
	w = httptest.NewRecorder()
	req = newRequest("PATCH", "/api/daily-tasks/"+created.ID, map[string]any{"done": true})
	req = withURLParam(req, "id", created.ID)
	testHandler.ToggleDailyTask(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("ToggleDailyTask: expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var toggled DailyTaskResponse
	if err := json.NewDecoder(w.Body).Decode(&toggled); err != nil {
		t.Fatalf("decode ToggleDailyTask: %v", err)
	}
	if !toggled.Done {
		t.Errorf("toggled.Done = false, want true")
	}

	// Toggle back to not done.
	w = httptest.NewRecorder()
	req = newRequest("PATCH", "/api/daily-tasks/"+created.ID, map[string]any{"done": false})
	req = withURLParam(req, "id", created.ID)
	testHandler.ToggleDailyTask(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("ToggleDailyTask back: expected 200, got %d: %s", w.Code, w.Body.String())
	}

	// Empty text must reject.
	w = httptest.NewRecorder()
	req = newRequest("POST", "/api/daily-tasks", map[string]any{"text": "   "})
	testHandler.CreateDailyTask(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("empty text: expected 400, got %d: %s", w.Code, w.Body.String())
	}

	// Delete.
	w = httptest.NewRecorder()
	req = newRequest("DELETE", "/api/daily-tasks/"+created.ID, nil)
	req = withURLParam(req, "id", created.ID)
	testHandler.DeleteDailyTask(w, req)
	if w.Code != http.StatusNoContent {
		t.Fatalf("DeleteDailyTask: expected 204, got %d: %s", w.Code, w.Body.String())
	}

	// Deleted task must 404 on further access.
	w = httptest.NewRecorder()
	req = newRequest("PATCH", "/api/daily-tasks/"+created.ID, map[string]any{"done": true})
	req = withURLParam(req, "id", created.ID)
	testHandler.ToggleDailyTask(w, req)
	if w.Code != http.StatusNotFound {
		t.Errorf("toggle deleted task: expected 404, got %d: %s", w.Code, w.Body.String())
	}
}

// TestDailyTaskIsolatedPerUser pins the core product invariant: daily tasks
// are personal, so a task created by one workspace member must be invisible
// and unreachable to another member of the same workspace, even though both
// belong to the same workspace_id.
func TestDailyTaskIsolatedPerUser(t *testing.T) {
	if testHandler == nil {
		t.Skip("database not available")
	}

	otherUserID := createWorkspaceMemberUser(t, "Daily Task Bystander", "daily-task-bystander@multica.test")

	w := httptest.NewRecorder()
	req := newRequest("POST", "/api/daily-tasks", map[string]any{"text": "Owner-only task"})
	testHandler.CreateDailyTask(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("CreateDailyTask: expected 201, got %d: %s", w.Code, w.Body.String())
	}
	var created DailyTaskResponse
	if err := json.NewDecoder(w.Body).Decode(&created); err != nil {
		t.Fatalf("decode CreateDailyTask: %v", err)
	}
	defer func() {
		r := newRequest("DELETE", "/api/daily-tasks/"+created.ID, nil)
		r = withURLParam(r, "id", created.ID)
		testHandler.DeleteDailyTask(httptest.NewRecorder(), r)
	}()

	// The other member's list must not contain the owner's task.
	w = httptest.NewRecorder()
	req = newRequestAs(otherUserID, "GET", "/api/daily-tasks", nil)
	testHandler.ListDailyTasks(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("ListDailyTasks (other user): expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var listResp struct {
		Tasks []DailyTaskResponse `json:"tasks"`
	}
	if err := json.NewDecoder(w.Body).Decode(&listResp); err != nil {
		t.Fatalf("decode list: %v", err)
	}
	for _, task := range listResp.Tasks {
		if task.ID == created.ID {
			t.Fatalf("other user's list leaked owner's task: %+v", task)
		}
	}

	// The other member toggling the owner's task id must 404, not succeed.
	w = httptest.NewRecorder()
	req = newRequestAs(otherUserID, "PATCH", "/api/daily-tasks/"+created.ID, map[string]any{"done": true})
	req = withURLParam(req, "id", created.ID)
	testHandler.ToggleDailyTask(w, req)
	if w.Code != http.StatusNotFound {
		t.Errorf("other user toggle: expected 404, got %d: %s", w.Code, w.Body.String())
	}

	// The other member deleting the owner's task id must 404, not succeed.
	w = httptest.NewRecorder()
	req = newRequestAs(otherUserID, "DELETE", "/api/daily-tasks/"+created.ID, nil)
	req = withURLParam(req, "id", created.ID)
	testHandler.DeleteDailyTask(w, req)
	if w.Code != http.StatusNotFound {
		t.Errorf("other user delete: expected 404, got %d: %s", w.Code, w.Body.String())
	}
}
