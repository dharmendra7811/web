# PRD Agent Pipeline — Design Spec

## Overview

Replace the existing `review_jobs`-based review pipeline with a 5-phase agent pipeline that processes PRDs through a Shared World Model (SWM). Each phase is an LLM-powered agent that reads the current SWM, does its work, and writes back. The pipeline pauses for human input after the Critic phase when conflicts need resolution.

## Architecture

```
PRD Upload → Pipeline Trigger
                ↓
        ┌───────────────┐
        │  Orchestrator  │  (async function, no queue)
        └───────┬───────┘
                ↓
    Phase 1: Chunking Agent
                ↓
    Phase 2: Feature Agents (serialized, one per chunk)
                ↓
    Phase 3: Critic Agent → optional human checkpoint
                ↓
    Phase 4a: Schema Agent
    Phase 4b: API Agent (sequential, after schema)
                ↓
    Phase 5: Todo Agent → writes to features/todos tables
                ↓
            Pipeline Done
```

## Data Model

### New table: `pipeline_runs`

One row per pipeline execution. SWM lives inline.

```sql
CREATE TABLE pipeline_runs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id         UUID REFERENCES projects(id) ON DELETE CASCADE,
  run_number         INTEGER NOT NULL DEFAULT 1,
  phase              TEXT DEFAULT 'idle',
  resume_from_phase  TEXT DEFAULT 'chunking',
  swm                JSONB,
  error              TEXT,
  started_at         TIMESTAMPTZ,
  completed_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_pipeline_runs_project ON pipeline_runs(project_id);
```

Phase values: `idle | chunking | features | critic | awaiting_human | schema | api | todo | done | failed`

Each new run gets `run_number = MAX(run_number) + 1` for the project. New row per run — preserves history.

### New table: `pipeline_checkpoints`

Human-in-the-loop questions from the Critic agent.

```sql
CREATE TABLE pipeline_checkpoints (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id      UUID REFERENCES pipeline_runs(id) ON DELETE CASCADE,
  questions   JSONB NOT NULL,
  answers     JSONB,
  status      TEXT DEFAULT 'pending',
  answered_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

### Migration: `todos` table

Add `group` column:

```sql
ALTER TABLE todos ADD COLUMN IF NOT EXISTS group TEXT;
-- Values: BE | FE | Infra | Auth
```

### SWM Structure

The SWM is a JSON object stored in `pipeline_runs.swm`. It evolves through phases:

```json
{
  "version": 1,
  "prd_chunks": [
    {
      "id": "chunk_1",
      "domain": "auth",
      "tags": ["auth", "users", "sessions"],
      "content": "The system supports user registration..."
    }
  ],
  "entities": {
    "users": {
      "fields": ["id", "email", "password_hash", "created_at"],
      "owned_by": ["auth"],
      "assumptions": ["UUID pk", "email unique", "soft delete"]
    }
  },
  "features": [
    {
      "id": "f1",
      "title": "User registration",
      "description": "New users can register with email/password",
      "domain": "auth",
      "actors": ["user"],
      "entities": ["users"],
      "implicit_features": ["email verification", "password reset"],
      "assumptions": ["email as unique identifier"]
    }
  ],
  "conflicts": [],
  "conflicts_resolved": [
    {
      "id": "c1",
      "type": "entity_mismatch",
      "description": "users defined 2 ways by auth and teams",
      "resolution": "canonical users entity from auth, teams references it",
      "confidence": "high"
    }
  ],
  "assumptions_log": [
    {
      "entity": "users",
      "assumption": "UUID pk",
      "source": "auth chunk",
      "confidence": "high"
    }
  ],
  "gaps": [],
  "schema": [
    {
      "table": "users",
      "columns": [
        { "name": "id", "type": "UUID PRIMARY KEY DEFAULT gen_random_uuid()" },
        { "name": "email", "type": "TEXT UNIQUE NOT NULL" },
        { "name": "password_hash", "type": "TEXT NOT NULL" },
        { "name": "created_at", "type": "TIMESTAMPTZ DEFAULT now()" }
      ]
    }
  ],
  "apis": [
    {
      "method": "POST",
      "endpoint": "/api/auth/register",
      "feature": "f1",
      "schema_backing": ["users"],
      "description": "Register new user"
    }
  ]
}
```

## Agents

All agents follow this contract:

```javascript
// Agent function signature
async function agentName(swm, context) {
  // context = { projectId, runId, query, openai, log }
  // Returns: { swm: updatedSWM, checkpoint?: checkpointData }
}
```

Each agent's model is configurable via environment variables:

```
CHUNKING_MODEL=gpt-4o
FEATURE_MODEL=gpt-4o
CRITIC_MODEL=gpt-4o
SCHEMA_MODEL=gpt-4o
API_MODEL=gpt-4o
TODO_MODEL=gpt-4o
```

Default all to `gpt-4o` via OpenRouter.

### Phase 1: Chunking Agent

**Input:** `projects.prd_text`
**Output:** `swm.prd_chunks[]`

**Prompt strategy:**
- System: "You are a PRD analysis agent. Split the given PRD into domain chunks. Each chunk represents one bounded context (e.g., auth, billing, teams, notifications). Split by semantic boundary, not token length."
- User: PRD text
- Response format: JSON array of `{ id, domain, tags[], content }`

**Validation:** Reject if fewer than 1 chunk or more than 20 chunks. Retry once with adjusted prompt.

### Phase 2: Feature Agents (serialized)

**Input:** Each chunk + full current SWM
**Output:** `swm.features[]`, `swm.entities`, `swm.assumptions_log`

**Execution:** One LLM call per chunk. Full SWM passed each time (not just previous chunk output).

**Prompt strategy:**
- System: "You are a feature extraction agent. Given a domain chunk and the current Shared World Model, extract: (1) explicit features, (2) implicit features the PRD doesn't mention but implies, (3) proposed entities. Before proposing an entity, check if it already exists in the SWM entity registry."
- User: `{ chunk, fullSWM: swm }`
- Response format: `{ features[], newEntities{}, assumptions[] }`

**Entity conflict detection:**
- Entity exists in SWM with same fields → reference it, don't add
- Entity exists with different fields → push to `swm.conflicts`
- Entity is new → add to `swm.entities` with assumptions logged

**Merge logic:** After each chunk, merge results into SWM:
- New features appended
- New entities merged (existing entities not overwritten)
- Assumptions appended
- Conflicts appended

### Phase 3: Critic Agent

**Input:** Full SWM + `swm.conflicts`
**Output:** Clean SWM, optional checkpoint

**Prompt strategy:**
- System: "You are the Critic. Your job is to resolve entity conflicts using opinionated defaults. For each conflict: pick a canonical version, explain why, and state your confidence (high/medium/low). If confidence is low on any conflict, flag it for human review."
- User: `{ conflicts: swm.conflicts, entities: swm.entities, features: swm.features }`
- Response format: `{ resolved_conflicts[], flagged_for_human[], final_entities{} }`

**Checkpoint creation:**
- If any conflict has `confidence: "low"` → create checkpoint with 1-2 questions
- Questions are multiple-choice when possible
- Max 2 questions per checkpoint
- Pipeline pauses: set `phase = 'awaiting_human'`, set `resume_from_phase = 'schema'`

**When user answers checkpoint:**
- Merge answers into SWM
- Set `resume_from_phase = 'schema'`
- Resume pipeline from schema phase

### Phase 4a: Schema Agent

**Input:** `swm.entities`
**Output:** `swm.schema`

**Prompt strategy:**
- System: "You are a database schema agent. Given the entity registry, generate PostgreSQL DDL. Each entity becomes a table. Include: primary keys, foreign keys, indexes, constraints. Use UUID for PKs, TIMESTAMPTZ for timestamps."
- User: `{ entities: swm.entities }`
- Response format: `[{ table, columns: [{ name, type, constraints? }] }]`

**Validation:** Every entity in `swm.entities` must have a corresponding table. Flag gaps in `swm.gaps`.

### Phase 4b: API Agent

**Input:** `swm.features` + `swm.entities` + `swm.schema`
**Output:** `swm.apis`, `swm.gaps`

**Prompt strategy:**
- System: "You are an API design agent. Generate REST endpoints for each feature. Validate: (1) every feature has at least one endpoint, (2) every endpoint references valid schema tables. Flag gaps, don't silently skip."
- User: `{ features: swm.features, entities: swm.entities, schema: swm.schema }`
- Response format: `{ apis: [{ method, endpoint, feature, schema_backing[], description }], gaps: [{ feature, reason }] }`

**Validation:** Cross-check every feature has an API. Cross-check every API's `schema_backing` exists in `swm.schema`.

### Phase 5: Todo Agent

**Input:** Final SWM (features + schema + APIs)
**Output:** Rows in `features` and `todos` tables

**Prompt strategy:**
- System: "You are a todo generation agent. Given the complete SWM, generate development todos grouped by: BE (backend), FE (frontend), Infra (infrastructure), Auth (authentication/authorization). Each feature gets one features row and multiple todos rows."
- User: `{ features: swm.features, schema: swm.schema, apis: swm.apis }`
- Response format: `{ features: [{ title, description, entities, actors, todos: [{ title, detail, group, entities, depends_on }] }] }`

**Mapping — SWM feature → `features` table:**

| SWM field | features column |
|-----------|----------------|
| `feature.title` | `title` |
| `feature.description` | `description` |
| `feature.entities` | `entities` |
| `feature.domain` | `module` |
| `feature.actors` | `actors` |
| derived | `confidence` |
| hardcoded `'draft'` | `status` |
| auto-increment | `order_index` |
| `false` | `human_locked` |

**Mapping — SWM todo → `todos` table:**

| SWM field | todos column |
|-----------|-------------|
| `todo.title` | `title` |
| `todo.detail` | `detail` |
| `todo.entities` | `entities` |
| `todo.depends_on` | `depends_on` |
| `todo.group` | `group` |
| hardcoded `'open'` | `status` |
| auto-increment | `order_index` |
| `false` | `human_locked` |

Each SWM feature creates one `features` row. Each feature's `todos[]` creates N `todos` rows linked by `feature_id`.

## Orchestrator

Simple async function, no queue system. Fire-and-forget with DB state tracking.

```javascript
async function runPipeline(runId, startFromPhase = 'chunking') {
  const run = await loadRun(runId)
  const swm = run.swm || { version: 0, entities: {}, features: [], conflicts: [], assumptions_log: [], gaps: [] }
  const phases = ['chunking', 'features', 'critic', 'schema', 'api', 'todo']
  const startIndex = phases.indexOf(startFromPhase)

  for (let i = startIndex; i < phases.length; i++) {
    const phase = phases[i]
    await updatePhase(runId, phase)

    try {
      let result
      switch (phase) {
        case 'chunking': result = await chunkingAgent(swm, ctx); break
        case 'features': result = await featureAgent(swm, ctx); break
        case 'critic':   result = await criticAgent(swm, ctx); break
        case 'schema':   result = await schemaAgent(swm, ctx); break
        case 'api':      result = await apiAgent(swm, ctx); break
        case 'todo':     result = await todoAgent(swm, ctx); break
      }

      Object.assign(swm, result.swm)
      swm.version++
      await saveSWM(runId, swm)

      if (result.checkpoint) {
        await createCheckpoint(runId, result.checkpoint)
        await updatePhase(runId, 'awaiting_human')
        return  // pause
      }
    } catch (err) {
      await updatePhase(runId, 'failed')
      await saveError(runId, err.message)
      throw err
    }
  }

  await updatePhase(runId, 'done')
  await completeRun(runId)
}
```

### Trigger

When PRD text is uploaded/updated on a project:
1. Insert new `pipeline_runs` row (auto-increment `run_number`)
2. Call `runPipeline(runId)` — async, non-blocking
3. Return run info to frontend immediately

### Resume

When user answers a checkpoint:
1. Save answers to `pipeline_checkpoints`
2. Merge answers into SWM
3. Call `runPipeline(runId, run.resume_from_phase)` — resumes from schema phase

## File Structure

```
server/
  agents/
    chunking.js        # Phase 1
    features.js        # Phase 2
    critic.js          # Phase 3
    schema.js          # Phase 4a
    api.js             # Phase 4b
    todo.js            # Phase 5
    prompts.js         # Shared prompt templates
  orchestrator.js      # runPipeline function
  routes/
    projects.js        # Modified: trigger pipeline on PRD upload
    pipeline.js        # New: pipeline status, checkpoint answers
  migrate-pipeline.js  # New: creates pipeline_runs, pipeline_checkpoints, adds todos.group
```

## API Endpoints

### New endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/projects/:id/pipeline/runs` | List all runs for a project |
| `GET` | `/api/projects/:id/pipeline/runs/:runId` | Get run details + current SWM |
| `GET` | `/api/projects/:id/pipeline/runs/:runId/checkpoint` | Get pending checkpoint |
| `POST` | `/api/projects/:id/pipeline/runs/:runId/checkpoint/answer` | Submit checkpoint answers, resume pipeline |
| `POST` | `/api/projects/:id/pipeline/runs/:runId/retry` | Retry failed run from scratch |

### Modified endpoints

| Method | Path | Change |
|--------|------|--------|
| `POST` | `/api/projects/:id/prd` | After updating PRD text, trigger pipeline |

## Frontend Changes

### Pipeline status display

Show current phase and progress on the project page. Phase indicators:

```
[✓] Chunking  [✓] Features  [✓] Critic  [→] Schema  [ ] API  [ ] Todo
```

### Checkpoint UI

When pipeline is `awaiting_human`:
- Show checkpoint questions in the chat panel
- User answers inline
- Pipeline resumes automatically on answer

### Run history

Show past runs with run_number, phase reached, duration, and whether it succeeded or failed.

## Migration Plan

1. Create `pipeline_runs` and `pipeline_checkpoints` tables
2. Add `group` column to `todos` table
3. Keep existing `review_jobs` table (don't drop yet)
4. Remove old review pipeline code from `routes/projects.js`
5. Wire new pipeline trigger on PRD upload

## Non-Goals (V1)

- No pipeline resume from arbitrary phase (only from after checkpoint)
- No parallel chunk processing
- No streaming LLM responses
- No cost tracking per agent
- No SWM snapshots / version history browsing
- No custom prompt editing by users
