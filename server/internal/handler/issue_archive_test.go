package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// TestIssueTableExcludesArchivedByDefault covers the compileIssueTableQuery
// half of the archive feature: without include_archived, every Issues-screen
// query (rows, groups, facets — they all share this builder) excludes
// archived rows.
func TestIssueTableExcludesArchivedByDefault(t *testing.T) {
	if testHandler == nil {
		t.Skip("database not available")
	}

	spec := issueTableQuerySpec{
		Scope: issueTableScope{Kind: "workspace"},
		Sort:  issueTableSortRequest{Field: "position", Direction: "asc"},
	}

	w := httptest.NewRecorder()
	compiled, ok := testHandler.compileIssueTableQuery(
		w,
		newRequest(http.MethodPost, "/api/issues/table/rows", nil),
		spec,
	)
	if !ok {
		t.Fatalf("compile failed: %d %s", w.Code, w.Body.String())
	}
	if !strings.Contains(compiled.where, "i.archived_at IS NULL") {
		t.Fatalf("expected archived_at IS NULL in default query, got: %q", compiled.where)
	}
}

// TestIssueTableIncludeArchivedSkipsFilter covers the "Show archived" side:
// include_archived=true must drop the archived_at IS NULL predicate.
func TestIssueTableIncludeArchivedSkipsFilter(t *testing.T) {
	if testHandler == nil {
		t.Skip("database not available")
	}

	spec := issueTableQuerySpec{
		Scope:   issueTableScope{Kind: "workspace"},
		Sort:    issueTableSortRequest{Field: "position", Direction: "asc"},
		Filters: issueTableFiltersRequest{IncludeArchived: true},
	}

	w := httptest.NewRecorder()
	compiled, ok := testHandler.compileIssueTableQuery(
		w,
		newRequest(http.MethodPost, "/api/issues/table/rows", nil),
		spec,
	)
	if !ok {
		t.Fatalf("compile failed: %d %s", w.Code, w.Body.String())
	}
	if strings.Contains(compiled.where, "archived_at IS NULL") {
		t.Fatalf("include_archived=true must not filter archived rows, got: %q", compiled.where)
	}
}

// TestArchiveRestoreIssue is the full handler round trip: archive hides the
// issue (archived_at set, second archive rejected with 409), restore
// reverses it (archived_at cleared, second restore rejected with 409).
func TestArchiveRestoreIssue(t *testing.T) {
	if testHandler == nil {
		t.Skip("database not available")
	}
	ctx := context.Background()

	var issueID string
	if err := testPool.QueryRow(ctx, `
		INSERT INTO issue (workspace_id, title, creator_id, creator_type, number)
		VALUES (
			$1, 'archive test issue', $2, 'member',
			(SELECT COALESCE(MAX(number), 0) + 1 FROM issue WHERE workspace_id = $1)
		)
		RETURNING id
	`, testWorkspaceID, testUserID).Scan(&issueID); err != nil {
		t.Fatalf("insert issue: %v", err)
	}
	t.Cleanup(func() { testPool.Exec(ctx, `DELETE FROM issue WHERE id = $1`, issueID) })

	archiveReq := withURLParams(newRequest(http.MethodPost, "/api/issues/"+issueID+"/archive", nil), "id", issueID)
	archiveW := httptest.NewRecorder()
	testHandler.ArchiveIssue(archiveW, archiveReq)
	if archiveW.Code != http.StatusOK {
		t.Fatalf("ArchiveIssue: expected 200, got %d: %s", archiveW.Code, archiveW.Body.String())
	}
	var archived IssueResponse
	if err := json.NewDecoder(archiveW.Body).Decode(&archived); err != nil {
		t.Fatalf("decode archive: %v", err)
	}
	if archived.ArchivedAt == nil {
		t.Error("ArchiveIssue: expected archived_at to be set")
	}
	if archived.ArchivedBy == nil || *archived.ArchivedBy != testUserID {
		t.Errorf("ArchiveIssue: expected archived_by=%s, got %v", testUserID, archived.ArchivedBy)
	}

	// Archiving an already-archived issue is a conflict, not a silent no-op.
	againW := httptest.NewRecorder()
	testHandler.ArchiveIssue(againW, withURLParams(newRequest(http.MethodPost, "/api/issues/"+issueID+"/archive", nil), "id", issueID))
	if againW.Code != http.StatusConflict {
		t.Errorf("ArchiveIssue on already-archived: expected 409, got %d", againW.Code)
	}

	restoreReq := withURLParams(newRequest(http.MethodPost, "/api/issues/"+issueID+"/restore", nil), "id", issueID)
	restoreW := httptest.NewRecorder()
	testHandler.RestoreIssue(restoreW, restoreReq)
	if restoreW.Code != http.StatusOK {
		t.Fatalf("RestoreIssue: expected 200, got %d: %s", restoreW.Code, restoreW.Body.String())
	}
	var restored IssueResponse
	if err := json.NewDecoder(restoreW.Body).Decode(&restored); err != nil {
		t.Fatalf("decode restore: %v", err)
	}
	if restored.ArchivedAt != nil || restored.ArchivedBy != nil {
		t.Errorf("RestoreIssue: expected archived fields cleared, got archived_at=%v archived_by=%v", restored.ArchivedAt, restored.ArchivedBy)
	}

	// Restoring a non-archived issue is a conflict too.
	againRestoreW := httptest.NewRecorder()
	testHandler.RestoreIssue(againRestoreW, withURLParams(newRequest(http.MethodPost, "/api/issues/"+issueID+"/restore", nil), "id", issueID))
	if againRestoreW.Code != http.StatusConflict {
		t.Errorf("RestoreIssue on non-archived: expected 409, got %d", againRestoreW.Code)
	}
}
