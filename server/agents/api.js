// ── API Generation Agent ─────────────────────────────────────────────────
// Designs REST endpoints for each feature using the entity definitions and
// database schema.  Runs AFTER the schema agent has populated swm.schema.

const { API_SYSTEM, API_USER } = require('./prompts');

/**
 * @param {object} swm  - current Shared World Model (must include .features, .entities, .schema)
 * @param {object} ctx  - { projectId, runId, query, openai, log, config }
 * @returns {Promise<{swm: object}>}
 */
async function apiAgent(swm, ctx) {
  const { projectId, openai, log, config } = ctx;
  const model = (config && config.API_MODEL) || 'openai/gpt-4o';

  // 1. Get features, entities, schema — if features empty, skip
  const features = Array.isArray(swm.features) ? swm.features : [];
  const entities = swm.entities || {};
  const schema = Array.isArray(swm.schema) ? swm.schema : [];

  if (features.length === 0) {
    log('api', `No features in SWM for project ${projectId} — skipping API generation`);
    return { swm: { ...swm, apis: [] } };
  }

  log('api', `Generating APIs for ${features.length} features, ${Object.keys(entities).length} entities, ${schema.length} tables (project ${projectId})`);

  // 2. Call LLM
  const completion = await openai.chat.completions.create({
    model,
    response_format: { type: 'json_object' },
    temperature: 0.3,
    messages: [
      { role: 'system', content: API_SYSTEM },
      { role: 'user', content: API_USER(features, entities, schema) },
    ],
  });

  const raw = completion.choices[0].message.content;

  // 3. Parse JSON response — handle both array and object wrapper formats
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`LLM returned invalid JSON from API agent: ${err.message}`);
  }

  let endpoints;
  if (Array.isArray(parsed)) {
    // Direct array: [{ method: "GET", path: "/api/...", ... }, ...]
    endpoints = parsed;
  } else if (parsed && Array.isArray(parsed.endpoints)) {
    // Object wrapper: { endpoints: [...] }
    endpoints = parsed.endpoints;
  } else {
    throw new Error(
      'API agent returned unexpected JSON structure — expected array or {endpoints:[...]}',
    );
  }

  log('api', `LLM returned ${endpoints.length} API endpoints`);

  // 4. Validate: every feature should have at least one API
  //    Compare feature titles to endpoints' feature_title or feature_id
  const featureTitles = new Set(
    features.map((f) => String(f.title || '').toLowerCase()),
  );
  const featureIds = new Set(
    features.map((f) => String(f.id || '').toLowerCase()),
  );

  const coveredTitles = new Set();
  const coveredIds = new Set();

  for (const ep of endpoints) {
    if (ep.feature_title) {
      coveredTitles.add(String(ep.feature_title).toLowerCase());
    }
    if (ep.feature_id) {
      coveredIds.add(String(ep.feature_id).toLowerCase());
    }
  }

  const gaps = [];
  for (const feat of features) {
    const titleLower = String(feat.title || '').toLowerCase();
    const idLower = String(feat.id || '').toLowerCase();
    if (!coveredTitles.has(titleLower) && !coveredIds.has(idLower)) {
      gaps.push({
        type: 'feature_no_api',
        feature_id: feat.id,
        feature_title: feat.title,
        reason: 'No API endpoint generated for this feature',
      });
    }
  }

  // Also collect any gaps returned by the LLM itself
  const llmGaps = Array.isArray(parsed.gaps) ? parsed.gaps : [];

  const allGaps = [...gaps, ...llmGaps];

  // 5. Log warnings for gaps
  if (allGaps.length > 0) {
    for (const gap of allGaps) {
      const label = gap.feature_title || gap.path || gap.feature_id || 'unknown';
      log('api', `WARNING: gap — ${gap.type} for "${label}": ${gap.reason || gap.suggestion || gap.issue || 'no details'}`);
    }
  }

  log(
    'api',
    `API generation complete: ${endpoints.length} endpoints, ${allGaps.length} gaps`,
  );

  // 6. Return updated SWM
  return {
    swm: {
      ...swm,
      apis: endpoints,
      gaps: [...(swm.gaps || []), ...allGaps],
    },
  };
}

module.exports = apiAgent;
