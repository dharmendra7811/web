-- Requirements OS Database Schema (PostgreSQL)

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  prd_text      TEXT,
  summary       TEXT,
  redmine_project_identifier TEXT,  -- Which Redmine project this syncs to
  review_state  TEXT      DEFAULT 'idle',
  review_questions JSONB,
  review_answers JSONB,
  modules_analyzed JSONB,
  data_model_draft JSONB,
  api_surface_draft JSONB,
  integrations_draft JSONB,
  review_risks JSONB,
  review_assumptions JSONB,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- Features table (epics)
CREATE TABLE IF NOT EXISTS features (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID REFERENCES projects(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  description   TEXT,
  actors        TEXT[]    DEFAULT '{}',
  entities      TEXT[]    DEFAULT '{}',
  status        TEXT      DEFAULT 'draft',
  -- status values: draft | ready | in_progress | done
  order_index   INTEGER   DEFAULT 0,
  human_locked  BOOLEAN   DEFAULT false,
  ticket_id     TEXT,
  ticket_adapter TEXT,
  -- ticket_adapter values: linear | jira | github | redmine
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_features_entities  ON features USING GIN (entities);
CREATE INDEX IF NOT EXISTS idx_features_project   ON features (project_id);

-- Todos table
CREATE TABLE IF NOT EXISTS todos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID REFERENCES projects(id) ON DELETE CASCADE,
  feature_id    UUID REFERENCES features(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  detail        TEXT,
  entities      TEXT[]    DEFAULT '{}',
  depends_on    UUID[]    DEFAULT '{}',
  status        TEXT      DEFAULT 'open',
  -- status values: open | in_progress | done | blocked
  order_index   INTEGER   DEFAULT 0,
  human_locked  BOOLEAN   DEFAULT false,
  ticket_id     TEXT,
  ticket_adapter TEXT,
  -- ticket_adapter values: linear | jira | github | redmine
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_todos_entities    ON todos USING GIN (entities);
CREATE INDEX IF NOT EXISTS idx_todos_feature     ON todos (feature_id);
CREATE INDEX IF NOT EXISTS idx_todos_project     ON todos (project_id);
CREATE INDEX IF NOT EXISTS idx_todos_depends_on  ON todos USING GIN (depends_on);

-- Chat sessions table
CREATE TABLE IF NOT EXISTS chat_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID REFERENCES projects(id) ON DELETE CASCADE,
  status        TEXT DEFAULT 'open',
  -- status values: open | committed | discarded
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Chat messages table
CREATE TABLE IF NOT EXISTS chat_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role          TEXT NOT NULL,
  -- role values: user | assistant
  content       TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Review jobs table for parallel chunk processing
CREATE TABLE IF NOT EXISTS review_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID REFERENCES projects(id) ON DELETE CASCADE,
  module        TEXT NOT NULL,
  status        TEXT DEFAULT 'pending',
  -- status values: pending | done | failed
  result        JSONB,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Impact suggestions table (pending changes from chat)
CREATE TABLE IF NOT EXISTS impact_suggestions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
  project_id      UUID REFERENCES projects(id) ON DELETE CASCADE,
  triggered_by    TEXT,
  -- the user message that triggered this
  target_id       UUID,
  -- feature or todo id, null for new nodes
  target_type     TEXT,
  -- feature | todo
  suggestion_type TEXT,
  -- modify | add | remove | flag
  description     TEXT NOT NULL,
  -- plain english: what will change and why
  proposed_value  JSONB,
  -- the actual new field values to apply
  status          TEXT DEFAULT 'pending',
  -- pending | applied | skipped
  skip_reason     TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers to automatically update updated_at
DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
CREATE TRIGGER update_projects_updated_at
BEFORE UPDATE ON projects
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_features_updated_at ON features;
CREATE TRIGGER update_features_updated_at
BEFORE UPDATE ON features
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_todos_updated_at ON todos;
CREATE TRIGGER update_todos_updated_at
BEFORE UPDATE ON todos
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();