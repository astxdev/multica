-- Partial index for the archived-issues view (?include_archived=true) and
-- for the archive/restore lookups. Archived issues are expected to stay a
-- small minority of the table, so this index is only worth building over
-- the archived rows.
CREATE INDEX CONCURRENTLY idx_issue_workspace_archived_at
    ON issue (workspace_id, archived_at)
    WHERE archived_at IS NOT NULL;
