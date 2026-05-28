// ── Chunking Agent ─────────────────────────────────────────────────────
// Reads PRD text from the projects table, calls the LLM to split it into
// domain chunks, validates and normalises the result, and returns an
// updated Shared World Model with `prd_chunks` populated.

const { CHUNKING_SYSTEM, CHUNKING_USER } = require('./prompts');

/**
 * @param {object} swm  - current Shared World Model
 * @param {object} ctx  - { projectId, runId, query, openai, log, config }
 * @returns {Promise<{swm: object}>}
 */
async function chunkingAgent(swm, ctx) {
  const { projectId, query, openai, log, config } = ctx;
  const model = (config && config.CHUNKING_MODEL) || 'openai/gpt-4o';

  log('chunking', `Starting chunking for project ${projectId}`);

  // 1. Get PRD text
  const { rows } = await query(
    'SELECT prd_text FROM projects WHERE id = $1',
    [projectId],
  );

  if (!rows.length || !rows[0].prd_text) {
    throw new Error(`No prd_text found for project ${projectId}`);
  }

  const prdText = rows[0].prd_text;
  log('chunking', `PRD text length: ${prdText.length} chars`);

  // 2. Call LLM
  const completion = await openai.chat.completions.create({
    model,
    response_format: { type: 'json_object' },
    temperature: 0.3,
    messages: [
      { role: 'system', content: CHUNKING_SYSTEM },
      { role: 'user', content: CHUNKING_USER(prdText) },
    ],
  });

  const raw = completion.choices[0].message.content;

  // 3. Parse JSON — handle both bare array and { chunks: [...] } wrapper
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`LLM returned invalid JSON: ${err.message}`);
  }

  let chunks;
  if (Array.isArray(parsed)) {
    chunks = parsed;
  } else if (parsed && Array.isArray(parsed.chunks)) {
    chunks = parsed.chunks;
  } else {
    throw new Error(
      'Unexpected JSON shape: expected array or {chunks: [...]}, got keys: ' +
        Object.keys(parsed || {}).join(', '),
    );
  }

  // 4. Validate
  if (chunks.length === 0) {
    throw new Error('LLM returned 0 chunks');
  }
  if (chunks.length > 20) {
    throw new Error(`LLM returned ${chunks.length} chunks (max 20)`);
  }

  // 5. Normalise
  const normalised = chunks.map((chunk, idx) => ({
    id: `chunk_${idx + 1}`,
    domain: String(chunk.domain || '').toLowerCase(),
    tags: Array.isArray(chunk.tags)
      ? chunk.tags.map((t) => String(t).toLowerCase())
      : [],
    content: String(chunk.content || ''),
  }));

  log('chunking', `Produced ${normalised.length} chunks`);

  // 6. Return updated SWM
  return { swm: { ...swm, prd_chunks: normalised } };
}

module.exports = chunkingAgent;
