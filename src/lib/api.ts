// In a real app, you would get this from an environment variable
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export async function getProjects(): Promise<Project[]> {
  const res = await fetch(`${API_URL}/api/projects`);
  if (!res.ok) {
    throw new Error('Failed to fetch projects');
  }
  return res.json();
}

export async function createProject(name: string, prdText: string): Promise<Project> {
  const res = await fetch(`${API_URL}/api/projects`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name, prd_text: prdText }),
  });
  if (!res.ok) {
    throw new Error('Failed to create project');
  }
  return res.json();
}

export async function getProject(id: string): Promise<Project> {
  const res = await fetch(`${API_URL}/api/projects/${id}`);
  if (!res.ok) {
    throw new Error('Failed to fetch project');
  }
  return res.json();
}

export async function updateProjectPRD(id: string, prdText: string): Promise<Project> {
  const res = await fetch(`${API_URL}/api/projects/${id}/prd`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prd_text: prdText }),
  });
  if (!res.ok) {
    throw new Error('Failed to update PRD');
  }
  return res.json();
}

export async function getFeatures(projectId: string) {
  const res = await fetch(`${API_URL}/api/projects/${projectId}/features`);
  if (!res.ok) {
    throw new Error('Failed to fetch features');
  }
  return res.json();
}

export async function updateFeature(id: string, updates: Partial<Feature>) {
  const res = await fetch(`${API_URL}/api/features/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    throw new Error('Failed to update feature');
  }
  return res.json();
}

export async function deleteFeature(id: string) {
  const res = await fetch(`${API_URL}/api/features/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    throw new Error('Failed to delete feature');
  }
  return res.json();
}

export async function getTodos(featureId: string) {
  const res = await fetch(`${API_URL}/api/features/${featureId}/todos`);
  if (!res.ok) {
    throw new Error('Failed to fetch todos');
  }
  return res.json();
}

export async function createTodo(featureId: string, todo: Omit<Todo, 'id'>) {
  const res = await fetch(`${API_URL}/api/features/${featureId}/todos`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(todo),
  });
  if (!res.ok) {
    throw new Error('Failed to create todo');
  }
  return res.json();
}

export async function updateTodo(id: string, updates: Partial<Todo>) {
  const res = await fetch(`${API_URL}/api/todos/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    throw new Error('Failed to update todo');
  }
  return res.json();
}

export async function deleteTodo(id: string) {
  const res = await fetch(`${API_URL}/api/todos/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    throw new Error('Failed to delete todo');
  }
  return res.json();
}

export async function sendChatMessage(projectId: string, message: string, sessionId?: string) {
  const res = await fetch(`${API_URL}/api/projects/${projectId}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message, session_id: sessionId }),
  });
  if (!res.ok) {
    throw new Error('Failed to send chat message');
  }
  return res.json();
}

export async function getGraphData(projectId: string) {
  const res = await fetch(`${API_URL}/api/projects/${projectId}/graph`);
  if (!res.ok) {
    throw new Error('Failed to fetch graph data');
  }
  return res.json();
}

// Types (these should match the backend types)
export interface Project {
  id: string;
  name: string;
  prd_text?: string;
  summary?: string;
  created_at: string;
  updated_at: string;
}

export interface Feature {
  id: string;
  project_id: string;
  title: string;
  description?: string;
  actors: string[];
  entities: string[];
  status: 'draft' | 'ready' | 'in_progress' | 'done';
  order_index: number;
  human_locked: boolean;
  created_at: string;
  updated_at: string;
}

export interface Todo {
  id: string;
  project_id: string;
  feature_id: string;
  title: string;
  detail?: string;
  entities: string[];
  depends_on: string[];
  status: 'open' | 'in_progress' | 'done' | 'blocked';
  order_index: number;
  human_locked: boolean;
  ticket_id?: string;
  ticket_adapter?: 'linear' | 'jira' | 'github';
  created_at: string;
  updated_at: string;
}