-- PostgreSQL cannot mark a validated constraint NOT VALID again. Recreate it
-- to restore the state immediately after migration 306 (present, enforcing new
-- writes, not yet validated). Mirrors
-- 260_issue_origin_dingtalk_chat_validate.down.sql.
ALTER TABLE issue DROP CONSTRAINT IF EXISTS issue_status_check;
ALTER TABLE issue ADD CONSTRAINT issue_status_check
    CHECK (status IN ('backlog', 'todo', 'in_progress', 'in_review_internal', 'in_review', 'done', 'blocked', 'cancelled'))
    NOT VALID;
