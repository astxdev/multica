-- Add archive support to projects (hide from the default Projects view and
-- from project pickers without deleting). archived_at IS NOT NULL means the
-- project is archived — same convention as issue.archived_at /
-- agent.archived_at / squad.archived_at.
--
-- No FK on archived_by: relationships are resolved in application code per
-- this repo's migration rules (see CLAUDE.md).
ALTER TABLE project ADD COLUMN archived_at TIMESTAMPTZ;
ALTER TABLE project ADD COLUMN archived_by UUID;
