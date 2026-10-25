-- Split review into two stages. `in_review` keeps its meaning and its rows —
-- the external/client-facing review an agent parks delivered work in — and
-- gains a sibling, `in_review_internal`, for the internal review that happens
-- before anything is shown outside the team.
--
-- `in_review` is deliberately NOT renamed. Its string is load-bearing well
-- beyond this table: agent runtime briefings, built-in skills, autopilot run
-- completion, inbox notification gating, and saved issue-view filters
-- (issue_view.filters stores status values as JSON). Renaming it would
-- silently empty every saved view that filters on review.
--
-- The full list is respecified (not just appended) because ADD CONSTRAINT
-- cannot append a value. 001_init created this CHECK inline, so its generated
-- name is issue_status_check and no later migration has rebuilt it.
--
-- The CHECK is only WIDENED (one new allowed value), so every existing row
-- already satisfies it. Add it NOT VALID so this statement takes ACCESS
-- EXCLUSIVE on issue only briefly, without a full-table scan; migration 307
-- runs the VALIDATE under SHARE UPDATE EXCLUSIVE, which does not block reads
-- or writes. issue is a hot core table, so a plain validating ADD here would
-- block all traffic on it for the length of the scan.
--
-- Keep the VALIDATE in its own migration file (the 259/260 pattern), NOT
-- merely as a later statement in this one: the migration runner hands each
-- file to a single conn.Exec, so every statement in a file shares one implicit
-- transaction and the ACCESS EXCLUSIVE taken here would be held until the file
-- finishes — carrying the strong lock straight through the validation scan and
-- defeating the split.
ALTER TABLE issue DROP CONSTRAINT IF EXISTS issue_status_check;
ALTER TABLE issue ADD CONSTRAINT issue_status_check
    CHECK (status IN ('backlog', 'todo', 'in_progress', 'in_review_internal', 'in_review', 'done', 'blocked', 'cancelled'))
    NOT VALID;
