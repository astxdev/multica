-- Add archive support to issues (hide from the default Issues view without
-- deleting). archived_at IS NOT NULL means the issue is archived — same
-- convention as agent.archived_at / squad.archived_at.
--
-- No FK on archived_by: relationships are resolved in application code
-- per this repo's migration rules (see CLAUDE.md), unlike the older
-- agent.archived_by REFERENCES "user"(id) this predates.
ALTER TABLE issue ADD COLUMN archived_at TIMESTAMPTZ;
ALTER TABLE issue ADD COLUMN archived_by UUID;
