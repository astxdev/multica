package handler

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"archive/zip"
	"bytes"

	"github.com/multica-ai/multica/server/internal/logger"
	"github.com/multica-ai/multica/server/internal/util"
	db "github.com/multica-ai/multica/server/pkg/db/generated"
)

type ExportAgentsRequest struct {
	AgentIDs []string `json:"agent_ids"`
}

// ExportAgents handles POST /api/agents/export: bundles the requested
// workspace agents' owner-written instructions into a single zip, one
// folder per agent (INSTRUCTIONS.md). System agents (e.g. Mika) only
// export their workspace-notes half — SystemInstructions is product-owned
// and never leaves the server binary.
//
// An id that doesn't parse, doesn't exist, belongs to another workspace, or
// that the requester cannot access (private-agent gate, same as GetAgent)
// is silently skipped rather than failing the whole export.
func (h *Handler) ExportAgents(w http.ResponseWriter, r *http.Request) {
	var req ExportAgentsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if len(req.AgentIDs) == 0 {
		writeError(w, http.StatusBadRequest, "agent_ids is required")
		return
	}

	workspaceID := h.resolveWorkspaceID(r)
	wsUUID, ok := parseUUIDOrBadRequest(w, workspaceID, "workspace_id")
	if !ok {
		return
	}
	userID := requestUserID(r)
	actorType, actorID := h.resolveActor(r, userID, workspaceID)

	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	usedFolderNames := map[string]int{}
	exported := 0

	for _, id := range req.AgentIDs {
		agentUUID, err := util.ParseUUID(id)
		if err != nil {
			continue
		}
		agent, err := h.Queries.GetAgentInWorkspace(r.Context(), db.GetAgentInWorkspaceParams{
			ID:          agentUUID,
			WorkspaceID: wsUUID,
		})
		if err != nil {
			continue
		}
		if agent.Kind != "user" {
			continue
		}
		if !h.canAccessPrivateAgent(r.Context(), agent, actorType, actorID, workspaceID) {
			continue
		}

		folder := uniqueArchiveFolderName(usedFolderNames, agent.Name)
		if err := writeZipTextEntry(zw, folder+"/INSTRUCTIONS.md", agent.Instructions); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to build export archive")
			return
		}
		exported++
	}

	if exported == 0 {
		_ = zw.Close()
		writeError(w, http.StatusNotFound, "no matching agents found")
		return
	}
	if err := zw.Close(); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to build export archive")
		return
	}

	slog.Info("export agents", append(logger.RequestAttrs(r), "count", exported)...)
	writeZipResponse(w, buf.Bytes(), fmt.Sprintf("agents-export-%s.zip", time.Now().UTC().Format("2006-01-02")))
}
