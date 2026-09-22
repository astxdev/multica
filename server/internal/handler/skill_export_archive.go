package handler

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/multica-ai/multica/server/internal/logger"
	"github.com/multica-ai/multica/server/internal/util"
	db "github.com/multica-ai/multica/server/pkg/db/generated"
)

type ExportSkillsRequest struct {
	SkillIDs []string `json:"skill_ids"`
}

// ExportSkills handles POST /api/skills/export: bundles the requested
// workspace skills into a single zip, one folder per skill (SKILL.md plus
// any supporting skill_file rows at their original relative paths). The
// layout mirrors what parseSkillArchive (skill_import_archive.go) expects,
// so an exported folder can be re-imported as-is.
//
// Each folder also gets an INSTRUCTIONS.md duplicate of the same primary
// content: some external agent runtimes/tools look for that filename
// instead of SKILL.md, and the skill entity has only one primary-content
// field, so both names are written rather than trying to guess which one
// the destination expects.
//
// IDs that don't parse, don't exist, or belong to another workspace are
// silently skipped (same tolerance as BatchArchiveIssues) rather than
// failing the whole export.
func (h *Handler) ExportSkills(w http.ResponseWriter, r *http.Request) {
	var req ExportSkillsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if len(req.SkillIDs) == 0 {
		writeError(w, http.StatusBadRequest, "skill_ids is required")
		return
	}

	workspaceID := h.resolveWorkspaceID(r)
	wsUUID, ok := parseUUIDOrBadRequest(w, workspaceID, "workspace_id")
	if !ok {
		return
	}

	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	usedFolderNames := map[string]int{}
	exported := 0

	for _, id := range req.SkillIDs {
		skillUUID, err := util.ParseUUID(id)
		if err != nil {
			continue
		}
		skill, err := h.Queries.GetSkillInWorkspace(r.Context(), db.GetSkillInWorkspaceParams{
			ID:          skillUUID,
			WorkspaceID: wsUUID,
		})
		if err != nil {
			continue
		}
		files, err := h.Queries.ListSkillFiles(r.Context(), skill.ID)
		if err != nil {
			slog.Warn("export skills: failed to list skill files", "skill_id", id, "error", err)
			continue
		}

		folder := uniqueArchiveFolderName(usedFolderNames, skill.Name)
		if err := writeZipTextEntry(zw, folder+"/SKILL.md", skill.Content); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to build export archive")
			return
		}
		if err := writeZipTextEntry(zw, folder+"/INSTRUCTIONS.md", skill.Content); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to build export archive")
			return
		}
		for _, f := range files {
			if !validateFilePath(f.Path) {
				continue
			}
			if err := writeZipTextEntry(zw, folder+"/"+f.Path, f.Content); err != nil {
				writeError(w, http.StatusInternalServerError, "failed to build export archive")
				return
			}
		}
		exported++
	}

	if exported == 0 {
		_ = zw.Close()
		writeError(w, http.StatusNotFound, "no matching skills found")
		return
	}
	if err := zw.Close(); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to build export archive")
		return
	}

	slog.Info("export skills", append(logger.RequestAttrs(r), "count", exported)...)
	writeZipResponse(w, buf.Bytes(), fmt.Sprintf("skills-export-%s.zip", time.Now().UTC().Format("2006-01-02")))
}

// uniqueArchiveFolderName turns a skill/agent name into a safe zip folder
// name, disambiguating collisions (two skills sharing a display name, or a
// name that sanitizes to the same string) with a numeric suffix.
func uniqueArchiveFolderName(used map[string]int, name string) string {
	base := sanitizeArchiveEntryName(name)
	if base == "" {
		base = "untitled"
	}
	n := used[base]
	used[base] = n + 1
	if n == 0 {
		return base
	}
	return base + "-" + strconv.Itoa(n+1)
}

// sanitizeArchiveEntryName strips path separators and control characters so
// a skill/agent name can never escape its own folder inside the zip or
// smuggle a zip-slip path.
func sanitizeArchiveEntryName(name string) string {
	name = strings.TrimSpace(name)
	var b strings.Builder
	b.Grow(len(name))
	for _, r := range name {
		switch {
		case r == '/' || r == '\\':
			b.WriteRune('-')
		case r < 0x20 || r == 0x7f:
			// drop control characters
		default:
			b.WriteRune(r)
		}
	}
	return strings.Trim(b.String(), ". ")
}

// writeZipTextEntry writes a single UTF-8 text entry to the archive.
func writeZipTextEntry(zw *zip.Writer, name, content string) error {
	f, err := zw.Create(name)
	if err != nil {
		return err
	}
	_, err = f.Write([]byte(content))
	return err
}

// writeZipResponse streams a finished in-memory zip archive as an
// attachment download.
func writeZipResponse(w http.ResponseWriter, data []byte, filename string) {
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	w.Header().Set("Content-Length", strconv.Itoa(len(data)))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}
