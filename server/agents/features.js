// ── Feature Extraction Agent ─────────────────────────────────────────────
// Processes each PRD chunk serially, calling the LLM to extract features,
// implicit requirements, data entities, and conflicts.  Each chunk sees the
// FULL current SWM (including mutations from previous chunks) so that entity
// deduplication happens naturally.

const { FEATURE_SYSTEM, FEATURE_USER } = require('./prompts');

/**
 * @param {object} swm  - current Shared World Model
 * @param {object} ctx  - { projectId, runId, query, openai, log, config }
 * @returns {Promise<{swm: object}>}
 */
async function featureAgent(swm, ctx) {
  const { projectId, openai, log, config } = ctx;
  const model = (config && config.FEATURE_MODEL) || 'openai/gpt-4o';

  // 1. Get chunks — throw if empty
  const chunks = swm.prd_chunks;
  if (!Array.isArray(chunks) || chunks.length === 0) {
    throw new Error('No prd_chunks found in SWM — run chunking agent first');
  }

  // 2. Deep clone SWM for mutation
  const workingSWM = {
    ...swm,
    entities: JSON.parse(JSON.stringify(swm.entities || {})),
    features: Array.isArray(swm.features)
      ? swm.features.map((f) => ({ ...f }))
      : [],
    conflicts: Array.isArray(swm.conflicts)
      ? swm.conflicts.map((c) => ({ ...c }))
      : [],
    assumptions_log: Array.isArray(swm.assumptions_log)
      ? swm.assumptions_log.map((a) => ({ ...a }))
      : [],
  };

  // Running counters for IDs
  let featureCounter = workingSWM.features.length;
  let conflictCounter = workingSWM.conflicts.length;

  log('features', `Starting feature extraction for ${chunks.length} chunks (project ${projectId})`);

  // 3. Process each chunk serially
  for (const chunk of chunks) {
    log('features', `Processing chunk domain=${chunk.domain}`);

    // 3b. Call LLM
    const completion = await openai.chat.completions.create({
      model,
      response_format: { type: 'json_object' },
      temperature: 0.3,
      messages: [
        { role: 'system', content: FEATURE_SYSTEM },
        { role: 'user', content: FEATURE_USER(chunk, workingSWM) },
      ],
    });

    const raw = completion.choices[0].message.content;

    // 3c. Parse JSON response
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new Error(
        `LLM returned invalid JSON for chunk ${chunk.id} (${chunk.domain}): ${err.message}`,
      );
    }

    // 3d. Merge features — both explicit and implicit
    const explicitFeatures = Array.isArray(parsed.features) ? parsed.features : [];
    const implicitFeatures = Array.isArray(parsed.implicit_features) ? parsed.implicit_features : [];
    const allNewFeatures = [...explicitFeatures, ...implicitFeatures];

    for (const feat of allNewFeatures) {
      featureCounter += 1;
      workingSWM.features.push({
        id: `f_${featureCounter}`,
        title: String(feat.title || 'Untitled'),
        domain: chunk.domain,
        actors: Array.isArray(feat.actors)
          ? feat.actors.map((a) => String(a).toLowerCase())
          : [],
        entities: Array.isArray(feat.entities)
          ? feat.entities.map((e) => String(e).toLowerCase())
          : [],
      });
    }

    // 3e. Merge entities
    const proposedEntities = parsed.proposed_entities || {};
    for (const [entityName, entityDef] of Object.entries(proposedEntities)) {
      const key = String(entityName).toLowerCase();
      const fields = Array.isArray(entityDef.fields) ? entityDef.fields : [];
      const assumptions = Array.isArray(entityDef.assumptions) ? entityDef.assumptions : [];

      if (!workingSWM.entities[key]) {
        // New entity
        workingSWM.entities[key] = {
          fields,
          owned_by: [chunk.domain],
          assumptions,
        };
      } else {
        // Entity exists — add domain to owned_by if not there
        const existing = workingSWM.entities[key];
        if (!Array.isArray(existing.owned_by)) {
          existing.owned_by = [];
        }
        if (!existing.owned_by.includes(chunk.domain)) {
          existing.owned_by.push(chunk.domain);
        }
        // Merge new fields that don't exist yet (don't overwrite)
        if (!Array.isArray(existing.fields)) {
          existing.fields = [];
        }
        for (const field of fields) {
          if (!existing.fields.includes(field)) {
            existing.fields.push(field);
          }
        }
        // Merge assumptions
        if (!Array.isArray(existing.assumptions)) {
          existing.assumptions = [];
        }
        for (const assumption of assumptions) {
          if (!existing.assumptions.includes(assumption)) {
            existing.assumptions.push(assumption);
          }
        }
      }
    }

    // 3f. Append conflicts
    const newConflicts = Array.isArray(parsed.conflicts) ? parsed.conflicts : [];
    for (const conflict of newConflicts) {
      conflictCounter += 1;
      workingSWM.conflicts.push({
        id: `conflict_${conflictCounter}`,
        type: String(conflict.type || 'unknown'),
        entity: String(conflict.entity || '').toLowerCase(),
        existing_field: conflict.existing_field || null,
        proposed_change: conflict.proposed_change || null,
        reason: conflict.reason || null,
        source: chunk.domain,
      });
    }

    // 3g. Append assumptions (from proposed_entities)
    for (const [entityName, entityDef] of Object.entries(proposedEntities)) {
      const key = String(entityName).toLowerCase();
      if (Array.isArray(entityDef.assumptions)) {
        for (const assumption of entityDef.assumptions) {
          workingSWM.assumptions_log.push({
            assumption: String(assumption),
            entity: key,
            source: chunk.domain,
          });
        }
      }
    }

    // Also append any top-level assumptions_made if present
    if (Array.isArray(parsed.assumptions_made)) {
      for (const a of parsed.assumptions_made) {
        workingSWM.assumptions_log.push({
          assumption: String(a.assumption || a),
          entity: Array.isArray(a.affects) ? a.affects.join(', ') : null,
          source: chunk.domain,
        });
      }
    }

    // 3h. Log counts
    log(
      'features',
      `Chunk ${chunk.domain}: +${allNewFeatures.length} features, ` +
        `+${Object.keys(proposedEntities).length} entities, ` +
        `+${newConflicts.length} conflicts`,
    );
  }

  // 4. Log total counts
  log(
    'features',
    `Feature extraction complete: ${workingSWM.features.length} features, ` +
      `${Object.keys(workingSWM.entities).length} entities, ` +
      `${workingSWM.conflicts.length} conflicts, ` +
      `${workingSWM.assumptions_log.length} assumptions`,
  );

  // 5. Return updated SWM
  return { swm: workingSWM };
}

module.exports = featureAgent;
