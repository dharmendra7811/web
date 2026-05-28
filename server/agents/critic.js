// ── Critic / Conflict Resolution Agent ──────────────────────────────────
// Reviews the Shared World Model (SWM), resolves entity conflicts, merges
// entities, and can pause the pipeline for human review via a checkpoint.

const { CRITIC_SYSTEM, CRITIC_USER } = require('./prompts');

/**
 * @param {object} swm  - current Shared World Model
 * @param {object} ctx  - { projectId, runId, query, openai, log, config }
 * @returns {Promise<{swm: object, checkpoint?: object}>}
 */
async function criticAgent(swm, ctx) {
  const { projectId, openai, log, config } = ctx;
  const model = (config && config.CRITIC_MODEL) || 'openai/gpt-4o';

  // 1. Get unresolved conflicts
  const unresolvedConflicts = Array.isArray(swm.conflicts)
    ? swm.conflicts.filter((c) => !c.resolved)
    : [];

  // 2. If no unresolved conflicts, skip
  if (unresolvedConflicts.length === 0) {
    log('critic', `No unresolved conflicts for project ${projectId} — skipping`);
    return { swm };
  }

  log('critic', `Found ${unresolvedConflicts.length} unresolved conflicts for project ${projectId}`);

  // 3. Call LLM
  const completion = await openai.chat.completions.create({
    model,
    response_format: { type: 'json_object' },
    temperature: 0.2,
    messages: [
      { role: 'system', content: CRITIC_SYSTEM },
      { role: 'user', content: CRITIC_USER(swm) },
    ],
  });

  const raw = completion.choices[0].message.content;

  // 4. Parse JSON response
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`LLM returned invalid JSON from critic agent: ${err.message}`);
  }

  // 5. Deep clone SWM for mutation
  const workingSWM = {
    ...swm,
    entities: JSON.parse(JSON.stringify(swm.entities || {})),
    conflicts: Array.isArray(swm.conflicts)
      ? swm.conflicts.map((c) => ({ ...c }))
      : [],
    conflicts_resolved: Array.isArray(swm.conflicts_resolved)
      ? swm.conflicts_resolved.map((c) => ({ ...c }))
      : [],
    gaps: Array.isArray(swm.gaps) ? [...swm.gaps] : [],
    assumptions_log: Array.isArray(swm.assumptions_log)
      ? swm.assumptions_log.map((a) => ({ ...a }))
      : [],
  };

  // 5a. Apply resolved conflicts
  const resolutions = Array.isArray(parsed.resolutions) ? parsed.resolutions : [];
  let resolvedCount = 0;
  let flaggedForHuman = [];

  for (const resolution of resolutions) {
    const conflictId = resolution.conflict_id;
    if (!conflictId) continue;

    // Find matching conflict in SWM
    const conflictIdx = workingSWM.conflicts.findIndex((c) => c.id === conflictId);
    if (conflictIdx === -1) {
      log('critic', `Resolution references unknown conflict_id: ${conflictId} — skipping`);
      continue;
    }

    const conflict = workingSWM.conflicts[conflictIdx];
    const confidence = typeof resolution.confidence === 'number' ? resolution.confidence : 1.0;
    const needsHuman = resolution.needs_human_review === true || confidence < 0.7;

    if (needsHuman) {
      // Flag for human review — do not mark as resolved yet
      flaggedForHuman.push({
        conflict_id: conflictId,
        resolution: resolution.resolution || '',
        confidence,
        type: conflict.type,
        entity: conflict.entity,
      });
      log('critic', `Conflict ${conflictId} flagged for human review (confidence ${confidence})`);
    } else {
      // Mark as resolved
      conflict.resolved = true;
      conflict.resolution = resolution.resolution || '';
      conflict.confidence = confidence;

      // Move to resolved list
      workingSWM.conflicts_resolved.push({ ...conflict });
      workingSWM.conflicts.splice(conflictIdx, 1);
      resolvedCount++;
    }

    // If canonical_entity provided, update swm.entities
    if (resolution.canonical_entity && typeof resolution.canonical_entity === 'object') {
      const entityName = resolution.canonical_entity.name || conflict.entity;
      if (entityName) {
        const key = String(entityName).toLowerCase();
        const existing = workingSWM.entities[key] || {};

        // Merge/overwrite fields
        if (Array.isArray(resolution.canonical_entity.fields)) {
          existing.fields = resolution.canonical_entity.fields;
        }
        if (Array.isArray(resolution.canonical_entity.owned_by)) {
          existing.owned_by = resolution.canonical_entity.owned_by;
        }
        if (Array.isArray(resolution.canonical_entity.assumptions)) {
          existing.assumptions = resolution.canonical_entity.assumptions;
        }

        workingSWM.entities[key] = existing;
        log('critic', `Applied canonical_entity for "${key}"`);
      }
    }
  }

  // 5b. Apply final_entities from critic result to swm.entities
  if (parsed.final_entities && typeof parsed.final_entities === 'object') {
    for (const [entityName, entityDef] of Object.entries(parsed.final_entities)) {
      const key = String(entityName).toLowerCase();
      workingSWM.entities[key] = {
        ...(workingSWM.entities[key] || {}),
        ...entityDef,
      };
    }
    log('critic', `Applied ${Object.keys(parsed.final_entities).length} final_entities`);
  }

  // 6. Record gaps identified by the critic
  if (Array.isArray(parsed.gaps)) {
    for (const gap of parsed.gaps) {
      workingSWM.gaps.push({
        type: gap.type || 'unknown',
        description: gap.description || '',
        suggested_fix: gap.suggested_fix || null,
        source: 'critic',
      });
    }
    log('critic', `Recorded ${parsed.gaps.length} gaps`);
  }

  // 7. Record assumptions made by the critic
  if (Array.isArray(parsed.assumptions_made)) {
    for (const a of parsed.assumptions_made) {
      workingSWM.assumptions_log.push({
        assumption: String(a.assumption || ''),
        entity: Array.isArray(a.affects) ? a.affects.join(', ') : null,
        source: 'critic',
        confidence: a.confidence || null,
      });
    }
    log('critic', `Recorded ${parsed.assumptions_made.length} assumptions`);
  }

  // 8. Log summary
  log(
    'critic',
    `Critic complete: ${resolvedCount} resolved, ${flaggedForHuman.length} flagged for human review`,
  );

  // 9. If flagged_for_human exists, create checkpoint with max 2 questions
  if (flaggedForHuman.length > 0) {
    const questions = flaggedForHuman.slice(0, 2).map((item, idx) => ({
      id: `q_${idx + 1}`,
      question: item.resolution
        ? `The following conflict resolution has low confidence (${item.confidence}): ${item.resolution}. Do you agree?`
        : `Conflict of type "${item.type}" on entity "${item.entity}" needs your input.`,
      options: ['Accept', 'Reject', 'Modify'],
      context: {
        type: item.type,
        entity: item.entity,
        confidence: item.confidence,
      },
      conflict_id: item.conflict_id,
    }));

    log('critic', `Checkpoint: ${questions.length} questions for human review`);
    return { swm: workingSWM, checkpoint: { questions } };
  }

  // 10. Return updated SWM
  return { swm: workingSWM };
}

module.exports = criticAgent;
