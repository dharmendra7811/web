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
  todos?: Todo[];
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
  group?: 'BE' | 'FE' | 'Infra' | 'Auth';
  created_at?: string;
  updated_at?: string;
}

export interface PipelineRun {
  id: string;
  project_id: string;
  run_number: number;
  phase: 'idle' | 'discover' | 'extract' | 'awaiting_modules' | 'done' | 'failed';
  resume_from_phase?: string;
  swm?: SWM;
  error?: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
}

export interface SWM {
  version: number;
  prd_chunks?: Array<{ id: string; domain: string; tags: string[]; content: string }>;
  entities?: Record<string, { fields: string[]; owned_by: string[]; assumptions: string[] }>;
  features?: Array<{
    id: string; title: string; description: string; domain: string;
    actors: string[]; entities: string[];
    implicit_features?: string[]; assumptions?: string[];
  }>;
  conflicts?: Array<{
    id: string; type: string; entity: string; description: string;
    resolved: boolean; resolution?: string;
  }>;
  conflicts_resolved?: Array<any>;
  assumptions_log?: Array<{ entity: string; assumption: string; source: string; confidence: string }>;
  gaps?: Array<{ type?: string; entity?: string; feature_title?: string; reason: string }>;
  schema?: Array<{ table: string; columns: Array<{ name: string; type: string }> }>;
  apis?: Array<{ method: string; endpoint: string; feature_title: string; schema_backing: string[]; description: string }>;
}

export interface PipelineCheckpoint {
  id: string;
  run_id: string;
  questions: Array<{
    id: string; question: string; options?: string[]; context?: string; conflict_id?: string;
  }>;
  answers?: Record<string, string>;
  status: 'pending' | 'answered';
  answered_at?: string;
  created_at: string;
}

// ==================== Pipeline API Functions ====================

export async function getPipelineRuns(projectId: string): Promise<PipelineRun[]> {
  const res = await fetch(`${API_URL}/api/projects/${projectId}/pipeline/runs`);
  if (!res.ok) throw new Error('Failed to fetch pipeline runs');
  return res.json();
}

export async function getPipelineRun(projectId: string, runId: string): Promise<PipelineRun> {
  const res = await fetch(`${API_URL}/api/projects/${projectId}/pipeline/runs/${runId}`);
  if (!res.ok) throw new Error('Failed to fetch pipeline run');
  return res.json();
}

export async function getPipelineCheckpoint(projectId: string, runId: string): Promise<PipelineCheckpoint | null> {
  const res = await fetch(`${API_URL}/api/projects/${projectId}/pipeline/runs/${runId}/checkpoint`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Failed to fetch checkpoint');
  return res.json();
}

export async function submitCheckpointAnswers(projectId: string, runId: string, answers: Record<string, string>): Promise<{ success: boolean }> {
  const res = await fetch(`${API_URL}/api/projects/${projectId}/pipeline/runs/${runId}/checkpoint/answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers }),
  });
  if (!res.ok) throw new Error('Failed to submit checkpoint answers');
  return res.json();
}

export async function retryPipelineRun(projectId: string, runId: string): Promise<{ success: boolean }> {
  const res = await fetch(`${API_URL}/api/projects/${projectId}/pipeline/runs/${runId}/retry`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to retry pipeline run');
  return res.json();
}

export async function reExtractPipeline(projectId: string, runId: string): Promise<{ success: boolean }> {
  const res = await fetch(`${API_URL}/api/projects/${projectId}/pipeline/runs/${runId}/re-extract`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to re-extract');
  return res.json();
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
  // File upload: send as multipart FormData
  if (file) {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_URL}/api/projects/${projectId}/prd`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'PRD upload failed');
    }
    const project = await res.json();
    return {
      session_id: sessionId || '',
      assistant_response: `PRD "${file.name}" uploaded (${(file.size / 1024).toFixed(1)} KB). Pipeline started.`,
      state: project.state || 'parsing',
      questions: [] as any[],
      feature_proposals: [] as any[],
      completion: null as any,
    };
  }

  // Text message: create chat session, return static response (no AI chat endpoint)
  let sid = sessionId;
  if (!sid) {
    const s = await fetch(`${API_URL}/api/projects/${projectId}/chat/sessions`, { method: 'POST' });
    if (s.ok) { const j = await s.json(); sid = j.id; }
  }
  return {
    session_id: sid || sessionId || '',
    assistant_response: 'Use "Extract Entities" or upload a PRD to get started.',
    state: 'exploring',
    questions: [] as any[],
    feature_proposals: [] as any[],
    completion: null as any,
  };
}

export async function sendBrainstormCommand(projectId: string, command: string, sessionId?: string) {
  const cmd = command.toLowerCase();
  const responses: Record<string, { text: string; state: string }> = {
    finalize:      { text: 'Project finalized.', state: 'finalized' },
    unfinalize:    { text: 'Project reopened for editing.', state: 'exploring' },
    skip:          { text: 'Skipped.', state: 'exploring' },
  };
  const match = responses[cmd] || { text: `Command "${command}" processed.`, state: 'exploring' };
  if (cmd.includes('architecture')) {
    match.text = 'Architecture view available in the Architecture tab.';
  }
  return {
    session_id: sessionId || '',
    assistant_response: match.text,
    state: match.state,
    completion: null as any,
  };
}

export async function sendBrainstormMessageStream(
  projectId: string,
  message: string,
  sessionId: string | undefined,
  onToken: (token: string) => void
): Promise<any> {
  const response = await sendBrainstormMessage(projectId, message, sessionId);
  // Simulate streaming
  const words = (response.assistant_response || '').split(' ');
  for (const w of words) onToken(w + ' ');
  return response;
}

export async function clarifyGap(
  projectId: string,
  gapIndex: number,
  answer: string,
  sessionId: string | undefined,
  onToken: (token: string) => void
): Promise<{ session_id: string; state: string; resolved: boolean; all_gaps_resolved: boolean; assistant_response: string; gap_index: number; next_gap_index: number | null } | null> {
  const runs = await getPipelineRuns(projectId);
  const activeRun = runs.find((r: any) => r.phase === 'awaiting_human');
  if (activeRun) {
    const cp = await getPipelineCheckpoint(projectId, activeRun.id);
    if (cp) {
      // cp.questions is [{ id: "q_1", conflict_id: "...", question: "...", ... }]
      const questions = Array.isArray(cp.questions) ? cp.questions : [];
      const q = questions[gapIndex];
      if (!q) {
        onToken('No question at this index. ');
        return { session_id: sessionId || '', state: 'exploring', resolved: true, all_gaps_resolved: true,
          assistant_response: 'All gaps answered.', gap_index: gapIndex, next_gap_index: null };
      }
      // BE resumePipeline expects answers keyed by conflict_id
      const answerKey = q.conflict_id || q.id || `gap_${gapIndex}`;
      await submitCheckpointAnswers(projectId, activeRun.id, { [answerKey]: answer });
      onToken('Answer submitted. ');
      return {
        session_id: sessionId || '',
        state: 'parsing',
        resolved: true,
        all_gaps_resolved: gapIndex + 1 >= questions.length,
        assistant_response: 'Answer submitted. Pipeline resuming...',
        gap_index: gapIndex,
        next_gap_index: gapIndex + 1 < questions.length ? gapIndex + 1 : null,
      };
    }
  }
  onToken('No active checkpoint found. ');
  return {
    session_id: sessionId || '',
    state: 'exploring',
    resolved: true,
    all_gaps_resolved: true,
    assistant_response: 'Gap answered. Run entity extraction to re-analyze.',
    gap_index: gapIndex,
    next_gap_index: null,
  };
}


export async function entityFirstExtract(projectId: string) {
  // Start pipeline
  const res = await fetch(`${API_URL}/api/projects/${projectId}/pipeline/runs`, { method: 'POST' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Pipeline start failed');
  }
  const { run } = await res.json();

  // Poll for completion (max 120s)
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const runsRes = await fetch(`${API_URL}/api/projects/${projectId}/pipeline/runs`);
    if (!runsRes.ok) continue;
    const runs = await runsRes.json();
    const current = runs.find((r: any) => r.id === run.id);
    if (!current) throw new Error('Pipeline run lost');
    if (current.phase === 'done') {
      // Pipeline completed — fetch features
      const featRes = await fetch(`${API_URL}/api/projects/${projectId}/features`);
      const features = featRes.ok ? await featRes.json() : [];
      return {
        needs_clarification: false,
        entity_count: features.reduce((s: number, f: any) => s + (f.entities?.length || 0), 0),
        module_count: [...new Set(features.map((f: any) => f.module))].length,
        features_generated: features.length,
        todos_generated: 0,
        gaps: { coverage_gaps: [] as any[], risky_assumptions: [] as any[] },
        blocking_gaps: [] as any[],
      };
    }
    if (current.phase === 'awaiting_human') {
      // Check for checkpoint questions
      const cpRes = await fetch(`${API_URL}/api/projects/${projectId}/pipeline/runs/${run.id}/checkpoint`);
      const cp = cpRes.ok ? await cpRes.json() : null;
      // cp.questions is [{ id, conflict_id, question, options, context }]
      const questions = Array.isArray(cp?.questions) ? cp.questions : [];
      return {
        needs_clarification: true,
        blocking_gaps: questions.map((q: any) => ({
          area: q.context?.entity || q.id || 'unknown',
          question: q.question || '',
        })),
      };
    }
    if (current.phase === 'failed') {
      throw new Error(current.error || 'Pipeline failed');
    }
  }
  throw new Error('Pipeline timed out');
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