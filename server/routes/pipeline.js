module.exports = function registerPipelineRoutes(server, deps) {
  const { query } = deps;
  const { runPipeline, resumePipeline } = require('../orchestrator');

  // ── List all runs for a project ──
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
      return reply.code(500).send({ error: 'Failed to list pipeline runs', details: err.message });
    }
  });

  // ── Get run details + SWM ──
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
      return reply.code(500).send({ error: 'Failed to get pipeline run', details: err.message });
    }
  });

  // ── Get pending checkpoint ──
  server.get('/api/projects/:id/pipeline/runs/:runId/checkpoint', async (request, reply) => {
    const { runId } = request.params;
    try {
      const result = await query(
        `SELECT * FROM pipeline_checkpoints
         WHERE run_id = $1 AND status = 'pending'
         ORDER BY created_at DESC
         LIMIT 1`,
        [runId]
      );
      if (result.rows.length === 0) {
        return reply.code(404).send({ error: 'No pending checkpoint found' });
      }
      return result.rows[0];
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ error: 'Failed to get checkpoint', details: err.message });
    }
  });

  // ── Submit checkpoint answers, resume pipeline ──
  server.post('/api/projects/:id/pipeline/runs/:runId/checkpoint/answer', async (request, reply) => {
    const { runId } = request.params;
    const { answers } = request.body || {};

    if (!answers || typeof answers !== 'object') {
      return reply.code(400).send({ error: 'answers object is required' });
    }

    try {
      // Fire and forget — run in background
      resumePipeline(runId, answers, query).catch((err) => {
        server.log.error(err, 'Background resumePipeline failed');
      });

      return { success: true, message: 'Pipeline resume started' };
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ error: 'Failed to resume pipeline', details: err.message });
    }
  });

  // ── Retry failed run ──
  server.post('/api/projects/:id/pipeline/runs/:runId/retry', async (request, reply) => {
    const { id, runId } = request.params;
    try {
      // Verify run exists and is in 'failed' phase
      const runRes = await query(
        'SELECT * FROM pipeline_runs WHERE id = $1 AND project_id = $2',
        [runId, id]
      );
      if (runRes.rows.length === 0) {
        return reply.code(404).send({ error: 'Pipeline run not found' });
      }
      const run = runRes.rows[0];
      if (run.phase !== 'failed') {
        return reply.code(400).send({ error: 'Run is not in failed state', current_phase: run.phase });
      }

      // Reset run state
      await query(
        `UPDATE pipeline_runs
         SET phase = 'idle', swm = NULL, error = NULL, started_at = NULL, completed_at = NULL, resume_from_phase = 'chunking'
         WHERE id = $1`,
        [runId]
      );

      // Delete old checkpoints
      await query('DELETE FROM pipeline_checkpoints WHERE run_id = $1', [runId]);

      // Fire and forget — run in background
      runPipeline(runId, 'chunking', query).catch((err) => {
        server.log.error(err, 'Background runPipeline (retry) failed');
      });

      return { success: true, message: 'Pipeline retry started' };
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ error: 'Failed to retry pipeline', details: err.message });
    }
  });
};
