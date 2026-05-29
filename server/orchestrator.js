// ── Pipeline Orchestrator ──────────────────────────────────────────────────
// 4-phase flow: discover → extract → schema → api
// Phase 1 (discover): PRD → ranked modules → pipeline_modules table
// Phase 2 (extract): per-module features + todos → features/todos tables
// Phase 3 (schema): entities → DB schema
// Phase 4 (api): features + schema → REST endpoints

const OpenAI = require('openai');
const { discoverAgent, extractAgent, schemaAgent, apiAgent } = require('./agents');

const PHASE_ORDER = ['discover', 'extract']; // schema + api skipped for now
const PHASE_MAP = { discover: discoverAgent, extract: extractAgent, schema: schemaAgent, api: apiAgent };

const EMPTY_SWM = { version: 0, entities: {}, features: [], modules: [] };

async function updatePhase(query, runId, phase) {
  await query('UPDATE pipeline_runs SET phase = $1 WHERE id = $2', [phase, runId]);
}

async function saveSWM(query, runId, swm) {
  await query('UPDATE pipeline_runs SET swm = $1 WHERE id = $2', [JSON.stringify(swm), runId]);
}

async function saveError(query, runId, error) {
  await query("UPDATE pipeline_runs SET phase = 'failed', error = $1 WHERE id = $2", [String(error), runId]);
}

async function completeRun(query, runId) {
  await query("UPDATE pipeline_runs SET phase = 'done', completed_at = NOW() WHERE id = $1", [runId]);
}

async function runPipeline(runId, startFromPhase, query, opts = {}) {
  const { pauseAfterDiscover = true } = opts;
  const openai = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY || 'dummy-key',
    timeout: 180000,
    maxRetries: 2,
    defaultHeaders: {
      'HTTP-Referer': 'http://localhost:3000',
      'X-Title': 'Requirements OS Pipeline',
    },
  });

  const config = {
    CHUNKING_MODEL: process.env.CHUNKING_MODEL || 'openai/gpt-oss-120b',
    FEATURE_MODEL: process.env.FEATURE_MODEL || 'openai/gpt-oss-120b',
    SCHEMA_MODEL: process.env.SCHEMA_MODEL || 'openai/gpt-oss-120b',
    API_MODEL: process.env.API_MODEL || 'openai/gpt-oss-120b',
  };

  const { rows } = await query('SELECT * FROM pipeline_runs WHERE id = $1', [runId]);
  if (!rows.length) throw new Error(`Pipeline run ${runId} not found`);
  const run = rows[0];

  let swm = run.swm || { ...EMPTY_SWM };
  const log = (phase, message) => console.log(`[pipeline:${runId.slice(0, 8)}][${phase}] ${message}`);
  const ctx = { projectId: run.project_id, runId, query, openai, log, config };

  const startIndex = PHASE_ORDER.indexOf(startFromPhase);
  if (startIndex === -1) throw new Error(`Unknown phase: ${startFromPhase}`);

  if (!run.started_at) {
    await query('UPDATE pipeline_runs SET started_at = NOW() WHERE id = $1', [runId]);
  }

  // Delete old modules + features for this run (fresh start)
  if (startFromPhase === 'discover') {
    await query('DELETE FROM pipeline_modules WHERE run_id = $1', [runId]);
  }

  for (let i = startIndex; i < PHASE_ORDER.length; i++) {
    const phase = PHASE_ORDER[i];
    const agentFn = PHASE_MAP[phase];

    log(phase, `Starting phase ${phase} (${i + 1}/${PHASE_ORDER.length})`);
    await updatePhase(query, runId, phase);

    try {
      const result = await agentFn(swm, ctx);
      Object.assign(swm, result.swm);
      swm.version = (swm.version || 0) + 1;
      await saveSWM(query, runId, swm);
      log(phase, `Phase ${phase} completed (SWM version ${swm.version})`);

      // Pause after discover for user review
      if (phase === 'discover' && pauseAfterDiscover) {
        await query("UPDATE pipeline_runs SET phase = 'awaiting_modules' WHERE id = $1", [runId]);
        log(phase, 'Paused — awaiting user module review');
        return swm;
      }
    } catch (err) {
      await saveError(query, runId, err.message);
      log(phase, `Phase ${phase} failed: ${err.message}`);
      throw err;
    }
  }

  await completeRun(query, runId);
  log('done', 'Pipeline completed');
  return swm;
}

module.exports = { runPipeline };
