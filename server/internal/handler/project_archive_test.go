package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// createArchiveTestProject creates a project through the handler and registers
// its cleanup, so each archive test starts from a known non-archived row.
func createArchiveTestProject(t *testing.T, title string) ProjectResponse {
	t.Helper()
	w := httptest.NewRecorder()
	testHandler.CreateProject(w, newRequest("POST", "/api/projects?workspace_id="+testWorkspaceID, map[string]any{
		"title": title,
	}))
	created := decodeProject(t, w, http.StatusCreated)
	t.Cleanup(func() {
		_, _ = testPool.Exec(context.Background(), `DELETE FROM project WHERE id = $1`, created.ID)
	})
	return created
}

func listProjects(t *testing.T, query string) []ProjectResponse {
	t.Helper()
	w := httptest.NewRecorder()
	testHandler.ListProjects(w, newRequest("GET", "/api/projects?workspace_id="+testWorkspaceID+query, nil))
	if w.Code != http.StatusOK {
		t.Fatalf("ListProjects: expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var resp struct {
		Projects []ProjectResponse `json:"projects"`
	}
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode ListProjects: %v", err)
	}
	return resp.Projects
}

func containsProject(projects []ProjectResponse, id string) bool {
	for _, p := range projects {
		if p.ID == id {
			return true
		}
	}
	return false
}

// TestArchiveRestoreProject is the full handler round trip: archive sets the
// archived fields and rejects a second archive with 409, restore reverses it
// and rejects a second restore the same way.
func TestArchiveRestoreProject(t *testing.T) {
	if testHandler == nil {
		t.Skip("database not available")
	}
	created := createArchiveTestProject(t, "archive round trip")

	archiveW := httptest.NewRecorder()
	testHandler.ArchiveProject(archiveW, withURLParam(newRequest(http.MethodPost, "/api/projects/"+created.ID+"/archive", nil), "id", created.ID))
	archived := decodeProject(t, archiveW, http.StatusOK)
	if archived.ArchivedAt == nil {
		t.Error("ArchiveProject: expected archived_at to be set")
	}
	if archived.ArchivedBy == nil || *archived.ArchivedBy != testUserID {
		t.Errorf("ArchiveProject: expected archived_by=%s, got %v", testUserID, archived.ArchivedBy)
	}

	// Archiving an already-archived project is a conflict, not a silent no-op.
	againW := httptest.NewRecorder()
	testHandler.ArchiveProject(againW, withURLParam(newRequest(http.MethodPost, "/api/projects/"+created.ID+"/archive", nil), "id", created.ID))
	if againW.Code != http.StatusConflict {
		t.Errorf("ArchiveProject on already-archived: expected 409, got %d", againW.Code)
	}

	restoreW := httptest.NewRecorder()
	testHandler.RestoreProject(restoreW, withURLParam(newRequest(http.MethodPost, "/api/projects/"+created.ID+"/restore", nil), "id", created.ID))
	restored := decodeProject(t, restoreW, http.StatusOK)
	if restored.ArchivedAt != nil || restored.ArchivedBy != nil {
		t.Errorf("RestoreProject: expected archived fields cleared, got archived_at=%v archived_by=%v", restored.ArchivedAt, restored.ArchivedBy)
	}

	// Restoring a non-archived project is a conflict too.
	againRestoreW := httptest.NewRecorder()
	testHandler.RestoreProject(againRestoreW, withURLParam(newRequest(http.MethodPost, "/api/projects/"+created.ID+"/restore", nil), "id", created.ID))
	if againRestoreW.Code != http.StatusConflict {
		t.Errorf("RestoreProject on non-archived: expected 409, got %d", againRestoreW.Code)
	}
}

// TestListProjectsExcludesArchivedByDefault covers the visibility half: an
// archived project drops out of the default list (which is what every project
// picker reads) and comes back only with include_archived=true. GET by id
// keeps working either way, so an archived project stays openable.
func TestListProjectsExcludesArchivedByDefault(t *testing.T) {
	if testHandler == nil {
		t.Skip("database not available")
	}
	created := createArchiveTestProject(t, "archive visibility")

	if !containsProject(listProjects(t, ""), created.ID) {
		t.Fatalf("project %s should be in the default list before archiving", created.ID)
	}

	archiveW := httptest.NewRecorder()
	testHandler.ArchiveProject(archiveW, withURLParam(newRequest(http.MethodPost, "/api/projects/"+created.ID+"/archive", nil), "id", created.ID))
	decodeProject(t, archiveW, http.StatusOK)

	if containsProject(listProjects(t, ""), created.ID) {
		t.Errorf("archived project %s must be hidden from the default list", created.ID)
	}
	if !containsProject(listProjects(t, "&include_archived=true"), created.ID) {
		t.Errorf("archived project %s must appear with include_archived=true", created.ID)
	}

	getW := httptest.NewRecorder()
	testHandler.GetProject(getW, withURLParam(newRequest("GET", "/api/projects/"+created.ID, nil), "id", created.ID))
	got := decodeProject(t, getW, http.StatusOK)
	if got.ArchivedAt == nil {
		t.Errorf("GET by id must still resolve an archived project with archived_at set")
	}
}

// TestProjectSearchExcludesArchived pins the command-palette contract:
// archived projects are unreachable from search regardless of include_closed.
func TestProjectSearchExcludesArchived(t *testing.T) {
	if testHandler == nil {
		t.Skip("database not available")
	}
	created := createArchiveTestProject(t, "zarchivesearchneedle")

	searchHits := func() bool {
		t.Helper()
		w := httptest.NewRecorder()
		testHandler.SearchProjects(w, newRequest("GET", "/api/projects/search?workspace_id="+testWorkspaceID+"&q=zarchivesearchneedle&include_closed=true", nil))
		if w.Code != http.StatusOK {
			t.Fatalf("SearchProjects: expected 200, got %d: %s", w.Code, w.Body.String())
		}
		var resp struct {
			Projects []SearchProjectResponse `json:"projects"`
		}
		if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
			t.Fatalf("decode SearchProjects: %v", err)
		}
		for _, p := range resp.Projects {
			if p.ID == created.ID {
				return true
			}
		}
		return false
	}

	if !searchHits() {
		t.Fatalf("project %s should be searchable before archiving", created.ID)
	}

	archiveW := httptest.NewRecorder()
	testHandler.ArchiveProject(archiveW, withURLParam(newRequest(http.MethodPost, "/api/projects/"+created.ID+"/archive", nil), "id", created.ID))
	decodeProject(t, archiveW, http.StatusOK)

	if searchHits() {
		t.Errorf("archived project %s must not appear in project search", created.ID)
	}
}
