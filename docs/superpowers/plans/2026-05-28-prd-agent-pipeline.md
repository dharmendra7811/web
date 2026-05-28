# PRD Agent Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing review_jobs pipeline with a 5-phase agent pipeline (Chunking → Feature → Critic → Schema → API → Todo) that processes PRDs through a versioned Shared World Model.

**Architecture:** Single async orchestrator function runs 6 agent phases sequentially. SWM stored as JSONB in `pipeline_runs` table. Pipeline pauses after Critic for human conflict resolution. Phase 5 materializes results into existing `features`/`todos` tables.

**Tech Stack:** Fastify (server), PostgreSQL (data + SWM), OpenAI SDK → OpenRouter (LLM calls), Next.js + React (frontend)

---

## File Map

| File | Responsibility |
|------|---------------|
| `server/migrate-pipeline.js` | Create `pipeline_runs`, `pipeline_checkpoints` tables; add `group` to `todos` |
| `server/agents/prompts.js` | All LLM prompt templates, shared across agents |
| `server/agents/chunking.js` | Phase 1: Split PRD into domain chunks |
| `server/agents/features.js` | Phase 2: Extract features + entities per chunk (serialized) |
| `server/agents/critic.js` | Phase 3: Resolve conflicts, flag low-confidence for human |
| `server/agents/schema.js` | Phase 4a: Generate DB schema from entities |
| `server/agents/api.js` | Phase 4b: Generate REST endpoints from features + schema |
| `server/agents/todo.js` | Phase 5: Materialize features + todos into DB tables |
| `server/agents/index.js` | Agent exports barrel file |
| `server/orchestrator.js` | `runPipeline()` — runs all phases, handles pause/resume |
| `server/routes/pipeline.js` | Pipeline API routes (runs, checkpoint, retry) |
| `server/routes/projects.js` | Modify: trigger pipeline on PRD upload |
| `server/index.js` | Register new pipeline routes |
| `web/src/lib/types.ts` | Add PipelineRun, PipelineCheckpoint types |
| `web/src/lib/api.ts` | Add pipeline API functions |
| `web/src/app/components/prd/PipelineStatus.tsx` | Pipeline phase progress indicator |
| `web/src/app/components/prd/CheckpointPanel.tsx` | Human-in-the-loop conflict resolution UI |
| `web/src/app/projects/[id]/page.tsx` | Integrate pipeline status + checkpoint panels |

---

## Task 1: Database Migration

**Files:**
- Create: `server/migrate-pipeline.js`

- [ ] **Step 1: Write migration script**

```javascript
// server/migrate-pipeline.js
const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'requirements_os',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

(async () => {
  console.log('Running pipeline migration...\n');

  // 1. Create pipeline_runs table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pipeline_runs (
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
    )
  `);
  console.log('✓ pipeline_runs table created');

  // 2. Create index on project_id
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_pipeline_runs_project ON pipeline_runs(project_id)
  `);
  console.log('✓ idx_pipeline_runs_project index created');

  // 3. Create pipeline_checkpoints table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pipeline_checkpoints (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      run_id      UUID REFERENCES pipeline_runs(id) ON DELETE CASCADE,
      questions   JSONB NOT NULL,
      answers     JSONB,
      status      TEXT DEFAULT 'pending',
      answered_at TIMESTAMPTZ,
      created_at  TIMESTAMPTZ DEFAULT now()
    )
  `);
  console.log('✓ pipeline_checkpoints table created');

  // 4. Add group column to todos
  await pool.query(`
    ALTER TABLE todos ADD COLUMN IF NOT EXISTS "group" TEXT
  `);
  console.log('✓ todos.group column added');

  // 5. Create index on pipeline_checkpoints run_id
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_pipeline_checkpoints_run ON pipeline_checkpoints(run_id)
  `);
  console.log('✓ idx_pipeline_checkpoints_run index created');

  console.log('\nMigration complete.');
  console.log('pipeline_runs.phase values: idle | chunking | features | critic | awaiting_human | schema | api | todo | done | failed');
  console.log('todos.group values: BE | FE | Infra | Auth');

  await pool.end();
})();
```

- [ ] **Step 2: Run migration**

Run: `cd server && node --env-file=.env migrate-pipeline.js`

Expected output:
```
Running pipeline migration...

✓ pipeline_runs table created
✓ idx_pipeline_runs_project index created
✓ pipeline_checkpoints table created
✓ todos.group column added
✓ idx_pipeline_checkpoints_run index created

Migration complete.
```

- [ ] **Step 3: Verify tables exist**

Run: `cd server && node --env-file=.env -e "const {Pool}=require('pg');const p=new Pool({host:'localhost',port:5432,database:'requirements_os',user:'postgres',password:'postgres'});p.query(\"SELECT column_name,data_type FROM information_schema.columns WHERE table_name='pipeline_runs' ORDER BY ordinal_position\").then(r=>{console.log(r.rows);p.end()})"`

Expected: columns `id`, `project_id`, `run_number`, `phase`, `resume_from_phase`, `swm`, `error`, `started_at`, `completed_at`, `created_at`

- [ ] **Step 4: Commit**

```bash
git add server/migrate-pipeline.js
git commit -m "feat: add pipeline_runs and pipeline_checkpoints migration"
```

---

## Task 2: Agent Contract + Prompts

**Files:**
- Create: `server/agents/prompts.js`
- Create: `server/agents/index.js`

- [ ] **Step 1: Create prompts module**

```javascript
// server/agents/prompts.js

const CHUNKING_SYSTEM = `You are a PRD analysis agent. Your job is to split a Product Requirements Document into domain chunks.

Rules:
- Each chunk represents one bounded context (e.g., auth, billing, teams, notifications, payments)
- Split by SEMANTIC boundary, not token length
- Each chunk must have: id (chunk_1, chunk_2...), domain (lowercase), tags (array of relevant keywords), content (the full text for that domain)
- Minimum 1 chunk, maximum 20 chunks
- Do NOT split mid-sentence or mid-concept
- If the PRD is small and covers one domain, return a single chunk

Return ONLY valid JSON: an array of chunk objects.`;

const CHUNKING_USER = (prdText) => `Split this PRD into domain chunks:

---
${prdText}
---

Return a JSON array: [{"id": "chunk_1", "domain": "auth", "tags": ["auth", "users"], "content": "..."}]`;

const FEATURE_SYSTEM = `You are a feature extraction agent. Given a domain chunk and the current Shared World Model (SWM), extract:

1. **Explicit features** — things the PRD directly describes
2. **Implicit features** — things the PRD implies but doesn't state (e.g., password reset if login exists)
3. **Proposed entities** — data entities this domain needs

For each proposed entity, FIRST check the SWM entity registry:
- If an entity with the same name exists and has compatible fields → reference it, do NOT redefine
- If an entity with the same name exists but has conflicting fields → mark it as a conflict
- If the entity is new → propose it with its fields and assumptions

Return ONLY valid JSON with this structure:
{
  "features": [
    {
      "title": "Feature title",
      "description": "What this feature does",
      "domain": "the chunk domain",
      "actors": ["user", "admin"],
      "entities": ["entity_name_1"],
      "implicit_features": ["implied feature 1"],
      "assumptions": ["assumption about this feature"]
    }
  ],
  "new_entities": {
    "entity_name": {
      "fields": ["id", "field1", "field2"],
      "assumptions": ["UUID pk", "soft delete"]
    }
  },
  "conflicts": [
    {
      "entity": "entity_name",
      "existing_fields": ["id", "email"],
      "proposed_fields": ["id", "email", "username"],
      "reason": "teams chunk adds username field not in auth chunk"
    }
  ],
  "assumptions": [
    {
      "entity": "entity_name",
      "assumption": "UUID pk",
      "confidence": "high"
    }
  ]
}`;

const FEATURE_USER = (chunk, swm) => `## Domain Chunk
Domain: ${chunk.domain}
Tags: ${chunk.tags.join(', ')}

Content:
${chunk.content}

## Current Shared World Model

### Entities Registry:
${JSON.stringify(swm.entities || {}, null, 2)}

### Existing Features:
${JSON.stringify((swm.features || []).map(f => ({ title: f.title, domain: f.domain, entities: f.entities })), null, 2)}

### Existing Conflicts:
${JSON.stringify(swm.conflicts || [], null, 2)}

Extract features, entities, and conflicts from this chunk given the current SWM state.`;

const CRITIC_SYSTEM = `You are the Critic agent. Your job is to resolve entity conflicts in the Shared World Model.

For each conflict:
1. Pick a CANONICAL version of the entity
2. Explain your reasoning
3. State your confidence: high, medium, or low

Rules:
- When entities overlap, MERGE fields — don't discard
- Prefer the version with MORE fields (more complete)
- If two definitions are fundamentally incompatible, pick one and note what's lost
- If your confidence is LOW on any conflict, flag it for human review

Return ONLY valid JSON:
{
  "resolved_conflicts": [
    {
      "conflict_id": "the conflict reference",
      "canonical_entity": {
        "name": "entity_name",
        "fields": ["id", "email", "username"],
        "assumptions": ["UUID pk"]
      },
      "reasoning": "Merged auth and teams definitions. Added username from teams.",
      "confidence": "high"
    }
  ],
  "flagged_for_human": [
    {
      "conflict_id": "the conflict reference",
      "question": "users.role: enum ['admin','member'] or separate roles table?",
      "options": ["enum on users table", "separate roles table"],
      "context": "Auth chunk defines role as enum, teams chunk implies a roles table"
    }
  ],
  "final_entities": {
    "entity_name": {
      "fields": ["id", "email", "username"],
      "assumptions": ["UUID pk"]
    }
  }
}`;

const CRITIC_USER = (swm) => `## Shared World Model

### Entities:
${JSON.stringify(swm.entities || {}, null, 2)}

### Active Conflicts:
${JSON.stringify(swm.conflicts || [], null, 2)}

### Features (for context):
${JSON.stringify((swm.features || []).map(f => ({ title: f.title, domain: f.domain, entities: f.entities })), null, 2)}

Resolve all conflicts. Max 2 questions for human review if needed.`;

const SCHEMA_SYSTEM = `You are a database schema agent. Given an entity registry, generate PostgreSQL table definitions.

Rules:
- Each entity becomes a table
- Use UUID PRIMARY KEY DEFAULT gen_random_uuid() for id columns
- Use TIMESTAMPTZ DEFAULT now() for created_at
- Include foreign keys for entity references
- Add appropriate indexes for foreign keys and commonly queried fields
- Use TEXT for strings, INTEGER for counts, BOOLEAN for flags, JSONB for flexible data
- Include NOT NULL constraints where the field is required

Return ONLY valid JSON: an array of table definitions:
[
  {
    "table": "table_name",
    "columns": [
      {"name": "id", "type": "UUID PRIMARY KEY DEFAULT gen_random_uuid()"},
      {"name": "name", "type": "TEXT NOT NULL"},
      {"name": "created_at", "type": "TIMESTAMPTZ DEFAULT now()"}
    ],
    "indexes": ["CREATE INDEX idx_table_field ON table(field)"],
    "foreign_keys": [{"column": "user_id", "references": "users(id)"}]
  }
]`;

const SCHEMA_USER = (entities) => `## Entity Registry

${JSON.stringify(entities, null, 2)}

Generate PostgreSQL table definitions for all entities above.`;

const API_SYSTEM = `You are an API design agent. Given features, entities, and database schema, generate REST API endpoints.

Rules:
- Every feature MUST have at least one endpoint
- Use standard REST conventions: GET for read, POST for create, PUT/PATCH for update, DELETE for remove
- Endpoint paths follow pattern: /api/{resource} or /api/{resource}/:id
- Every endpoint must reference which schema tables it reads/writes
- Flag any feature that cannot be mapped to an endpoint as a gap
- Do NOT silently skip features

Return ONLY valid JSON:
{
  "apis": [
    {
      "method": "POST",
      "endpoint": "/api/auth/register",
      "feature_title": "User registration",
      "schema_backing": ["users"],
      "description": "Register a new user account",
      "request_body": {"email": "string", "password": "string"},
      "response": {"id": "uuid", "email": "string"}
    }
  ],
  "gaps": [
    {
      "feature_title": "Feature name",
      "reason": "Why no endpoint was generated"
    }
  ]
}`;

const API_USER = (features, entities, schema) => `## Features
${JSON.stringify(features.map(f => ({ title: f.title, description: f.description, domain: f.domain, entities: f.entities })), null, 2)}

## Entities
${JSON.stringify(entities, null, 2)}

## Database Schema
${JSON.stringify(schema, null, 2)}

Generate REST endpoints for all features. Validate every feature has an API and every API has schema backing.`;

const TODO_SYSTEM = `You are a todo generation agent. Given the complete Shared World Model, generate development todos.

Rules:
- Each SWM feature becomes ONE feature entry with MULTIPLE todos
- Group each todo into one of: BE (backend), FE (frontend), Infra (infrastructure), Auth (authentication/authorization)
- Todos should be concrete, actionable tasks (not vague "implement feature X")
- Include entity references for each todo
- Express dependencies between todos where they exist (e.g., "API endpoint must exist before frontend can call it")
- Order todos by dependency (foundational work first)

Return ONLY valid JSON:
{
  "features": [
    {
      "title": "Feature title from SWM",
      "description": "Feature description from SWM",
      "entities": ["entity1", "entity2"],
      "actors": ["user"],
      "module": "the domain",
      "confidence": 0.8,
      "todos": [
        {
          "title": "Create users table with email/password columns",
          "detail": "Run migration to create users table. Include id (UUID PK), email (unique), password_hash, created_at.",
          "group": "BE",
          "entities": ["users"],
          "depends_on": []
        }
      ]
    }
  ]
}`;

const TODO_USER = (swm) => `## Features
${JSON.stringify(swm.features, null, 2)}

## Database Schema
${JSON.stringify(swm.schema, null, 2)}

## API Endpoints
${JSON.stringify(swm.apis, null, 2)}

## Entities
${JSON.stringify(swm.entities, null, 2)}

Generate concrete development todos grouped by BE/FE/Infra/Auth for each feature.`;

module.exports = {
  CHUNKING_SYSTEM, CHUNKING_USER,
  FEATURE_SYSTEM, FEATURE_USER,
  CRITIC_SYSTEM, CRITIC_USER,
  SCHEMA_SYSTEM, SCHEMA_USER,
  API_SYSTEM, API_USER,
  TODO_SYSTEM, TODO_USER,
};
```

- [ ] **Step 2: Create agents barrel file**

```javascript
// server/agents/index.js
module.exports = {
  chunkingAgent: require('./chunking'),
  featureAgent: require('./features'),
  criticAgent: require('./critic'),
  schemaAgent: require('./schema'),
  apiAgent: require('./api'),
  todoAgent: require('./todo'),
};
```

- [ ] **Step 3: Commit**

```bash
git add server/agents/prompts.js server/agents/index.js
git commit -m "feat: add agent prompt templates and barrel exports"
```

---

## Task 3: Chunking Agent (Phase 1)

**Files:**
- Create: `server/agents/chunking.js`

- [ ] **Step 1: Implement chunking agent**

```javascript
// server/agents/chunking.js
const { CHUNKING_SYSTEM, CHUNKING_USER } = require('./prompts');

/**
 * Phase 1: Split PRD into domain chunks.
 * @param {object} swm - Current Shared World Model
 * @param {object} ctx - { projectId, runId, query, openai, log, config }
 * @returns {Promise<{swm: object}>}
 */
async function chunkingAgent(swm, ctx) {
  const { query, openai, log, config } = ctx;
  const model = config.CHUNKING_MODEL || 'openai/gpt-4o';

  // Get PRD text
  const { rows } = await query('SELECT prd_text FROM projects WHERE id = $1', [ctx.projectId]);
  if (!rows[0]?.prd_text) {
    throw new Error('No PRD text found for project');
  }
  const prdText = rows[0].prd_text;

  log('chunking', `Processing PRD (${prdText.length} chars)`);

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: CHUNKING_SYSTEM },
      { role: 'user', content: CHUNKING_USER(prdText) },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
  });

  const content = response.choices[0].message.content;
  let chunks;

  try {
    const parsed = JSON.parse(content);
    chunks = Array.isArray(parsed) ? parsed : parsed.chunks || parsed.data || [];
  } catch (err) {
    throw new Error(`Chunking agent returned invalid JSON: ${err.message}`);
  }

  // Validate
  if (!Array.isArray(chunks) || chunks.length === 0) {
    throw new Error('Chunking agent returned no chunks');
  }
  if (chunks.length > 20) {
    throw new Error(`Chunking agent returned too many chunks: ${chunks.length}`);
  }

  // Normalize chunk IDs
  chunks = chunks.map((chunk, i) => ({
    id: chunk.id || `chunk_${i + 1}`,
    domain: (chunk.domain || `domain_${i + 1}`).toLowerCase(),
    tags: (chunk.tags || []).map(t => t.toLowerCase()),
    content: chunk.content || '',
  }));

  log('chunking', `Extracted ${chunks.length} domain chunks: ${chunks.map(c => c.domain).join(', ')}`);

  return {
    swm: { ...swm, prd_chunks: chunks },
  };
}

module.exports = chunkingAgent;
```

- [ ] **Step 2: Commit**

```bash
git add server/agents/chunking.js
git commit -m "feat: implement chunking agent (phase 1)"
```

---

## Task 4: Feature Agent (Phase 2)

**Files:**
- Create: `server/agents/features.js`

- [ ] **Step 1: Implement feature agent**

```javascript
// server/agents/features.js
const { FEATURE_SYSTEM, FEATURE_USER } = require('./prompts');

/**
 * Phase 2: Extract features and entities from each chunk (serialized).
 * One LLM call per chunk. Full SWM passed each time.
 * @param {object} swm - Current Shared World Model
 * @param {object} ctx - { projectId, runId, query, openai, log, config }
 * @returns {Promise<{swm: object}>}
 */
async function featureAgent(swm, ctx) {
  const { openai, log, config } = ctx;
  const model = config.FEATURE_MODEL || 'openai/gpt-4o';

  const chunks = swm.prd_chunks || [];
  if (chunks.length === 0) {
    throw new Error('No PRD chunks found in SWM');
  }

  // Deep clone SWM for mutation
  const workingSWM = {
    ...swm,
    entities: { ...(swm.entities || {}) },
    features: [...(swm.features || [])],
    conflicts: [...(swm.conflicts || [])],
    assumptions_log: [...(swm.assumptions_log || [])],
  };

  for (const chunk of chunks) {
    log('features', `Processing chunk: ${chunk.domain} (${chunk.id})`);

    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: FEATURE_SYSTEM },
        { role: 'user', content: FEATURE_USER(chunk, workingSWM) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const content = response.choices[0].message.content;
    let result;

    try {
      result = JSON.parse(content);
    } catch (err) {
      throw new Error(`Feature agent returned invalid JSON for chunk ${chunk.domain}: ${err.message}`);
    }

    // Merge features
    const newFeatures = (result.features || []).map((f, i) => ({
      id: `f_${workingSWM.features.length + i + 1}`,
      title: f.title,
      description: f.description || '',
      domain: chunk.domain,
      actors: (f.actors || []).map(a => a.toLowerCase()),
      entities: (f.entities || []).map(e => e.toLowerCase()),
      implicit_features: f.implicit_features || [],
      assumptions: f.assumptions || [],
    }));
    workingSWM.features.push(...newFeatures);

    // Merge entities (don't overwrite existing)
    for (const [entityName, entityDef] of Object.entries(result.new_entities || {})) {
      const normalizedName = entityName.toLowerCase();
      if (!workingSWM.entities[normalizedName]) {
        workingSWM.entities[normalizedName] = {
          fields: entityDef.fields || [],
          owned_by: [chunk.domain],
          assumptions: entityDef.assumptions || [],
        };
      } else {
        // Entity exists — add this domain as owner if not already there
        if (!workingSWM.entities[normalizedName].owned_by.includes(chunk.domain)) {
          workingSWM.entities[normalizedName].owned_by.push(chunk.domain);
        }
        // Merge new fields that don't exist
        const existingFields = new Set(workingSWM.entities[normalizedName].fields);
        for (const field of (entityDef.fields || [])) {
          if (!existingFields.has(field)) {
            workingSWM.entities[normalizedName].fields.push(field);
          }
        }
      }
    }

    // Append conflicts
    const newConflicts = (result.conflicts || []).map((c, i) => ({
      id: `conflict_${workingSWM.conflicts.length + i + 1}`,
      type: 'entity_mismatch',
      entity: c.entity?.toLowerCase(),
      existing_fields: c.existing_fields,
      proposed_fields: c.proposed_fields,
      description: c.reason || `${c.entity} defined differently across chunks`,
      resolved: false,
      resolution: null,
    }));
    workingSWM.conflicts.push(...newConflicts);

    // Append assumptions
    const newAssumptions = (result.assumptions || []).map(a => ({
      entity: a.entity?.toLowerCase(),
      assumption: a.assumption,
      source: chunk.domain,
      confidence: a.confidence || 'medium',
    }));
    workingSWM.assumptions_log.push(...newAssumptions);

    log('features', `  → ${newFeatures.length} features, ${Object.keys(result.new_entities || {}).length} entities, ${newConflicts.length} conflicts`);
  }

  log('features', `Total: ${workingSWM.features.length} features, ${Object.keys(workingSWM.entities).length} entities, ${workingSWM.conflicts.length} conflicts`);

  return { swm: workingSWM };
}

module.exports = featureAgent;
```

- [ ] **Step 2: Commit**

```bash
git add server/agents/features.js
git commit -m "feat: implement feature agent (phase 2) with serialized chunk processing"
```

---

## Task 5: Critic Agent (Phase 3)

**Files:**
- Create: `server/agents/critic.js`

- [ ] **Step 1: Implement critic agent**

```javascript
// server/agents/critic.js
const { CRITIC_SYSTEM, CRITIC_USER } = require('./prompts');

/**
 * Phase 3: Resolve conflicts, flag low-confidence ones for human review.
 * @param {object} swm - Current Shared World Model
 * @param {object} ctx - { projectId, runId, query, openai, log, config }
 * @returns {Promise<{swm: object, checkpoint?: object}>}
 */
async function criticAgent(swm, ctx) {
  const { openai, log, config } = ctx;
  const model = config.CRITIC_MODEL || 'openai/gpt-4o';

  const conflicts = swm.conflicts || [];
  const unresolved = conflicts.filter(c => !c.resolved);

  if (unresolved.length === 0) {
    log('critic', 'No unresolved conflicts. Skipping.');
    return { swm };
  }

  log('critic', `Resolving ${unresolved.length} conflicts`);

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: CRITIC_SYSTEM },
      { role: 'user', content: CRITIC_USER(swm) },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  });

  const content = response.choices[0].message.content;
  let result;

  try {
    result = JSON.parse(content);
  } catch (err) {
    throw new Error(`Critic agent returned invalid JSON: ${err.message}`);
  }

  // Apply resolved conflicts
  const workingSWM = { ...swm };
  workingSWM.conflicts_resolved = [...(swm.conflicts_resolved || [])];

  for (const resolved of (result.resolved_conflicts || [])) {
    const conflictIdx = workingSWM.conflicts.findIndex(c => c.id === resolved.conflict_id);
    if (conflictIdx >= 0) {
      workingSWM.conflicts[conflictIdx] = {
        ...workingSWM.conflicts[conflictIdx],
        resolved: true,
        resolution: resolved.reasoning,
        confidence: resolved.confidence,
      };
      workingSWM.conflicts_resolved.push(workingSWM.conflicts[conflictIdx]);
    }

    // Apply canonical entity
    if (resolved.canonical_entity) {
      const name = resolved.canonical_entity.name.toLowerCase();
      workingSWM.entities = { ...workingSWM.entities };
      workingSWM.entities[name] = {
        fields: resolved.canonical_entity.fields,
        owned_by: workingSWM.entities[name]?.owned_by || ['critic'],
        assumptions: resolved.canonical_entity.assumptions || [],
      };
    }
  }

  // Apply final entities from critic
  if (result.final_entities) {
    workingSWM.entities = { ...workingSWM.entities };
    for (const [name, def] of Object.entries(result.final_entities)) {
      workingSWM.entities[name.toLowerCase()] = {
        fields: def.fields || [],
        owned_by: workingSWM.entities[name.toLowerCase()]?.owned_by || ['critic'],
        assumptions: def.assumptions || [],
      };
    }
  }

  // Remove resolved from active conflicts
  workingSWM.conflicts = workingSWM.conflicts.filter(c => !c.resolved);

  const resolvedCount = (result.resolved_conflicts || []).length;
  const flaggedCount = (result.flagged_for_human || []).length;
  log('critic', `Resolved ${resolvedCount} conflicts, ${flaggedCount} flagged for human`);

  // If there are flagged conflicts, create checkpoint
  if (flaggedCount > 0 && result.flagged_for_human.length > 0) {
    const questions = result.flagged_for_human.slice(0, 2).map((f, i) => ({
      id: `q_${i + 1}`,
      question: f.question,
      options: f.options || [],
      context: f.context || '',
      conflict_id: f.conflict_id,
    }));

    log('critic', `Pausing pipeline for human review (${questions.length} questions)`);

    return {
      swm: workingSWM,
      checkpoint: { questions },
    };
  }

  return { swm: workingSWM };
}

module.exports = criticAgent;
```

- [ ] **Step 2: Commit**

```bash
git add server/agents/critic.js
git commit -m "feat: implement critic agent (phase 3) with conflict resolution and checkpoint"
```

---

## Task 6: Schema Agent (Phase 4a)

**Files:**
- Create: `server/agents/schema.js`

- [ ] **Step 1: Implement schema agent**

```javascript
// server/agents/schema.js
const { SCHEMA_SYSTEM, SCHEMA_USER } = require('./prompts');

/**
 * Phase 4a: Generate DB schema from entity registry.
 * @param {object} swm - Current Shared World Model
 * @param {object} ctx - { projectId, runId, query, openai, log, config }
 * @returns {Promise<{swm: object}>}
 */
async function schemaAgent(swm, ctx) {
  const { openai, log, config } = ctx;
  const model = config.SCHEMA_MODEL || 'openai/gpt-4o';

  const entities = swm.entities || {};
  const entityNames = Object.keys(entities);

  if (entityNames.length === 0) {
    log('schema', 'No entities in SWM. Skipping.');
    return { swm: { ...swm, schema: [] } };
  }

  log('schema', `Generating schema for ${entityNames.length} entities`);

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: SCHEMA_SYSTEM },
      { role: 'user', content: SCHEMA_USER(entities) },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  });

  const content = response.choices[0].message.content;
  let tables;

  try {
    const parsed = JSON.parse(content);
    tables = Array.isArray(parsed) ? parsed : parsed.tables || parsed.schema || [];
  } catch (err) {
    throw new Error(`Schema agent returned invalid JSON: ${err.message}`);
  }

  // Validate: every entity should have a table
  const tableNames = new Set(tables.map(t => t.table?.toLowerCase()));
  const gaps = [];
  for (const entityName of entityNames) {
    if (!tableNames.has(entityName)) {
      gaps.push({
        type: 'missing_table',
        entity: entityName,
        reason: `No table generated for entity "${entityName}"`,
      });
    }
  }

  if (gaps.length > 0) {
    log('schema', `Warning: ${gaps.length} entities without tables`);
  }

  log('schema', `Generated ${tables.length} tables`);

  return {
    swm: {
      ...swm,
      schema: tables,
      gaps: [...(swm.gaps || []), ...gaps],
    },
  };
}

module.exports = schemaAgent;
```

- [ ] **Step 2: Commit**

```bash
git add server/agents/schema.js
git commit -m "feat: implement schema agent (phase 4a)"
```

---

## Task 7: API Agent (Phase 4b)

**Files:**
- Create: `server/agents/api.js`

- [ ] **Step 1: Implement API agent**

```javascript
// server/agents/api.js
const { API_SYSTEM, API_USER } = require('./prompts');

/**
 * Phase 4b: Generate REST endpoints from features + schema.
 * Must run AFTER schema agent.
 * @param {object} swm - Current Shared World Model (must have swm.schema)
 * @param {object} ctx - { projectId, runId, query, openai, log, config }
 * @returns {Promise<{swm: object}>}
 */
async function apiAgent(swm, ctx) {
  const { openai, log, config } = ctx;
  const model = config.API_MODEL || 'openai/gpt-4o';

  const features = swm.features || [];
  const entities = swm.entities || {};
  const schema = swm.schema || [];

  if (features.length === 0) {
    log('api', 'No features in SWM. Skipping.');
    return { swm: { ...swm, apis: [] } };
  }

  log('api', `Generating APIs for ${features.length} features`);

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: API_SYSTEM },
      { role: 'user', content: API_USER(features, entities, schema) },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
  });

  const content = response.choices[0].message.content;
  let result;

  try {
    result = JSON.parse(content);
  } catch (err) {
    throw new Error(`API agent returned invalid JSON: ${err.message}`);
  }

  const apis = result.apis || [];
  const gaps = result.gaps || [];

  // Validate: every feature should have at least one API
  const featureTitles = new Set(features.map(f => f.title));
  const coveredFeatures = new Set(apis.map(a => a.feature_title));
  for (const title of featureTitles) {
    if (!coveredFeatures.has(title)) {
      gaps.push({
        feature_title: title,
        reason: 'No endpoint generated for this feature',
      });
    }
  }

  if (gaps.length > 0) {
    log('api', `Warning: ${gaps.length} features without API coverage`);
  }

  log('api', `Generated ${apis.length} endpoints, ${gaps.length} gaps`);

  return {
    swm: {
      ...swm,
      apis,
      gaps: [...(swm.gaps || []), ...gaps],
    },
  };
}

module.exports = apiAgent;
```

- [ ] **Step 2: Commit**

```bash
git add server/agents/api.js
git commit -m "feat: implement API agent (phase 4b) with schema validation"
```

---

## Task 8: Todo Agent (Phase 5)

**Files:**
- Create: `server/agents/todo.js`

- [ ] **Step 1: Implement todo agent**

```javascript
// server/agents/todo.js
const { TODO_SYSTEM, TODO_USER } = require('./prompts');

/**
 * Phase 5: Materialize features + todos into DB tables.
 * This is the ONLY phase that writes to user-facing tables.
 * @param {object} swm - Current Shared World Model
 * @param {object} ctx - { projectId, runId, query, openai, log, config }
 * @returns {Promise<{swm: object}>}
 */
async function todoAgent(swm, ctx) {
  const { query, openai, log, config } = ctx;
  const model = config.TODO_MODEL || 'openai/gpt-4o';

  const features = swm.features || [];
  if (features.length === 0) {
    log('todo', 'No features in SWM. Skipping.');
    return { swm };
  }

  log('todo', `Generating todos for ${features.length} features`);

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: TODO_SYSTEM },
      { role: 'user', content: TODO_USER(swm) },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
  });

  const content = response.choices[0].message.content;
  let result;

  try {
    result = JSON.parse(content);
  } catch (err) {
    throw new Error(`Todo agent returned invalid JSON: ${err.message}`);
  }

  const generatedFeatures = result.features || [];
  log('todo', `Generated ${generatedFeatures.length} feature groups`);

  // Materialize into DB
  let totalTodos = 0;
  let orderIndex = 0;

  for (const feat of generatedFeatures) {
    const entities = (feat.entities || []).map(e => e.toLowerCase());
    const actors = (feat.actors || []).map(a => a.toLowerCase());

    // Get current max order_index
    const countRes = await query(
      'SELECT COALESCE(MAX(order_index), -1) + 1 as next_idx FROM features WHERE project_id = $1',
      [ctx.projectId]
    );
    const featureOrderIdx = countRes.rows[0].next_idx;

    // Insert feature
    const featRes = await query(
      `INSERT INTO features (project_id, title, description, actors, entities, status, order_index, human_locked, module, confidence)
       VALUES ($1, $2, $3, $4, $5, 'draft', $6, false, $7, $8)
       RETURNING id`,
      [
        ctx.projectId,
        feat.title,
        feat.description || '',
        actors,
        entities,
        featureOrderIdx,
        feat.module || swm.prd_chunks?.[0]?.domain || 'general',
        feat.confidence || 0.8,
      ]
    );
    const featureId = featRes.rows[0].id;

    // Insert todos
    const todos = feat.todos || [];
    for (let i = 0; i < todos.length; i++) {
      const todo = todos[i];
      const todoEntities = (todo.entities || []).map(e => e.toLowerCase());

      await query(
        `INSERT INTO todos (project_id, feature_id, title, detail, entities, depends_on, status, order_index, human_locked, "group")
         VALUES ($1, $2, $3, $4, $5, $6, 'open', $7, false, $8)`,
        [
          ctx.projectId,
          featureId,
          todo.title,
          todo.detail || '',
          todoEntities,
          todo.depends_on || [],
          i,
          todo.group || 'BE',
        ]
      );
      totalTodos++;
    }

    log('todo', `  → Feature "${feat.title}": ${todos.length} todos`);
  }

  log('todo', `Materialized ${generatedFeatures.length} features, ${totalTodos} todos`);

  return { swm };
}

module.exports = todoAgent;
```

- [ ] **Step 2: Commit**

```bash
git add server/agents/todo.js
git commit -m "feat: implement todo agent (phase 5) with DB materialization"
```

---

## Task 9: Orchestrator

**Files:**
- Create: `server/orchestrator.js`

- [ ] **Step 1: Implement orchestrator**

```javascript
// server/orchestrator.js
const { chunkingAgent, featureAgent, criticAgent, schemaAgent, apiAgent, todoAgent } = require('./agents');
const OpenAI = require('openai');

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

/**
 * Create an OpenAI client pointing to OpenRouter.
 */
function createOpenAI() {
  return new OpenAI({
    baseURL: OPENROUTER_BASE_URL,
    apiKey: process.env.OPENROUTER_API_KEY || 'dummy-key',
    defaultHeaders: {
      'HTTP-Referer': 'http://localhost:3000',
      'X-Title': 'Requirements OS Pipeline',
    },
  });
}

/**
 * Load agent model config from env vars.
 */
function loadConfig() {
  return {
    CHUNKING_MODEL: process.env.CHUNKING_MODEL || 'openai/gpt-4o',
    FEATURE_MODEL: process.env.FEATURE_MODEL || 'openai/gpt-4o',
    CRITIC_MODEL: process.env.CRITIC_MODEL || 'openai/gpt-4o',
    SCHEMA_MODEL: process.env.SCHEMA_MODEL || 'openai/gpt-4o',
    API_MODEL: process.env.API_MODEL || 'openai/gpt-4o',
    TODO_MODEL: process.env.TODO_MODEL || 'openai/gpt-4o',
  };
}

const PHASE_ORDER = ['chunking', 'features', 'critic', 'schema', 'api', 'todo'];

const PHASE_MAP = {
  chunking: chunkingAgent,
  features: featureAgent,
  critic: criticAgent,
  schema: schemaAgent,
  api: apiAgent,
  todo: todoAgent,
};

/**
 * Update the phase on a pipeline run.
 */
async function updatePhase(query, runId, phase) {
  await query(
    'UPDATE pipeline_runs SET phase = $1 WHERE id = $2',
    [phase, runId]
  );
}

/**
 * Save SWM to pipeline run.
 */
async function saveSWM(query, runId, swm) {
  await query(
    'UPDATE pipeline_runs SET swm = $1 WHERE id = $2',
    [JSON.stringify(swm), runId]
  );
}

/**
 * Save error to pipeline run and mark as failed.
 */
async function saveError(query, runId, error) {
  await query(
    "UPDATE pipeline_runs SET phase = 'failed', error = $1, completed_at = NOW() WHERE id = $2",
    [error, runId]
  );
}

/**
 * Complete a pipeline run.
 */
async function completeRun(query, runId) {
  await query(
    "UPDATE pipeline_runs SET phase = 'done', completed_at = NOW() WHERE id = $1",
    [runId]
  );
}

/**
 * Create a checkpoint for human review.
 */
async function createCheckpoint(query, runId, checkpoint) {
  await query(
    'INSERT INTO pipeline_checkpoints (run_id, questions) VALUES ($1, $2)',
    [runId, JSON.stringify(checkpoint.questions)]
  );
}

/**
 * Run the full pipeline from a given phase.
 * @param {string} runId - pipeline_runs.id
 * @param {string} startFromPhase - phase to start from (default: 'chunking')
 * @param {Function} query - PG query function
 */
async function runPipeline(runId, startFromPhase = 'chunking', query) {
  const openai = createOpenAI();
  const config = loadConfig();

  const log = (phase, msg) => {
    console.log(`[Pipeline:${runId.slice(0, 8)}] [${phase}] ${msg}`);
  };

  // Load run
  const runRes = await query('SELECT * FROM pipeline_runs WHERE id = $1', [runId]);
  if (runRes.rows.length === 0) {
    throw new Error(`Pipeline run not found: ${runId}`);
  }
  const run = runRes.rows[0];

  // Initialize SWM
  const swm = run.swm || {
    version: 0,
    entities: {},
    features: [],
    conflicts: [],
    conflicts_resolved: [],
    assumptions_log: [],
    gaps: [],
    prd_chunks: [],
    schema: null,
    apis: null,
  };

  const ctx = {
    projectId: run.project_id,
    runId,
    query,
    openai,
    log,
    config,
  };

  const startIndex = PHASE_ORDER.indexOf(startFromPhase);
  if (startIndex === -1) {
    throw new Error(`Invalid start phase: ${startFromPhase}`);
  }

  // Set started_at if not set
  if (!run.started_at) {
    await query('UPDATE pipeline_runs SET started_at = NOW() WHERE id = $1', [runId]);
  }

  for (let i = startIndex; i < PHASE_ORDER.length; i++) {
    const phaseName = PHASE_ORDER[i];
    const agentFn = PHASE_MAP[phaseName];

    await updatePhase(query, runId, phaseName);
    log(phaseName, `Starting phase`);

    try {
      const result = await agentFn(swm, ctx);

      // Merge SWM updates
      Object.assign(swm, result.swm);
      swm.version = (swm.version || 0) + 1;
      await saveSWM(query, runId, swm);

      // Check for checkpoint (critic only)
      if (result.checkpoint) {
        await createCheckpoint(query, runId, result.checkpoint);
        await query(
          "UPDATE pipeline_runs SET phase = 'awaiting_human', resume_from_phase = 'schema' WHERE id = $1",
          [runId]
        );
        log(phaseName, 'Pipeline paused for human review');
        return; // Pause
      }

      log(phaseName, 'Phase complete');
    } catch (err) {
      log(phaseName, `Error: ${err.message}`);
      await saveError(query, runId, err.message);
      throw err;
    }
  }

  await completeRun(query, runId);
  log('done', 'Pipeline complete');
}

/**
 * Resume pipeline after human answers checkpoint.
 * @param {string} runId - pipeline_runs.id
 * @param {object} answers - { question_id: answer, ... }
 * @param {Function} query - PG query function
 */
async function resumePipeline(runId, answers, query) {
  // Load run
  const runRes = await query('SELECT * FROM pipeline_runs WHERE id = $1', [runId]);
  if (runRes.rows.length === 0) {
    throw new Error(`Pipeline run not found: ${runId}`);
  }
  const run = runRes.rows[0];

  if (run.phase !== 'awaiting_human') {
    throw new Error(`Pipeline is not awaiting human input (current phase: ${run.phase})`);
  }

  // Save checkpoint answers
  const checkpointRes = await query(
    "SELECT id FROM pipeline_checkpoints WHERE run_id = $1 AND status = 'pending' ORDER BY created_at DESC LIMIT 1",
    [runId]
  );
  if (checkpointRes.rows.length > 0) {
    await query(
      "UPDATE pipeline_checkpoints SET answers = $1, status = 'answered', answered_at = NOW() WHERE id = $2",
      [JSON.stringify(answers), checkpointRes.rows[0].id]
    );
  }

  // Merge answers into SWM
  const swm = run.swm || {};
  const resolvedConflicts = swm.conflicts_resolved || [];

  // Apply human answers to resolve flagged conflicts
  for (const [questionId, answer] of Object.entries(answers)) {
    const checkpoint = checkpointRes.rows[0];
    if (checkpoint) {
      const questions = (await query(
        'SELECT questions FROM pipeline_checkpoints WHERE id = $1',
        [checkpoint.id]
      )).rows[0]?.questions || [];

      const question = questions.find(q => q.id === questionId);
      if (question?.conflict_id) {
        // Find and resolve the conflict
        const conflictIdx = swm.conflicts?.findIndex(c => c.id === question.conflict_id);
        if (conflictIdx >= 0) {
          swm.conflicts[conflictIdx] = {
            ...swm.conflicts[conflictIdx],
            resolved: true,
            resolution: `Human answered: ${answer}`,
            confidence: 'human-confirmed',
          };
          resolvedConflicts.push(swm.conflicts[conflictIdx]);
        }
      }
    }
  }

  // Clean up resolved conflicts
  swm.conflicts = (swm.conflicts || []).filter(c => !c.resolved);
  swm.conflicts_resolved = resolvedConflicts;

  await saveSWM(query, runId, swm);

  // Resume from schema phase
  const resumePhase = run.resume_from_phase || 'schema';
  await runPipeline(runId, resumePhase, query);
}

module.exports = { runPipeline, resumePipeline };
```

- [ ] **Step 2: Commit**

```bash
git add server/orchestrator.js
git commit -m "feat: implement pipeline orchestrator with pause/resume support"
```

---

## Task 10: Pipeline API Routes

**Files:**
- Create: `server/routes/pipeline.js`
- Modify: `server/index.js` (register new routes)

- [ ] **Step 1: Create pipeline routes**

```javascript
// server/routes/pipeline.js
const { runPipeline, resumePipeline } = require('../orchestrator');

module.exports = function registerPipelineRoutes(server, deps) {
  const { query } = deps;

  // List all runs for a project
  server.get('/api/projects/:id/pipeline/runs', async (request, reply) => {
    const { id } = request.params;

    try {
      const result = await query(
        `SELECT id, run_number, phase, resume_from_phase, error, started_at, completed_at, created_at
         FROM pipeline_runs
         WHERE project_id = $1
         ORDER BY run_number DESC`,
        [id]
      );
      return result.rows;
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ error: 'Failed to fetch pipeline runs' });
    }
  });

  // Get specific run details + SWM
  server.get('/api/projects/:id/pipeline/runs/:runId', async (request, reply) => {
    const { id, runId } = request.params;

    try {
      const result = await query(
        'SELECT * FROM pipeline_runs WHERE id = $1 AND project_id = $2',
        [runId, id]
      );
      if (result.rows.length === 0) {
        return reply.code(404).send({ error: 'Pipeline run not found' });
      }
      return result.rows[0];
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ error: 'Failed to fetch pipeline run' });
    }
  });

  // Get pending checkpoint for a run
  server.get('/api/projects/:id/pipeline/runs/:runId/checkpoint', async (request, reply) => {
    const { runId } = request.params;

    try {
      const result = await query(
        "SELECT * FROM pipeline_checkpoints WHERE run_id = $1 AND status = 'pending' ORDER BY created_at DESC LIMIT 1",
        [runId]
      );
      if (result.rows.length === 0) {
        return reply.code(404).send({ error: 'No pending checkpoint' });
      }
      return result.rows[0];
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ error: 'Failed to fetch checkpoint' });
    }
  });

  // Submit checkpoint answers and resume pipeline
  server.post('/api/projects/:id/pipeline/runs/:runId/checkpoint/answer', async (request, reply) => {
    const { runId } = request.params;
    const { answers } = request.body;

    if (!answers || typeof answers !== 'object') {
      return reply.code(400).send({ error: 'answers object is required' });
    }

    try {
      // Resume pipeline in background
      resumePipeline(runId, answers, query).catch(err => {
        console.error('[Pipeline Resume Error]', err);
      });

      return { success: true, message: 'Pipeline resuming' };
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ error: 'Failed to resume pipeline' });
    }
  });

  // Retry a failed run from scratch
  server.post('/api/projects/:id/pipeline/runs/:runId/retry', async (request, reply) => {
    const { id, runId } = request.params;

    try {
      const runRes = await query(
        'SELECT * FROM pipeline_runs WHERE id = $1 AND project_id = $2',
        [runId, id]
      );
      if (runRes.rows.length === 0) {
        return reply.code(404).send({ error: 'Pipeline run not found' });
      }
      const run = runRes.rows[0];

      if (run.phase !== 'failed') {
        return reply.code(400).send({ error: 'Can only retry failed runs' });
      }

      // Reset run state
      await query(
        "UPDATE pipeline_runs SET phase = 'idle', swm = NULL, error = NULL, started_at = NULL, completed_at = NULL, resume_from_phase = 'chunking' WHERE id = $1",
        [runId]
      );

      // Delete old checkpoints
      await query('DELETE FROM pipeline_checkpoints WHERE run_id = $1', [runId]);

      // Restart pipeline in background
      runPipeline(runId, 'chunking', query).catch(err => {
        console.error('[Pipeline Retry Error]', err);
      });

      return { success: true, message: 'Pipeline retrying from scratch' };
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ error: 'Failed to retry pipeline' });
    }
  });
};
```

- [ ] **Step 2: Register pipeline routes in index.js**

In `server/index.js`, add after the existing route registrations (after line 57, before `const start`):

```javascript
// Register pipeline routes
server.register(require('./routes/pipeline'), { query });
```

The modified `server/index.js` should have these route registrations:

```javascript
// ── Routes ──
server.register(require('./routes/projects'), { query });
server.register(require('./routes/redmine'), { query, openai });
server.register(require('./routes/pipeline'), { query });
```

- [ ] **Step 3: Commit**

```bash
git add server/routes/pipeline.js server/index.js
git commit -m "feat: add pipeline API routes for runs, checkpoints, and retry"
```

---

## Task 11: Trigger Pipeline on PRD Upload

**Files:**
- Modify: `server/routes/projects.js`

- [ ] **Step 1: Add pipeline trigger to PRD upload endpoint**

In `server/routes/projects.js`, modify the `POST /api/projects/:id/prd` endpoint (lines 87-108). Replace the existing handler:

```javascript
server.post('/api/projects/:id/prd', async (request, reply) => {
  const { id } = request.params;
  const { prd_text } = request.body;

  const result = await query(
    'UPDATE projects SET prd_text = $1 WHERE id = $2 RETURNING *',
    [prd_text, id]
  );

  if (result.rows.length === 0) {
    return reply.code(404).send({ error: 'Project not found' });
  }

  const project = result.rows[0];

  // Trigger pipeline
  try {
    const { runPipeline } = require('../orchestrator');

    // Get next run number
    const runNumRes = await query(
      'SELECT COALESCE(MAX(run_number), 0) + 1 as next_num FROM pipeline_runs WHERE project_id = $1',
      [id]
    );
    const runNumber = runNumRes.rows[0].next_num;

    // Create pipeline run
    const runRes = await query(
      "INSERT INTO pipeline_runs (project_id, run_number, phase) VALUES ($1, $2, 'idle') RETURNING id",
      [id, runNumber]
    );
    const runId = runRes.rows[0].id;

    // Update project state
    await query("UPDATE projects SET state = 'parsing' WHERE id = $1", [id]);

    // Run pipeline in background (don't await)
    runPipeline(runId, 'chunking', query).catch(err => {
      console.error('[Pipeline Error]', err);
      query("UPDATE projects SET state = 'idle' WHERE id = $1", [id]).catch(() => {});
    });

    return { ...project, pipeline_run_id: runId };
  } catch (err) {
    request.log.error(err);
    // Still return the project even if pipeline trigger fails
    return project;
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add server/routes/projects.js
git commit -m "feat: trigger pipeline automatically on PRD upload"
```

---

## Task 12: Frontend Types + API Client

**Files:**
- Modify: `web/src/lib/types.ts`
- Modify: `web/src/lib/api.ts`

- [ ] **Step 1: Add pipeline types to types.ts**

Add these types after the existing `Todo` interface in `web/src/lib/types.ts`:

```typescript
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
  prd_chunks?: Array<{
    id: string;
    domain: string;
    tags: string[];
    content: string;
  }>;
  entities?: Record<string, {
    fields: string[];
    owned_by: string[];
    assumptions: string[];
  }>;
  features?: Array<{
    id: string;
    title: string;
    description: string;
    domain: string;
    actors: string[];
    entities: string[];
    implicit_features?: string[];
    assumptions?: string[];
  }>;
  conflicts?: Array<{
    id: string;
    type: string;
    entity: string;
    description: string;
    resolved: boolean;
    resolution?: string;
  }>;
  conflicts_resolved?: Array<any>;
  assumptions_log?: Array<{
    entity: string;
    assumption: string;
    source: string;
    confidence: string;
  }>;
  gaps?: Array<{
    type?: string;
    entity?: string;
    feature_title?: string;
    reason: string;
  }>;
  schema?: Array<{
    table: string;
    columns: Array<{ name: string; type: string }>;
  }>;
  apis?: Array<{
    method: string;
    endpoint: string;
    feature_title: string;
    schema_backing: string[];
    description: string;
  }>;
}

export interface PipelineCheckpoint {
  id: string;
  run_id: string;
  questions: Array<{
    id: string;
    question: string;
    options?: string[];
    context?: string;
    conflict_id?: string;
  }>;
  answers?: Record<string, string>;
  status: 'pending' | 'answered';
  answered_at?: string;
  created_at: string;
}
```

Also add `group` to the existing `Todo` interface:

```typescript
export interface Todo {
  // ... existing fields ...
  group?: 'BE' | 'FE' | 'Infra' | 'Auth';
}
```

- [ ] **Step 2: Add pipeline API functions to api.ts**

Add these functions at the end of `web/src/lib/api.ts` (before the types section):

```typescript
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

export async function submitCheckpointAnswers(
  projectId: string,
  runId: string,
  answers: Record<string, string>
): Promise<{ success: boolean }> {
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
```

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/types.ts web/src/lib/api.ts
git commit -m "feat: add pipeline types and API client functions"
```

---

## Task 13: Pipeline Status Component

**Files:**
- Create: `web/src/app/components/prd/PipelineStatus.tsx`

- [ ] **Step 1: Create PipelineStatus component**

```tsx
// web/src/app/components/prd/PipelineStatus.tsx
"use client";

import { useEffect, useState } from 'react';
import { getPipelineRuns, getPipelineRun, retryPipelineRun, PipelineRun } from '@/lib/api';

interface PipelineStatusProps {
  projectId: string;
  theme: 'light' | 'dark';
  onPhaseChange?: (phase: string) => void;
}

const PHASES = [
  { key: 'chunking', label: 'Chunking' },
  { key: 'features', label: 'Features' },
  { key: 'critic', label: 'Critic' },
  { key: 'schema', label: 'Schema' },
  { key: 'api', label: 'API' },
  { key: 'todo', label: 'Todo' },
];

const PHASE_INDEX: Record<string, number> = {
  idle: -1,
  chunking: 0,
  features: 1,
  critic: 2,
  awaiting_human: 2,
  schema: 3,
  api: 4,
  todo: 5,
  done: 6,
  failed: -1,
};

export default function PipelineStatus({ projectId, theme, onPhaseChange }: PipelineStatusProps) {
  const [run, setRun] = useState<PipelineRun | null>(null);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    loadLatestRun();
  }, [projectId]);

  // Poll while pipeline is running
  useEffect(() => {
    if (!run || ['done', 'failed', 'idle'].includes(run.phase)) return;
    const interval = setInterval(async () => {
      try {
        const updated = await getPipelineRun(projectId, run.id);
        setRun(updated);
        onPhaseChange?.(updated.phase);
      } catch (e) { /* ignore */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [run?.id, run?.phase]);

  const loadLatestRun = async () => {
    try {
      const runs = await getPipelineRuns(projectId);
      if (runs.length > 0) {
        setRun(runs[0]); // Most recent run
        onPhaseChange?.(runs[0].phase);
      }
    } catch (e) { /* ignore */ }
  };

  const handleRetry = async () => {
    if (!run) return;
    setRetrying(true);
    try {
      await retryPipelineRun(projectId, run.id);
      // Reload after a moment
      setTimeout(loadLatestRun, 1000);
    } catch (e) {
      console.error('Retry failed:', e);
    } finally {
      setRetrying(false);
    }
  };

  if (!run) return null;

  const currentIdx = PHASE_INDEX[run.phase] ?? -1;
  const isRunning = !['done', 'failed', 'idle'].includes(run.phase);
  const isFailed = run.phase === 'failed';
  const isDone = run.phase === 'done';
  const isAwaitingHuman = run.phase === 'awaiting_human';

  return (
    <div className={`flex items-center gap-1 text-xs font-mono ${theme === 'dark' ? 'text-[#8b949e]' : 'text-[#57606a]'}`}>
      {PHASES.map((phase, idx) => {
        const isComplete = idx < currentIdx || isDone;
        const isCurrent = idx === currentIdx && isRunning;
        const isPending = idx > currentIdx && !isDone;

        return (
          <div key={phase.key} className="flex items-center gap-1">
            {idx > 0 && (
              <span className={`${theme === 'dark' ? 'text-[#30363d]' : 'text-[#d0d7de]'}`}>→</span>
            )}
            <span
              className={`px-1.5 py-0.5 rounded ${
                isComplete
                  ? theme === 'dark'
                    ? 'bg-green-900/30 text-green-400'
                    : 'bg-green-50 text-green-700'
                  : isCurrent
                  ? theme === 'dark'
                    ? 'bg-blue-900/30 text-blue-400 animate-pulse'
                    : 'bg-blue-50 text-blue-700 animate-pulse'
                  : isAwaitingHuman && idx === 2
                  ? theme === 'dark'
                    ? 'bg-yellow-900/30 text-yellow-400'
                    : 'bg-yellow-50 text-yellow-700'
                  : theme === 'dark'
                  ? 'text-[#484f58]'
                  : 'text-[#8c959f]'
              }`}
            >
              {isComplete ? '✓' : isCurrent ? '→' : isAwaitingHuman && idx === 2 ? '?' : '·'}{' '}
              {phase.label}
            </span>
          </div>
        );
      })}

      {isFailed && (
        <button
          onClick={handleRetry}
          disabled={retrying}
          className={`ml-2 px-2 py-0.5 rounded text-xs ${
            theme === 'dark'
              ? 'bg-red-900/30 text-red-400 hover:bg-red-900/50'
              : 'bg-red-50 text-red-700 hover:bg-red-100'
          }`}
        >
          {retrying ? 'Retrying...' : 'Retry'}
        </button>
      )}

      {run.run_number > 1 && (
        <span className={`ml-2 ${theme === 'dark' ? 'text-[#484f58]' : 'text-[#8c959f]'}`}>
          Run #{run.run_number}
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/app/components/prd/PipelineStatus.tsx
git commit -m "feat: add PipelineStatus component with phase progress indicator"
```

---

## Task 14: Checkpoint Panel Component

**Files:**
- Create: `web/src/app/components/prd/CheckpointPanel.tsx`

- [ ] **Step 1: Create CheckpointPanel component**

```tsx
// web/src/app/components/prd/CheckpointPanel.tsx
"use client";

import { useEffect, useState } from 'react';
import { getPipelineRuns, getPipelineCheckpoint, submitCheckpointAnswers, PipelineCheckpoint } from '@/lib/api';

interface CheckpointPanelProps {
  projectId: string;
  theme: 'light' | 'dark';
  onResolved?: () => void;
}

export default function CheckpointPanel({ projectId, theme, onResolved }: CheckpointPanelProps) {
  const [checkpoint, setCheckpoint] = useState<PipelineCheckpoint | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);

  useEffect(() => {
    loadCheckpoint();
  }, [projectId]);

  const loadCheckpoint = async () => {
    try {
      const runs = await getPipelineRuns(projectId);
      const awaitingRun = runs.find(r => r.phase === 'awaiting_human');
      if (!awaitingRun) {
        setCheckpoint(null);
        setRunId(null);
        return;
      }
      setRunId(awaitingRun.id);
      const cp = await getPipelineCheckpoint(projectId, awaitingRun.id);
      setCheckpoint(cp);
      if (cp) {
        // Initialize answers
        const initial: Record<string, string> = {};
        for (const q of cp.questions) {
          initial[q.id] = '';
        }
        setAnswers(initial);
      }
    } catch (e) {
      console.error('Failed to load checkpoint:', e);
    }
  };

  const handleSubmit = async () => {
    if (!runId) return;
    setSubmitting(true);
    try {
      await submitCheckpointAnswers(projectId, runId, answers);
      setCheckpoint(null);
      onResolved?.();
    } catch (e) {
      console.error('Failed to submit answers:', e);
    } finally {
      setSubmitting(false);
    }
  };

  if (!checkpoint || checkpoint.status !== 'pending') return null;

  const allAnswered = checkpoint.questions.every(q => answers[q.id]?.trim());

  return (
    <div className={`border rounded-lg p-4 mb-4 ${theme === 'dark' ? 'border-yellow-600/30 bg-yellow-900/10' : 'border-yellow-300 bg-yellow-50'}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className={`text-sm font-semibold ${theme === 'dark' ? 'text-yellow-400' : 'text-yellow-700'}`}>
          Conflict Resolution Needed
        </span>
        <span className={`text-xs ${theme === 'dark' ? 'text-yellow-600' : 'text-yellow-500'}`}>
          The Critic agent needs your input
        </span>
      </div>

      {checkpoint.questions.map((q) => (
        <div key={q.id} className="mb-4">
          <p className={`text-sm mb-2 ${theme === 'dark' ? 'text-[#c9d1d9]' : 'text-[#24292f]'}`}>
            {q.question}
          </p>
          {q.context && (
            <p className={`text-xs mb-2 ${theme === 'dark' ? 'text-[#8b949e]' : 'text-[#57606a]'}`}>
              Context: {q.context}
            </p>
          )}
          {q.options && q.options.length > 0 ? (
            <div className="flex flex-col gap-1">
              {q.options.map((opt, i) => (
                <label
                  key={i}
                  className={`flex items-center gap-2 p-2 rounded cursor-pointer text-sm ${
                    answers[q.id] === opt
                      ? theme === 'dark'
                        ? 'bg-blue-900/30 text-blue-400'
                        : 'bg-blue-50 text-blue-700'
                      : theme === 'dark'
                      ? 'hover:bg-[#161b22] text-[#c9d1d9]'
                      : 'hover:bg-gray-100 text-[#24292f]'
                  }`}
                >
                  <input
                    type="radio"
                    name={q.id}
                    value={opt}
                    checked={answers[q.id] === opt}
                    onChange={(e) => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                    className="accent-blue-500"
                  />
                  {opt}
                </label>
              ))}
            </div>
          ) : (
            <input
              type="text"
              value={answers[q.id] || ''}
              onChange={(e) => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
              placeholder="Your answer..."
              className={`w-full px-3 py-2 rounded border text-sm ${
                theme === 'dark'
                  ? 'bg-[#0d1117] border-[#30363d] text-[#c9d1d9] placeholder-[#484f58]'
                  : 'bg-white border-[#d0d7de] text-[#24292f] placeholder-[#8c959f]'
              }`}
            />
          )}
        </div>
      ))}

      <button
        onClick={handleSubmit}
        disabled={!allAnswered || submitting}
        className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
          allAnswered && !submitting
            ? 'bg-blue-600 text-white hover:bg-blue-700'
            : theme === 'dark'
            ? 'bg-[#21262d] text-[#484f58] cursor-not-allowed'
            : 'bg-[#f6f8fa] text-[#8c959f] cursor-not-allowed'
        }`}
      >
        {submitting ? 'Resolving...' : 'Resolve & Continue'}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/app/components/prd/CheckpointPanel.tsx
git commit -m "feat: add CheckpointPanel component for human conflict resolution"
```

---

## Task 15: Integrate Pipeline UI into Project Page

**Files:**
- Modify: `web/src/app/projects/[id]/page.tsx`

- [ ] **Step 1: Import pipeline components**

Add these imports at the top of `web/src/app/projects/[id]/page.tsx`:

```typescript
import PipelineStatus from '@/app/components/prd/PipelineStatus';
import CheckpointPanel from '@/app/components/prd/CheckpointPanel';
```

- [ ] **Step 2: Add pipeline state to the component**

Inside the `ProjectPage` function, after the existing state declarations (around line 22), add:

```typescript
const [pipelinePhase, setPipelinePhase] = useState<string>('idle');
```

- [ ] **Step 3: Add pipeline status to the header**

In the top header div (the `flex-none h-14 border-b` div), add the PipelineStatus component. Insert it before the view toggles div:

```tsx
{/* Pipeline Status */}
<PipelineStatus projectId={id} theme={theme} onPhaseChange={setPipelinePhase} />
```

- [ ] **Step 4: Add checkpoint panel to main content**

In the main content area, inside the `{view === 'list' && (` block, add the CheckpointPanel before the FolderTree:

```tsx
{view === 'list' && (
  <div className="w-[35%] min-w-[500px] max-w-[800px] flex flex-col overflow-hidden">
    <div className={`px-4 py-2 border-b flex items-center justify-between shrink-0 ${theme === 'dark' ? 'bg-[#161b22] border-[#30363d]' : 'bg-[#f6f8fa] border-[#d0d7de]'}`}>
      <h2 className={`text-xs font-bold uppercase tracking-wider ${theme === 'dark' ? 'text-[#8b949e]' : 'text-[#57606a]'}`}>
        Workspace Explorer
      </h2>
      <span className={`text-[9px] ${theme === 'dark' ? 'text-[#484f58]' : 'text-[#8c959f]'}`}>
        {pipelinePhase !== 'idle' ? pipelinePhase : project?.state || 'idle'}
      </span>
    </div>
    <div className="flex-1 overflow-y-auto p-3">
      <CheckpointPanel projectId={id} theme={theme} onResolved={loadProject} />
      <FolderTree projectId={id} theme={theme} />
    </div>
  </div>
)}
```

- [ ] **Step 5: Commit**

```bash
git add web/src/app/projects/\[id\]/page.tsx
git commit -m "feat: integrate pipeline status and checkpoint UI into project page"
```

---

## Task 16: End-to-End Smoke Test

- [ ] **Step 1: Start the server**

Run: `cd server && node --env-file=.env index.js`

Expected: `Server running on http://localhost:3000`

- [ ] **Step 2: Run migration**

Run: `cd server && node --env-file=.env migrate-pipeline.js`

Expected: All ✓ marks, no errors.

- [ ] **Step 3: Create a test project with PRD**

Run:
```bash
curl -s -X POST http://localhost:3000/api/projects \
  -H 'Content-Type: application/json' \
  -d '{"name": "Test Pipeline", "prd_text": "The system supports user registration with email and password. Users can log in and manage their profile. There is a notification system for email alerts. The admin dashboard shows user analytics."}' | jq .
```

Expected: JSON with project `id`.

- [ ] **Step 4: Trigger pipeline by updating PRD**

```bash
curl -s -X POST http://localhost:3000/api/projects/{PROJECT_ID}/prd \
  -H 'Content-Type: application/json' \
  -d '{"prd_text": "The system supports user registration with email and password. Users can log in and manage their profile. There is a notification system for email alerts. The admin dashboard shows user analytics."}' | jq .
```

Expected: JSON with `pipeline_run_id` field.

- [ ] **Step 5: Check pipeline run status**

```bash
curl -s http://localhost:3000/api/projects/{PROJECT_ID}/pipeline/runs | jq .
```

Expected: Array with one run object. `phase` should be progressing through phases.

- [ ] **Step 6: Wait for completion, check features were created**

```bash
curl -s http://localhost:3000/api/projects/{PROJECT_ID}/features | jq .
```

Expected: Non-empty array of features with titles, descriptions, entities.

- [ ] **Step 7: Check todos have groups**

```bash
curl -s http://localhost:3000/api/projects/{PROJECT_ID}/features | jq '.[].todos[] | {title, group}'
```

Expected: Todos with `group` values of "BE", "FE", "Infra", or "Auth".

- [ ] **Step 8: Verify final run phase is 'done'**

```bash
curl -s http://localhost:3000/api/projects/{PROJECT_ID}/pipeline/runs | jq '.[0].phase'
```

Expected: `"done"`
