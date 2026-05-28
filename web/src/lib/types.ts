// Types (these should match the backend types)
export interface Project {
  id: string;
  name: string;
  prd_text?: string;
  summary?: string;
  state?: string;
  review_state?: string;
  review_questions?: any;
  pipeline_run_id?: string;
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
  ticket_adapter?: 'linear' | 'jira' | 'github';
  group?: 'BE' | 'FE' | 'Infra' | 'Auth';
  created_at?: string;
  updated_at?: string;
}

export interface PipelineRun {
  id: string;
  project_id: string;
  run_number: number;
  phase: 'idle' | 'chunking' | 'features' | 'critic' | 'awaiting_human' | 'schema' | 'api' | 'todo' | 'done' | 'failed';
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