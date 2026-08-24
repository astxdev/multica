-- name: ListDailyTasks :many
SELECT * FROM daily_task
WHERE workspace_id = $1 AND user_id = $2
ORDER BY done ASC, created_at ASC;

-- name: GetDailyTaskForUser :one
SELECT * FROM daily_task
WHERE id = $1 AND workspace_id = $2 AND user_id = $3;

-- name: CreateDailyTask :one
INSERT INTO daily_task (
    workspace_id, user_id, text
) VALUES (
    $1, $2, $3
) RETURNING *;

-- name: SetDailyTaskDone :one
UPDATE daily_task
SET done = $2,
    updated_at = now()
WHERE id = $1
RETURNING *;

-- name: DeleteDailyTask :exec
DELETE FROM daily_task WHERE id = $1;
