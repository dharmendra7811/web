// Types (these should match the backend types)
export interface Project {
  id: string;
  name: string;
  prd_text?: string;
  summary?: string;
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
  created_at?: string;
  updated_at?: string;
}