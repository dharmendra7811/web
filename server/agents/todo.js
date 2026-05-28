// ── Todo Agent (Phase 5) ──────────────────────────────────────────────────
// Materializes the SWM features into actual database rows in the `features`
// and `todos` tables.  This is the ONLY agent that writes to user-facing DB
// tables.

const { TODO_SYSTEM, TODO_USER } = require('./prompts');

/**
 * @param {object} swm  - current Shared World Model
 * @param {object} ctx  - { projectId, runId, query, openai, log, config }
 * @returns {Promise<{swm: object}>}
 */
async function todoAgent(swm, ctx) {
  const { projectId, query, openai, log, config } = ctx;
  const model = (config && config.TODO_MODEL) || 'openai/gpt-4o';

  // 1. Guard — if no features in SWM, nothing to materialize
  const features = Array.isArray(swm.features) ? swm.features : [];
  if (features.length === 0) {
    log('todo', `No features in SWM for project ${projectId} — skipping`);
    return { swm };
  }

  log('todo', `Starting todo generation for ${features.length} features (project ${projectId})`);

  // 2. Call LLM
  const completion = await openai.chat.completions.create({
    model,
    response_format: { type: 'json_object' },
    temperature: 0.3,
    messages: [
      { role: 'system', content: TODO_SYSTEM },
      { role: 'user', content: TODO_USER(swm) },
    ],
  });

  const raw = completion.choices[0].message.content;

  // 3. Parse JSON response
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`LLM returned invalid JSON from todo agent: ${err.message}`);
  }

  const todos = Array.isArray(parsed.todos) ? parsed.todos : [];

  // Separate feature-entries (epics) from granular todos
  const featureEntries = todos.filter((t) => t.is_feature_entry === true);
  const granularTodos = todos.filter((t) => t.is_feature_entry !== true);

  log('todo', `LLM returned ${featureEntries.length} feature entries, ${granularTodos.length} granular todos`);

  // 4. Materialize features into DB
  // Track mapping from LLM feature_id -> DB feature id for todo FK resolution
  const featureIdMap = {};

  for (const feat of featureEntries) {
    // 4a. Get next order_index
    const idxResult = await query(
      'SELECT COALESCE(MAX(order_index), -1) + 1 as next_idx FROM features WHERE project_id = $1',
      [projectId],
    );
    const nextIdx = idxResult.rows[0].next_idx;

    // Derive module from the feature's domain or first chunk domain
    const domainFromSWM = (swm.features || []).find(
      (f) => f.id === feat.feature_id || f.title === feat.title,
    );
    const module =
      feat.module ||
      feat.category ||
      (domainFromSWM && domainFromSWM.domain) ||
      (Array.isArray(swm.prd_chunks) && swm.prd_chunks.length > 0
        ? swm.prd_chunks[0].domain
        : null) ||
      'general';

    const confidence = typeof feat.confidence === 'number' ? feat.confidence : 0.8;

    // 4b. Insert into features table
    const actors = Array.isArray(feat.entities)
      ? feat.entities.map((e) => String(e).toLowerCase())
      : [];
    const entities = Array.isArray(feat.entities)
      ? feat.entities.map((e) => String(e).toLowerCase())
      : [];

    // Use actors from SWM feature if available, otherwise fall back to LLM response
    const swmFeature = (swm.features || []).find(
      (f) => f.id === feat.feature_id || f.title === feat.title,
    );
    const finalActors =
      swmFeature && Array.isArray(swmFeature.actors)
        ? swmFeature.actors.map((a) => String(a).toLowerCase())
        : actors;

    const insertFeatureResult = await query(
      `INSERT INTO features (project_id, title, description, actors, entities, status, order_index, human_locked, module, confidence)
       VALUES ($1, $2, $3, $4, $5, 'draft', $6, false, $7, $8)
       RETURNING id`,
      [
        projectId,
        feat.title || 'Untitled Feature',
        feat.detail || null,
        finalActors,
        entities,
        nextIdx,
        module,
        confidence,
      ],
    );

    const dbFeatureId = insertFeatureResult.rows[0].id;

    // Map the LLM feature_id to the DB id for granular todo resolution
    featureIdMap[feat.feature_id] = dbFeatureId;

    log('todo', `Inserted feature "${feat.title}" -> DB id ${dbFeatureId}`);
  }

  // Also map feature_ids that only appear in granular todos (no feature entry)
  // by matching against SWM features
  for (const todo of granularTodos) {
    if (todo.feature_id && !featureIdMap[todo.feature_id]) {
      // Try to find a matching feature entry we already inserted by title
      const matchingEntry = featureEntries.find(
        (fe) => fe.feature_id === todo.feature_id,
      );
      if (matchingEntry && featureIdMap[matchingEntry.feature_id]) {
        featureIdMap[todo.feature_id] = featureIdMap[matchingEntry.feature_id];
      }
    }
  }

  // 4c. Insert granular todos
  let todoInsertCount = 0;
  for (const todo of granularTodos) {
    const dbFeatureId = featureIdMap[todo.feature_id] || null;

    // Get next order_index for this feature's todos
    const todoIdxResult = await query(
      'SELECT COALESCE(MAX(order_index), -1) + 1 as next_idx FROM todos WHERE project_id = $1 AND feature_id = $2',
      [projectId, dbFeatureId],
    );
    const nextTodoIdx = todoIdxResult.rows[0].next_idx;

    const todoEntities = Array.isArray(todo.entities)
      ? todo.entities.map((e) => String(e).toLowerCase())
      : [];

    const dependsOn = Array.isArray(todo.depends_on) ? todo.depends_on : [];

    const group = todo.group || todo.category || 'BE';

    await query(
      `INSERT INTO todos (project_id, feature_id, title, detail, entities, depends_on, status, order_index, human_locked, "group")
       VALUES ($1, $2, $3, $4, $5, $6, 'open', $7, false, $8)`,
      [
        projectId,
        dbFeatureId,
        todo.title || 'Untitled Todo',
        todo.detail || null,
        todoEntities,
        dependsOn,
        nextTodoIdx,
        group,
      ],
    );

    todoInsertCount++;
  }

  // 5. Log counts
  log(
    'todo',
    `Todo agent complete: ${featureEntries.length} features inserted, ` +
      `${todoInsertCount} todos inserted (project ${projectId})`,
  );

  // 6. Return updated SWM
  return { swm };
}

module.exports = todoAgent;
