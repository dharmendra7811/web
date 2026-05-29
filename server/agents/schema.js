const { parseLLMJSON } = require('./json-parse');
const { SCHEMA_SYSTEM, SCHEMA_USER } = require('./prompts');

async function schemaAgent(swm, ctx) {
  const { projectId, runId, query, openai, log, config } = ctx;
  const model = (config && config.SCHEMA_MODEL) || 'openai/gpt-oss-120b';

  // Collect entities from two sources:
  // 1. pipeline_modules.entities (from discover)
  // 2. features.entities (from extract)
  const entitySet = new Set();

  const modRows = await query(
    `SELECT entities FROM pipeline_modules WHERE run_id = $1 AND status = 'done'`,
    [runId]
  );
  for (const row of modRows.rows) {
    (row.entities || []).forEach(e => entitySet.add(e.toLowerCase()));
  }

  const featRows = await query(
    `SELECT entities FROM features WHERE project_id = $1`,
    [projectId]
  );
  for (const row of featRows.rows) {
    (row.entities || []).forEach(e => entitySet.add(e.toLowerCase()));
  }

  const entityNames = [...entitySet];

  if (entityNames.length === 0) {
    log('schema', 'No entities found — skipping');
    return { swm: { ...swm, schema: [] } };
  }

  log('schema', `Generating schema for ${entityNames.length} entities`);

  // Build entity descriptions from module summaries
  const modSum = await query(
    `SELECT name, summary, entities FROM pipeline_modules WHERE run_id = $1`,
    [runId]
  );
  const entitiesWithContext = {};
  for (const name of entityNames) {
    const mod = modSum.rows.find(r => (r.entities || []).some(e => e.toLowerCase() === name));
    entitiesWithContext[name] = {
      fields: [],
      assumptions: [],
      context: mod ? `${mod.name}: ${mod.summary}` : '',
    };
  }

  const completion = await openai.chat.completions.create({
    model,
    temperature: 0.2,
    messages: [
      { role: 'system', content: SCHEMA_SYSTEM },
      { role: 'user', content: SCHEMA_USER(entitiesWithContext) },
    ],
  });

  const raw = completion.choices[0].message.content;
  const parsed = parseLLMJSON(raw);

  let tables;
  if (Array.isArray(parsed)) tables = parsed;
  else if (parsed && Array.isArray(parsed.tables)) tables = parsed.tables;
  else if (parsed && Array.isArray(parsed.schema)) tables = parsed.schema;
  else throw new Error('Schema agent returned unexpected JSON structure');

  log('schema', `${tables.length} table definitions`);

  return { swm: { ...swm, schema: tables } };
}

module.exports = schemaAgent;
