-- Backs the list-by-owner lookup (workspace_id, user_id) ordered by
-- creation time. Built concurrently in its own migration file per this
-- repo's index rules.
CREATE INDEX CONCURRENTLY idx_daily_task_workspace_user
    ON daily_task (workspace_id, user_id, created_at);
