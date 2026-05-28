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

export async function deleteProject(id: string): Promise<{ success: boolean }> {
  const res = await fetch(`${API_URL}/api/projects/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    throw new Error('Failed to delete project');
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

export async function getIngestStatus(id: string): Promise<{ status: string; progress: number; message: string }> {
  const res = await fetch(`${API_URL}/api/projects/${id}/ingest/status`);
  if (!res.ok) {
    throw new Error('Failed to fetch ingestion status');
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

export async function getChatHistory(projectId: string): Promise<{ session_id: string; messages: any[] }> {
  const res = await fetch(`${API_URL}/api/projects/${projectId}/chat/history`);
  if (!res.ok) {
    throw new Error('Failed to fetch chat history');
  }
  return res.json();
}

export async function getChatSessions(projectId: string): Promise<any[]> {
  const res = await fetch(`${API_URL}/api/projects/${projectId}/chat/sessions`);
  if (!res.ok) {
    throw new Error('Failed to fetch chat sessions');
  }
  return res.json();
}

export async function createChatSession(projectId: string): Promise<{ session_id: string; messages: any[] }> {
  const res = await fetch(`${API_URL}/api/projects/${projectId}/chat/sessions`, {
    method: 'POST',
  });
  if (!res.ok) {
    throw new Error('Failed to create new chat session');
  }
  return res.json();
}

export async function getChatSessionHistory(projectId: string, sessionId: string): Promise<{ session_id: string; messages: any[] }> {
  const res = await fetch(`${API_URL}/api/projects/${projectId}/chat/sessions/${sessionId}/history`);
  if (!res.ok) {
    throw new Error('Failed to fetch chat session history');
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

export async function getSuggestions(projectId: string) {
  const res = await fetch(`${API_URL}/api/projects/${projectId}/suggestions`);
  if (!res.ok) {
    throw new Error('Failed to fetch suggestions');
  }
  return res.json();
}

export async function applySuggestion(id: string, featureId?: string) {
  const res = await fetch(`${API_URL}/api/suggestions/${id}/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(featureId ? { feature_id: featureId } : {}),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to apply suggestion');
  }
  return res.json();
}

export async function skipSuggestion(id: string) {
  const res = await fetch(`${API_URL}/api/suggestions/${id}/skip`, {
    method: 'POST',
  });
  if (!res.ok) {
    throw new Error('Failed to skip suggestion');
  }
  return res.json();
}


// Types (these should match the backend types)
export interface Project {
  id: string;
  name: string;
  prd_text?: string;
  summary?: string;
  state?: string;
  entity_graph?: any;
  review_state?: string;
  review_questions?: any;
  features?: Feature[];  // Nested features with todos
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
  ticket_id?: string;
  ticket_adapter?: 'linear' | 'jira' | 'github' | 'redmine';
  module?: string;
  confidence?: number;
  critic_notes?: string;
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
  ticket_adapter?: 'linear' | 'jira' | 'github' | 'redmine';
  created_at?: string;
  updated_at?: string;
}

// ==================== Redmine API Functions ====================

export async function getRedmineStatus(projectId?: string) {
  const url = projectId 
    ? `${API_URL}/api/redmine/status?project_id=${projectId}`
    : `${API_URL}/api/redmine/status`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to get Redmine status');
  return res.json();
}

export async function syncProjectToRedmine(projectId: string) {
  const res = await fetch(`${API_URL}/api/projects/${projectId}/sync/redmine`, {
    method: 'POST',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to sync project to Redmine');
  }
  return res.json();
}

export async function syncFeatureToRedmine(featureId: string) {
  const res = await fetch(`${API_URL}/api/features/${featureId}/sync/redmine`, {
    method: 'POST',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to sync feature to Redmine');
  }
  return res.json();
}

export async function syncTodoToRedmine(todoId: string) {
  const res = await fetch(`${API_URL}/api/todos/${todoId}/sync/redmine`, {
    method: 'POST',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to sync todo to Redmine');
  }
  return res.json();
}

export async function sendBrainstormMessage(projectId: string, message: string, sessionId?: string, file?: File) {
  if (file) {
    const formData = new FormData();
    formData.append('file', file);
    if (message) formData.append('message', message);
    if (sessionId) formData.append('session_id', sessionId);

    const res = await fetch(`${API_URL}/api/projects/${projectId}/brainstorm`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Brainstorm failed');
    }
    return res.json();
  }

  const res = await fetch(`${API_URL}/api/projects/${projectId}/brainstorm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, session_id: sessionId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Brainstorm failed');
  }
  return res.json();
}

export async function sendBrainstormCommand(projectId: string, command: string, sessionId?: string) {
  const res = await fetch(`${API_URL}/api/projects/${projectId}/brainstorm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command, session_id: sessionId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Brainstorm command failed');
  }
  return res.json();
}

export async function sendBrainstormMessageStream(
  projectId: string,
  message: string,
  sessionId: string | undefined,
  onToken: (token: string) => void
): Promise<any> {
  const res = await fetch(`${API_URL}/api/projects/${projectId}/brainstorm/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, session_id: sessionId }),
  });
  if (!res.ok || !res.body) throw new Error('Stream request failed');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalData: any = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE lines are separated by \n\n
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';

    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith('data: ')) continue;
      try {
        const evt = JSON.parse(line.slice(6));
        if (evt.type === 'token') onToken(evt.token);
        else if (evt.type === 'done') finalData = evt;
        else if (evt.type === 'error') throw new Error(evt.error);
      } catch (e) { /* skip malformed */ }
    }
  }
  return finalData;
}

export async function clarifyGap(
  projectId: string,
  gapIndex: number,
  answer: string,
  sessionId: string | undefined,
  onToken: (token: string) => void
): Promise<{
  session_id: string;
  state: string;
  resolved: boolean;
  all_gaps_resolved: boolean;
  assistant_response: string;
  gap_index: number;
  next_gap_index: number | null;
} | null> {
  const res = await fetch(`${API_URL}/api/projects/${projectId}/clarify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answer, gap_index: gapIndex, session_id: sessionId }),
  });
  if (!res.ok || !res.body) throw new Error('Clarify request failed');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalData: any = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith('data: ')) continue;
      try {
        const evt = JSON.parse(line.slice(6));
        if (evt.type === 'token') onToken(evt.token);
        else if (evt.type === 'done') finalData = evt;
        else if (evt.type === 'error') throw new Error(evt.error);
      } catch (e) { /* skip malformed */ }
    }
  }
  return finalData;
}


export async function entityFirstExtract(projectId: string) {
  const res = await fetch(`${API_URL}/api/projects/${projectId}/entity-first`, {
    method: 'POST',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Entity-first extraction failed');
  }
  return res.json();
}

export async function getRedmineProjects(projectId?: string) {
  const url = projectId 
    ? `${API_URL}/api/redmine/projects?project_id=${projectId}`
    : `${API_URL}/api/redmine/projects`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to list Redmine projects');
  return res.json();
}

export async function setRedmineProject(projectId: string, redmineProjectIdentifier: string) {
  const res = await fetch(`${API_URL}/api/projects/${projectId}/redmine-project`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ redmine_project_identifier: redmineProjectIdentifier }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to set Redmine project');
  }
  return res.json();
}