const { parseLLMJSON } = require('./json-parse');

const EXTRACT_SYSTEM = `You are a feature extraction and task breakdown agent. Given a PRD module, extract features and concrete implementation todos.

RULES:
- Extract 3-8 features for this module. Focus on the most important ones.
- Each feature must have: title, description, and 2-5 specific implementation todos.
- Todos should be concrete: "Create users table with email/password columns" not "Implement auth".
- Group each todo as BE (backend), FE (frontend), or Infra.
- Assign confidence 0.0-1.0 per feature.
- If dependency features are listed, build ON TOP of them — don't duplicate.

Return ONLY valid JSON:
{
  "features": [
    {
      "title": "OTP Login",
      "description": "Users log in by entering email and receiving a one-time code",
      "confidence": 0.9,
      "entities": ["user", "otp"],
      "todos": [
        {"title": "Create users table migration", "detail": "id UUID PK, email UNIQUE, created_at", "group": "BE"},
        {"title": "OTP generate + verify endpoints", "detail": "POST /api/auth/otp/send, POST /api/auth/otp/verify", "group": "BE"},
        {"title": "Login page UI", "detail": "Email input + OTP entry screen with timer", "group": "FE"}
      ]
    }
  ]
}`;

function EXTRACT_USER(moduleName, moduleSummary, prdContent) {
  return `Module: ${moduleName}
Summary: ${moduleSummary}

Relevant PRD content:
--- START ---
${prdContent}
--- END ---

Extract features and implementation todos for this module. Focus on the most impactful features.`;
}

async function extractAgent(swm, ctx) {
  const { projectId, runId, query, openai, log, config } = ctx;
  const model = (config && config.FEATURE_MODEL) || 'openai/gpt-oss-120b';

  // Load ALL modules (pending + in_progress + done) for dependency resolution
  const allMods = await query(
    `SELECT * FROM pipeline_modules WHERE run_id = $1 ORDER BY rank`,
    [runId]
  );

  const pending = allMods.rows.filter(r => r.status === 'pending');
  const done = allMods.rows.filter(r => r.status === 'done');

  if (pending.length === 0) {
    log('extract', 'No pending modules — skipping');
    return { swm: { ...swm, features_extracted: 0, todos_generated: 0 } };
  }

  log('extract', `${pending.length} pending, ${done.length} done`);

  const projectRes = await query('SELECT prd_text FROM projects WHERE id = $1', [projectId]);
  const fullPrdText = projectRes.rows[0]?.prd_text || '';

  let totalFeatures = done.reduce((s, m) => s + (m.features_count || 0), 0);
  let totalTodos = 0;
  let processed = 0;
  const maxPasses = pending.length * 3; // prevent infinite loop on cycles

  while (processed < pending.length && maxPasses > 0) {
    let madeProgress = false;

    for (const mod of pending) {
      if (mod.status === 'in_progress' || mod.status === 'done') continue;

      // Check if all dependencies are resolved (done or skipped)
      const deps = (mod.dependencies || []);
      const unresolvedDep = deps.find(d => {
        const depMod = allMods.rows.find(r => r.id === d.module_id);
        return depMod && depMod.status !== 'done' && depMod.status !== 'skipped';
      });

      if (unresolvedDep) {
        log('extract', `  Skipping ${mod.name} — waiting for dependency: ${unresolvedDep.module_name || unresolvedDep.module_id}`);
        continue;
      }

      // Ready to process
      await query("UPDATE pipeline_modules SET status = 'in_progress' WHERE id = $1", [mod.id]);
      mod.status = 'in_progress';
      log('extract', `Module: ${mod.name} (rank ${mod.rank})`);

      const prdContent = mod.prd_content || fullPrdText;

      // Build dependency context: summaries + already-extracted feature titles
      let depCtx = '';
      if (deps.length > 0) {
        depCtx = '\n--- Dependency Context ---\n';
        for (const d of deps) {
          const depMod = allMods.rows.find(r => r.id === d.module_id);
          if (!depMod) continue;
          depCtx += `\nModule: ${depMod.name}\nSummary: ${depMod.summary}\n`;

          // Include already-extracted features of this dependency
          if (depMod.status === 'done') {
            const featRows = await query(
              `SELECT title, description FROM features WHERE project_id = $1 AND module = $2 ORDER BY created_at`,
              [projectId, depMod.name]
            );
            if (featRows.rows.length > 0) {
              depCtx += 'Extracted features:\n';
              for (const f of featRows.rows) {
                depCtx += `  - ${f.title}: ${(f.description || '').slice(0, 100)}\n`;
              }
            }
          }
        }
        depCtx += '---\n';
      }

      const prompt = EXTRACT_USER(mod.name, mod.summary, prdContent) + depCtx;

      const completion = await openai.chat.completions.create({
        model,
        temperature: 0.3,
        response_format: { type: 'json_object' },
        max_tokens: 4096,
        messages: [
          { role: 'system', content: EXTRACT_SYSTEM },
          { role: 'user', content: prompt },
        ],
      });

      const raw = completion.choices[0].message.content;
      const parsed = parseLLMJSON(raw);
      const features = Array.isArray(parsed.features) ? parsed.features : [];

      for (const feat of features) {
        const entities = Array.isArray(feat.entities) ? feat.entities : [];
        const confidence = typeof feat.confidence === 'number' ? feat.confidence : 0.5;
        if (confidence < 0.6) continue;

        const featRes = await query(
          `INSERT INTO features (project_id, title, description, entities, module, confidence, status)
           VALUES ($1, $2, $3, $4, $5, $6, 'draft') RETURNING id`,
          [projectId, feat.title, feat.description || '', entities, mod.name, confidence]
        );
        const featureId = featRes.rows[0].id;
        totalFeatures++;

        const todos = Array.isArray(feat.todos) ? feat.todos : [];
        for (const todo of todos) {
          await query(
            `INSERT INTO todos (project_id, feature_id, title, detail, status, "group")
             VALUES ($1, $2, $3, $4, 'open', $5)`,
            [projectId, featureId, todo.title, todo.detail || '', todo.group || 'BE']
          );
          totalTodos++;
        }
      }

      await query(
        `UPDATE pipeline_modules SET status = 'done', features_count = $1 WHERE id = $2`,
        [features.length, mod.id]
      );
      mod.status = 'done';
      mod.features_count = features.length;
      processed++;
      madeProgress = true;
      log('extract', `  Done: ${features.length} features`);
    }

    if (!madeProgress) {
      log('extract', 'Deadlock: all remaining modules have unresolved dependencies');
      break;
    }
  }

  log('extract', `Complete: ${totalFeatures} features, ${totalTodos} todos, ${processed} modules`);
  return { swm: { ...swm, features_extracted: totalFeatures, todos_generated: totalTodos } };
}

module.exports = extractAgent;
