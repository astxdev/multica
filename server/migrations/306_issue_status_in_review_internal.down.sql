-- Revert to the pre-in_review_internal issue_status_check list (the set
-- 001_init created; no later migration widened it).
--
-- Narrowing a CHECK can be violated by existing data, so the rows must move
-- before the constraint does. Internal review collapses back into `in_review`
-- — the status it was split out of — which is the only non-lossy target: both
-- mean "delivered, awaiting a reviewer", and folding them loses the
-- internal/external distinction but never the issue's place in the flow.
-- Dropping to in_progress instead would re-open finished work.
--
-- The down path deliberately VALIDATEs in this same file, unlike the up path.
-- The UPDATE above guarantees the scan cannot fail, and a supervised rollback
-- can afford the ACCESS EXCLUSIVE lock for one scan — a silently untrusted
-- constraint would be worse. Same reasoning as
-- 263_issue_origin_wecom_chat.down.sql.
UPDATE issue SET status = 'in_review' WHERE status = 'in_review_internal';
ALTER TABLE issue DROP CONSTRAINT IF EXISTS issue_status_check;
ALTER TABLE issue ADD CONSTRAINT issue_status_check
    CHECK (status IN ('backlog', 'todo', 'in_progress', 'in_review', 'done', 'blocked', 'cancelled'))
    NOT VALID;
ALTER TABLE issue VALIDATE CONSTRAINT issue_status_check;
