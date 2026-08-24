-- Daily Tasks: a personal quick checklist per workspace member (Google
-- Keep-style). Purely personal — scoped by workspace_id + user_id, never
-- shared across members of the same workspace. No FK per this repo's
-- migration rules: workspace/user relationships are resolved in
-- application code, not the database.
CREATE TABLE daily_task (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    user_id    UUID NOT NULL,
    text       TEXT NOT NULL,
    done       BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
