// ── Pipeline Orchestrator ──────────────────────────────────────────────────
// Coordinates the multi-phase PRD analysis pipeline. Each phase calls an
// agent that reads and mutates the Shared World Model (SWM). The orchestrator
// persists progress after each phase so the pipeline can be paused (for human
// review) and resumed without losing work.

const OpenAI = require('openai');
const {
  chunkingAgent,
  featureAgent,
  criticAgent,
  schemaAgent,
  apiAgent,
  todoAgent,
} = require('./agents');

// ── Constants ──────────────────────────────────────────────────────────────

const PHASE_ORDER = ['chunking', 'features', 'critic', 'schema', 'api', 'todo'];

const PHASE_MAP = {
  chunking: chunkingAgent,
  features: featureAgent,
  critic: criticAgent,
  schema: schemaAgent,
  api: apiAgent,
  todo: todoAgent,
};

const EMPTY_SWM = {
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

// ── Helpers ────────────────────────────────────────────────────────────────

async function updatePhase(query, runId, phase) {
  await query('UPDATE pipeline_runs SET phase = $1 WHERE id = $2', [phase, runId]);
}

async function saveSWM(query, runId, swm) {
  await query('UPDATE pipeline_runs SET swm = $1 WHERE id = $2', [JSON.stringify(swm), runId]);
}

async function saveError(query, runId, error) {
  await query(
    "UPDATE pipeline_runs SET phase = 'failed', error = $1 WHERE id = $2",
    [String(error), runId],
  );
}

async function completeRun(query, runId) {
  await query(
    "UPDATE pipeline_runs SET phase = 'done', completed_at = NOW() WHERE id = $1",
    [runId],
  );
}

async function createCheckpoint(query, runId, checkpoint) {
  await query(
    'INSERT INTO pipeline_checkpoints (run_id, questions, status, created_at) VALUES ($1, $2, $3, NOW())',
    [runId, JSON.stringify(checkpoint.questions), 'pending'],
  );
}

// ── runPipeline ────────────────────────────────────────────────────────────

/**
 * Runs the PRD analysis pipeline from a given phase.
 *
 * @param {string}   runId          - pipeline_runs.id (UUID)
 * @param {string}   startFromPhase - phase name to start from
 * @param {Function} query          - async (sql, params) => { rows }
 * @returns {Promise<object>}       - final SWM
 */
async function runPipeline(runId, startFromPhase, query) {
  // 1. Create OpenAI client
  const openai = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY || 'dummy-key',
    defaultHeaders: {
      'HTTP-Referer': 'http://localhost:3000',
      'X-Title': 'Requirements OS Pipeline',
    },
  });

  // 2. Load config from env vars
  const config = {
    CHUNKING_MODEL: process.env.CHUNKING_MODEL || 'openai/gpt-4o',
    FEATURE_MODEL: process.env.FEATURE_MODEL || 'openai/gpt-4o',
    CRITIC_MODEL: process.env.CRITIC_MODEL || 'openai/gpt-4o',
    SCHEMA_MODEL: process.env.SCHEMA_MODEL || 'openai/gpt-4o',
    API_MODEL: process.env.API_MODEL || 'openai/gpt-4o',
    TODO_MODEL: process.env.TODO_MODEL || 'openai/gpt-4o',
  };

  // 3. Load run from DB
  const { rows } = await query('SELECT * FROM pipeline_runs WHERE id = $1', [runId]);
  if (!rows.length) {
    throw new Error(`Pipeline run ${runId} not found`);
  }
  const run = rows[0];

  // 4. Initialize SWM if null
  let swm = run.swm || { ...EMPTY_SWM };

  // 5. Build context
  const log = (phase, message) => {
    console.log(`[pipeline:${runId.slice(0, 8)}][${phase}] ${message}`);
  };
  const ctx = {
    projectId: run.project_id,
    runId,
    query,
    openai,
    log,
    config,
  };

  // 6. Determine start index
  const startIndex = PHASE_ORDER.indexOf(startFromPhase);
  if (startIndex === -1) {
    throw new Error(`Unknown phase: ${startFromPhase}`);
  }

  // 7. Set started_at if not set
  if (!run.started_at) {
    await query('UPDATE pipeline_runs SET started_at = NOW() WHERE id = $1', [runId]);
  }

  // 8. Loop through phases
  for (let i = startIndex; i < PHASE_ORDER.length; i++) {
    const phase = PHASE_ORDER[i];
    const agentFn = PHASE_MAP[phase];

    log(phase, `Starting phase ${phase} (${i + 1}/${PHASE_ORDER.length})`);

    // 8a. Update phase in DB
    await updatePhase(query, runId, phase);

    try {
      // 8b. Call agent function
      const result = await agentFn(swm, ctx);

      // 8c. Merge SWM
      Object.assign(swm, result.swm);

      // 8d. Increment version, save SWM to DB
      swm.version = (swm.version || 0) + 1;
      await saveSWM(query, runId, swm);

      log(phase, `Phase ${phase} completed (SWM version ${swm.version})`);

      // 8e. If checkpoint: create checkpoint row, pause pipeline
      if (result.checkpoint) {
        await createCheckpoint(query, runId, result.checkpoint);
        await query(
          "UPDATE pipeline_runs SET phase = 'awaiting_human', resume_from_phase = 'schema' WHERE id = $1",
          [runId],
        );
        log(phase, 'Pipeline paused — awaiting human review');
        return swm;
      }
    } catch (err) {
      // 8f. On error: save error to DB, throw
      await saveError(query, runId, err.message);
      log(phase, `Phase ${phase} failed: ${err.message}`);
      throw err;
    }
  }

  // 9. On completion: set phase to 'done'
  await completeRun(query, runId);
  log('done', 'Pipeline completed successfully');

  return swm;
}

// ── resumePipeline ─────────────────────────────────────────────────────────

/**
 * Resumes a pipeline that was paused for human review.
 *
 * @param {string}   runId   - pipeline_runs.id (UUID)
 * @param {object}   answers - human answers to checkpoint questions
 * @param {Function} query   - async (sql, params) => { rows }
 * @returns {Promise<object>} - final SWM
 */
async function resumePipeline(runId, answers, query) {
  // 1. Load run, verify phase is 'awaiting_human'
  const { rows } = await query('SELECT * FROM pipeline_runs WHERE id = $1', [runId]);
  if (!rows.length) {
    throw new Error(`Pipeline run ${runId} not found`);
  }
  const run = rows[0];

  if (run.phase !== 'awaiting_human') {
    throw new Error(`Cannot resume run ${runId}: phase is "${run.phase}", expected "awaiting_human"`);
  }

  // 2. Find pending checkpoint
  const cpResult = await query(
    "SELECT id FROM pipeline_checkpoints WHERE run_id = $1 AND status = 'pending' ORDER BY created_at DESC LIMIT 1",
    [runId],
  );
  if (!cpResult.rows.length) {
    throw new Error(`No pending checkpoint found for run ${runId}`);
  }
  const checkpointId = cpResult.rows[0].id;

  // 3. Save answers to checkpoint
  await query(
    "UPDATE pipeline_checkpoints SET answers = $1, status = 'answered', answered_at = NOW() WHERE id = $2",
    [JSON.stringify(answers), checkpointId],
  );

  // 4. Merge human answers into SWM — resolve flagged conflicts using answers
  let swm = run.swm || { ...EMPTY_SWM };

  if (answers && Array.isArray(swm.conflicts)) {
    for (const conflict of swm.conflicts) {
      const answer = answers[conflict.id] || answers[conflict.conflict_id];
      if (answer) {
        conflict.resolved = true;
        conflict.resolution = answer.resolution || answer;
        conflict.confidence = 1.0;
        conflict.human_reviewed = true;

        // Move to resolved list
        if (!Array.isArray(swm.conflicts_resolved)) {
          swm.conflicts_resolved = [];
        }
        swm.conflicts_resolved.push({ ...conflict });
      }
    }
    // Remove resolved conflicts from the unresolved list
    swm.conflicts = swm.conflicts.filter((c) => !c.resolved);
  }

  // 5. Save updated SWM
  swm.version = (swm.version || 0) + 1;
  await saveSWM(query, runId, swm);

  // 6. Resume from where we left off (default: schema phase)
  const resumeFrom = run.resume_from_phase || 'schema';
  return runPipeline(runId, resumeFrom, query);
}

// ── Exports ────────────────────────────────────────────────────────────────

module.exports = { runPipeline, resumePipeline };
