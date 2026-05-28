// ── Schema Generation Agent ──────────────────────────────────────────────
// Converts canonical entities from the SWM into PostgreSQL table definitions
// using an LLM.  Runs AFTER the critic agent has resolved all conflicts.

const { SCHEMA_SYSTEM, SCHEMA_USER } = require('./prompts');

/**
 * @param {object} swm  - current Shared World Model (must include .entities)
 * @param {object} ctx  - { projectId, runId, query, openai, log, config }
 * @returns {Promise<{swm: object}>}
 */
async function schemaAgent(swm, ctx) {
  const { projectId, openai, log, config } = ctx;
  const model = (config && config.SCHEMA_MODEL) || 'openai/gpt-4o';

  // 1. Get entities — if empty, skip
  const entities = swm.entities || {};
  const entityNames = Object.keys(entities);

  if (entityNames.length === 0) {
    log('schema', `No entities in SWM for project ${projectId} — skipping schema generation`);
    return { swm: { ...swm, schema: [] } };
  }

  log('schema', `Generating schema for ${entityNames.length} entities (project ${projectId})`);

  // 2. Call LLM
  const completion = await openai.chat.completions.create({
    model,
    response_format: { type: 'json_object' },
    temperature: 0.2,
    messages: [
      { role: 'system', content: SCHEMA_SYSTEM },
      { role: 'user', content: SCHEMA_USER(entities) },
    ],
  });

  const raw = completion.choices[0].message.content;

  // 3. Parse JSON response — handle both array and object wrapper formats
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`LLM returned invalid JSON from schema agent: ${err.message}`);
  }

  let tables;
  if (Array.isArray(parsed)) {
    // Direct array: [{ table: "users", ... }, ...]
    tables = parsed;
  } else if (parsed && Array.isArray(parsed.tables)) {
    // Object wrapper: { tables: [...] }
    tables = parsed.tables;
  } else if (parsed && Array.isArray(parsed.schema)) {
    // Object wrapper: { schema: [...] }
    tables = parsed.schema;
  } else {
    throw new Error(
      'Schema agent returned unexpected JSON structure — expected array, {tables:[...]} or {schema:[...]}',
    );
  }

  log('schema', `LLM returned ${tables.length} table definitions`);

  // 4. Validate: every entity should have a corresponding table
  const tableNames = new Set(
    tables.map((t) => String(t.table || t.name || '').toLowerCase()),
  );
  const gaps = [];

  for (const entityName of entityNames) {
    if (!tableNames.has(entityName.toLowerCase())) {
      gaps.push({
        type: 'missing_table',
        entity: entityName,
        reason: 'No table generated',
      });
    }
  }

  // 5. Log warnings for gaps
  if (gaps.length > 0) {
    for (const gap of gaps) {
      log('schema', `WARNING: missing table for entity "${gap.entity}" — ${gap.reason}`);
    }
  }

  log(
    'schema',
    `Schema generation complete: ${tables.length} tables, ${gaps.length} gaps`,
  );

  // 6. Return updated SWM
  return {
    swm: {
      ...swm,
      schema: tables,
      gaps: [...(swm.gaps || []), ...gaps],
    },
  };
}

module.exports = schemaAgent;
