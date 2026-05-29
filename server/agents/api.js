const { parseLLMJSON } = require('./json-parse');
const { API_SYSTEM, API_USER } = require('./prompts');

async function apiAgent(swm, ctx) {
  const { projectId, runId, query, openai, log, config } = ctx;
  const model = (config && config.API_MODEL) || 'openai/gpt-oss-120b';

  // Source features from DB
  const featRows = await query(
    `SELECT id, title, description, module, entities FROM features WHERE project_id = $1`,
    [projectId]
  );
  const features = featRows.rows.map(f => ({
    id: f.id,
    title: f.title,
    description: f.description,
    module: f.module,
    entities: f.entities,
  }));

  if (features.length === 0) {
    log('api', 'No features — skipping');
    return { swm: { ...swm, apis: [] } };
  }

  // Source entities from pipeline_modules
  const modRows = await query(
    `SELECT entities FROM pipeline_modules WHERE run_id = $1`,
    [runId]
  );
  const entitySet = new Set();
  for (const row of modRows.rows) {
    (row.entities || []).forEach(e => entitySet.add(e.toLowerCase()));
  }
  const entities = {};
  for (const e of entitySet) entities[e] = { name: e };

  // Schema comes from SWM (populated by schema phase)
  const schema = Array.isArray(swm.schema) ? swm.schema : [];

  log('api', `Generating APIs for ${features.length} features, ${Object.keys(entities).length} entities, ${schema.length} tables`);

  const completion = await openai.chat.completions.create({
    model,
    temperature: 0.3,
    messages: [
      { role: 'system', content: API_SYSTEM },
      { role: 'user', content: API_USER(features, entities, schema) },
    ],
  });

  const raw = completion.choices[0].message.content;
  const parsed = parseLLMJSON(raw);

  let endpoints;
  if (Array.isArray(parsed)) endpoints = parsed;
  else if (parsed && Array.isArray(parsed.endpoints)) endpoints = parsed.endpoints;
  else throw new Error('API agent returned unexpected JSON structure');

  log('api', `${endpoints.length} endpoints`);

  return { swm: { ...swm, apis: endpoints } };
}

module.exports = apiAgent;
