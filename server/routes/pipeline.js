module.exports = function registerPipelineRoutes(server, deps) {
  const { query } = deps;
  const { runPipeline } = require('../orchestrator');

  // ── Start a new pipeline run ──
  server.post('/api/projects/:id/pipeline/runs', async (request, reply) => {
    const { id } = request.params;
    try {
      const proj = await query('SELECT id, prd_text FROM projects WHERE id = $1', [id]);
      if (proj.rows.length === 0) return reply.code(404).send({ error: 'Project not found' });
      if (!proj.rows[0].prd_text) return reply.code(400).send({ error: 'No PRD text to analyze' });

      const countRes = await query('SELECT COALESCE(MAX(run_number), 0) + 1 AS next FROM pipeline_runs WHERE project_id = $1', [id]);
      const nextRun = countRes.rows[0].next;

      const run = await query(
        "INSERT INTO pipeline_runs (project_id, run_number, phase) VALUES ($1, $2, 'idle') RETURNING *",
        [id, nextRun]
      );
      const runId = run.rows[0].id;

      runPipeline(runId, 'discover', query).catch((err) => {
        server.log.error(err, 'Background runPipeline failed');
      });

      return { run: run.rows[0], started: true };
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ error: 'Failed to start pipeline', details: err.message });
    }
  });

  // ── List all runs ──
  server.get('/api/projects/:id/pipeline/runs', async (request, reply) => {
    const { id } = request.params;
    try {
      const result = await query(
        `SELECT id, run_number, phase, error, started_at, completed_at, created_at
         FROM pipeline_runs WHERE project_id = $1 ORDER BY run_number DESC`,
        [id]
      );
      return result.rows;
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ error: 'Failed to list pipeline runs', details: err.message });
    }
  });

  // ── Get run detail + SWM ──
  server.get('/api/projects/:id/pipeline/runs/:runId', async (request, reply) => {
    const { id, runId } = request.params;
    try {
      const result = await query('SELECT * FROM pipeline_runs WHERE id = $1 AND project_id = $2', [runId, id]);
      if (result.rows.length === 0) return reply.code(404).send({ error: 'Pipeline run not found' });
      return result.rows[0];
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ error: 'Failed to get pipeline run', details: err.message });
    }
  });

  // ── Continue pipeline (after module review) ──
  server.post('/api/projects/:id/pipeline/runs/:runId/continue', async (request, reply) => {
    const { id, runId } = request.params;
    try {
      const runRes = await query('SELECT * FROM pipeline_runs WHERE id = $1 AND project_id = $2', [runId, id]);
      if (runRes.rows.length === 0) return reply.code(404).send({ error: 'Pipeline run not found' });
      const run = runRes.rows[0];
      if (run.phase !== 'awaiting_modules' && run.phase !== 'failed') {
        return reply.code(400).send({ error: 'Run is not awaiting modules', current_phase: run.phase });
      }

      const startPhase = run.phase === 'failed' ? 'discover' : 'extract';

      // Skip paused modules
      if (startPhase === 'extract') {
        await query(
          "DELETE FROM pipeline_modules WHERE run_id = $1 AND status = 'skipped'",
          [runId]
        );
        // Renumber remaining modules by rank
        const remaining = await query(
          'SELECT id FROM pipeline_modules WHERE run_id = $1 ORDER BY rank', [runId]
        );
        for (let i = 0; i < remaining.rows.length; i++) {
          await query('UPDATE pipeline_modules SET rank = $1 WHERE id = $2',
            [i + 1, remaining.rows[i].id]);
        }
      }

      runPipeline(runId, startPhase, query, { pauseAfterDiscover: false }).catch((err) => {
        server.log.error(err, 'Background runPipeline (continue) failed');
      });

      return { success: true, message: `Pipeline continuing from ${startPhase}` };
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ error: 'Failed to continue pipeline', details: err.message });
    }
  });
  // ── Re-extract: reset modules + re-run extract phase ──
  server.post('/api/projects/:id/pipeline/runs/:runId/re-extract', async (request, reply) => {
    const { id, runId } = request.params;
    try {
      const runRes = await query('SELECT * FROM pipeline_runs WHERE id = $1 AND project_id = $2', [runId, id]);
      if (runRes.rows.length === 0) return reply.code(404).send({ error: 'Pipeline run not found' });

      // Reset all modules to pending (keep skipped ones)
      await query(
        "UPDATE pipeline_modules SET status = 'pending', features_count = 0 WHERE run_id = $1 AND status != 'skipped'",
        [runId]
      );

      await query(
        "UPDATE pipeline_runs SET phase = 'idle', swm = NULL, error = NULL, started_at = NULL, completed_at = NULL WHERE id = $1",
        [runId]
      );

      runPipeline(runId, 'extract', query, { pauseAfterDiscover: false }).catch((err) => {
        server.log.error(err, 'Background re-extract failed');
      });

      return { success: true, message: 'Re-extract started' };
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ error: 'Failed to re-extract', details: err.message });
    }
  });

  server.post('/api/projects/:id/pipeline/runs/:runId/retry', async (request, reply) => {
    const { id, runId } = request.params;
    try {
      const runRes = await query('SELECT * FROM pipeline_runs WHERE id = $1 AND project_id = $2', [runId, id]);
      if (runRes.rows.length === 0) return reply.code(404).send({ error: 'Pipeline run not found' });
      const run = runRes.rows[0];
      if (run.phase !== 'failed') return reply.code(400).send({ error: 'Run is not in failed state', current_phase: run.phase });

      await query(
        "UPDATE pipeline_runs SET phase = 'idle', swm = NULL, error = NULL, started_at = NULL, completed_at = NULL WHERE id = $1",
        [runId]
      );

      runPipeline(runId, 'discover', query).catch((err) => {
        server.log.error(err, 'Background runPipeline (retry) failed');
      });

      return { success: true, message: 'Pipeline retry started' };
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ error: 'Failed to retry pipeline', details: err.message });
    }
  });

  // ── List modules for a run ──
  server.get('/api/projects/:id/pipeline/modules', async (request, reply) => {
    const { id } = request.params;
    try {
      const result = await query(
        `SELECT * FROM pipeline_modules WHERE project_id = $1 ORDER BY rank`,
        [id]
      );
      return result.rows;
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ error: 'Failed to list modules', details: err.message });
    }
  });

  // ── Update module (skip, re-rank) ──
  server.patch('/api/projects/:id/pipeline/modules/:moduleId', async (request, reply) => {
    const { moduleId } = request.params;
    const { status, rank } = request.body || {};
    try {
      const sets = [], params = [moduleId];
      if (status) { sets.push(`status = $${params.length + 1}`); params.push(status); }
      if (typeof rank === 'number') { sets.push(`rank = $${params.length + 1}`); params.push(rank); }
      if (sets.length === 0) return reply.code(400).send({ error: 'No fields to update' });

      const result = await query(
        `UPDATE pipeline_modules SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
        params
      );
      if (result.rows.length === 0) return reply.code(404).send({ error: 'Module not found' });
      return result.rows[0];
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ error: 'Failed to update module', details: err.message });
    }
  });
};
