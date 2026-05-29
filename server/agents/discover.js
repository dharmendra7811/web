const { parseLLMJSON } = require('./json-parse');

const DISCOVER_SYSTEM = `You are a PRD analysis agent. Your job is to read a Product Requirements Document and identify the top-level feature modules.

RULES:
- Identify 4-10 distinct modules/feature areas. Do NOT create tiny modules.
- Each module should be a substantial, user-facing feature area.
- Rank modules by importance: 1 = most critical/core, higher = less critical.
- For each module provide: name, summary, key entities, relevant PRD content, and dependencies.
- Dependencies: list other modules this module depends on. type is "depends_on" (prerequisite) or "related_to" (loose coupling). Include a short reason.
- Group related concerns — e.g. "User Auth" covers login, signup, OTP, sessions, roles.

Return ONLY valid JSON. No markdown, no explanation.

Output format:
{
  "modules": [
    {
      "name": "User Authentication",
      "rank": 1,
      "summary": "OTP-based login/signup with Google OAuth, session management, and role-based access",
      "entities": ["user", "session", "otp", "role"],
      "prd_content": "The exact PRD sections and text relevant to this module...",
      "dependencies": [
        {"module": "User Authentication", "type": "depends_on", "reason": "Checkout requires authenticated user"}
      ]
    }
  ]
}`;

function DISCOVER_USER(prdText) {
  return `Analyze this PRD and identify the key feature modules, ranked by importance (1 = most critical).

--- PRD START ---
${prdText}
--- PRD END ---

Return the modules as a JSON object with a "modules" array.`;
}

async function discoverAgent(swm, ctx) {
  const { projectId, runId, query, openai, log, config } = ctx;
  const model = (config && config.CHUNKING_MODEL) || 'openai/gpt-oss-120b';

  log('discover', `Starting module discovery for project ${projectId}`);

  const { rows } = await query('SELECT prd_text FROM projects WHERE id = $1', [projectId]);
  if (!rows.length || !rows[0].prd_text) {
    throw new Error(`No prd_text found for project ${projectId}`);
  }

  const prdText = rows[0].prd_text;
  log('discover', `PRD text length: ${prdText.length} chars`);

  const completion = await openai.chat.completions.create({
    model,
    temperature: 0.3,
    messages: [
      { role: 'system', content: DISCOVER_SYSTEM },
      { role: 'user', content: DISCOVER_USER(prdText) },
    ],
  });

  const raw = completion.choices[0].message.content;
  const parsed = parseLLMJSON(raw);

  const modules = Array.isArray(parsed.modules) ? parsed.modules : (Array.isArray(parsed) ? parsed : []);
  if (modules.length === 0) throw new Error('LLM returned 0 modules');
  if (modules.length > 15) throw new Error(`LLM returned ${modules.length} modules (max 15)`);

  // Persist modules to DB (first pass: insert without resolved dependencies)
  const inserted = [];
  for (let i = 0; i < modules.length; i++) {
    const m = modules[i];
    const res = await query(
      `INSERT INTO pipeline_modules (run_id, project_id, name, rank, summary, entities, prd_content, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending') RETURNING id`,
      [runId, projectId, m.name, m.rank || i + 1, m.summary || '', JSON.stringify(m.entities || []), m.prd_content || '']
    );
    inserted.push({ id: res.rows[0].id, name: m.name, rawDeps: m.dependencies || [] });
  }

  // Second pass: resolve name-based dependencies to ID references
  const nameToId = {};
  for (const mod of inserted) nameToId[mod.name] = mod.id;

  for (const mod of inserted) {
    const resolved = (mod.rawDeps || []).map(d => ({
      module_id: nameToId[d.module] || null,
      module_name: d.module,
      type: d.type || 'depends_on',
      reason: d.reason || '',
    })).filter(d => d.module_id); // only keep deps with valid IDs

    await query('UPDATE pipeline_modules SET dependencies = $1 WHERE id = $2',
      [JSON.stringify(resolved), mod.id]);
  }

  log('discover', `Discovered ${modules.length} modules`);
  return { swm: { ...swm, modules_discovered: modules.length, modules } };
}

module.exports = discoverAgent;
