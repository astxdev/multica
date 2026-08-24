// DailyTask is a personal quick checklist item (Google Keep-style). Scoped
// by workspace_id + user_id on the server — never shared across members of
// the same workspace.
export interface DailyTask {
  id: string;
  workspace_id: string;
  user_id: string;
  text: string;
  done: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateDailyTaskRequest {
  text: string;
}

export interface UpdateDailyTaskRequest {
  done: boolean;
}

export interface ListDailyTasksResponse {
  tasks: DailyTask[];
  total: number;
}
