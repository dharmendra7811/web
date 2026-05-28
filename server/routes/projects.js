module.exports = function registerProjectRoutes(server, deps) {
  const { query } = deps;

server.get('/health', async (request, reply) => {
  try {
    await query('SELECT 1');
    return { status: 'ok', database: 'connected' };
  } catch (err) {
    return { status: 'error', database: 'disconnected', error: err.message };
  }
});

// Project routes
server.post('/api/projects', async (request, reply) => {
  const { name, prd_text } = request.body;

  const result = await query(
    'INSERT INTO projects (name, prd_text) VALUES ($1, $2) RETURNING *',
    [name, prd_text]
  );

  const project = result.rows[0];

  return project;
});

// GET all projects
server.get('/api/projects', async (request, reply) => {
  const result = await query('SELECT * FROM projects ORDER BY created_at DESC');
  return result.rows;
});

server.get('/api/projects/:id', async (request, reply) => {
  const { id } = request.params;

  // Get project with features and todos
  const projectResult = await query('SELECT * FROM projects WHERE id = $1', [id]);
  if (projectResult.rows.length === 0) {
    return reply.code(404).send({ error: 'Project not found' });
  }

  const project = projectResult.rows[0];

  // Get features
  const featuresResult = await query(
    'SELECT * FROM features WHERE project_id = $1 ORDER BY order_index',
    [id]
  );

  // Get todos for each feature
  for (const feature of featuresResult.rows) {
    const todosResult = await query(
      'SELECT * FROM todos WHERE feature_id = $1 ORDER BY order_index',
      [feature.id]
    );
    feature.todos = todosResult.rows;
  }

  project.features = featuresResult.rows;

  return project;
});

server.delete('/api/projects/:id', async (request, reply) => {
  const { id } = request.params;

  // Validate UUID format to prevent database 500 errors (which look like CORS errors in browsers)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    return reply.code(400).send({ error: 'Invalid project ID format (must be a valid UUID)' });
  }

  try {
    const result = await query('DELETE FROM projects WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return reply.code(404).send({ error: 'Project not found' });
    }

    return { success: true };
  } catch (error) {
    request.log.error(error);
    return reply.code(500).send({ error: 'Failed to delete project' });
  }
});

server.post('/api/projects/:id/prd', async (request, reply) => {
  // In a real app, handle file upload here
  // For now, we assume prd_text is in the body
  const { id } = request.params;
  const { prd_text } = request.body;

  const result = await query(
    'UPDATE projects SET prd_text = $1 WHERE id = $2 RETURNING *',
    [prd_text, id]
  );

  if (result.rows.length === 0) {
    return reply.code(404).send({ error: 'Project not found' });
  }

  const project = result.rows[0];

  // Pipeline trigger moved to POST /api/projects/:id/clarify
  // We no longer trigger extraction immediately on PRD update

  return project;
});

// Feature routes
server.get('/api/projects/:id/features', async (request, reply) => {
  const { id } = request.params;

  const result = await query(
    'SELECT * FROM features WHERE project_id = $1 ORDER BY order_index',
    [id]
  );

  return result.rows;
});

server.patch('/api/features/:id', async (request, reply) => {
  const { id } = request.params;
  const { title, description, status, order_index, human_locked } = request.body;

  // Build dynamic update query
  const fields = [];
  const values = [];
  let paramIndex = 1;

  if (title !== undefined) {
    fields.push(`title = $${paramIndex++}`);
    values.push(title);
  }
  if (description !== undefined) {
    fields.push(`description = $${paramIndex++}`);
    values.push(description);
  }
  if (status !== undefined) {
    fields.push(`status = $${paramIndex++}`);
    values.push(status);
  }
  if (order_index !== undefined) {
    fields.push(`order_index = $${paramIndex++}`);
    values.push(order_index);
  }
  if (human_locked !== undefined) {
    fields.push(`human_locked = $${paramIndex++}`);
    values.push(human_locked);
  }

  if (fields.length === 0) {
    return reply.code(400).send({ error: 'No fields to update' });
  }

  fields.push(`updated_at = NOW()`);
  values.push(id); // for WHERE clause

  const queryStr = `
    UPDATE features 
    SET ${fields.join(', ')}
    WHERE id = $${paramIndex}
    RETURNING *
  `;

  const result = await query(queryStr, values);

  if (result.rows.length === 0) {
    return reply.code(404).send({ error: 'Feature not found' });
  }

  return result.rows[0];
});

server.delete('/api/features/:id', async (request, reply) => {
  const { id } = request.params;

  const result = await query('DELETE FROM features WHERE id = $1 RETURNING *', [id]);

  if (result.rows.length === 0) {
    return reply.code(404).send({ error: 'Feature not found' });
  }

  return { success: true };
});

// Todo routes
server.get('/api/features/:id/todos', async (request, reply) => {
  const { id } = request.params;

  const result = await query(
    'SELECT * FROM todos WHERE feature_id = $1 ORDER BY order_index',
    [id]
  );

  return result.rows;
});

server.post('/api/features/:id/todos', async (request, reply) => {
  const { id } = request.params;
  const { title, detail, entities, depends_on, status, order_index, human_locked, ticket_id, ticket_adapter } = request.body;

  const result = await query(
    `INSERT INTO todos 
      (feature_id, title, detail, entities, depends_on, status, order_index, human_locked, ticket_id, ticket_adapter) 
    VALUES 
      ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
    RETURNING *`,
    [
      id,
      title,
      detail,
      (entities || []).map(e => e.toLowerCase()),
      depends_on,
      status || 'open',
      order_index || 0,
      human_locked || false,
      ticket_id,
      ticket_adapter
    ]
  );

  return result.rows[0];
});

server.patch('/api/todos/:id', async (request, reply) => {
  const { id } = request.params;
  const { title, detail, status, order_index, human_locked } = request.body;

  // Build dynamic update query
  const fields = [];
  const values = [];
  let paramIndex = 1;

  if (title !== undefined) {
    fields.push(`title = $${paramIndex++}`);
    values.push(title);
  }
  if (detail !== undefined) {
    fields.push(`detail = $${paramIndex++}`);
    values.push(detail);
  }
  if (status !== undefined) {
    fields.push(`status = $${paramIndex++}`);
    values.push(status);
  }
  if (order_index !== undefined) {
    fields.push(`order_index = $${paramIndex++}`);
    values.push(order_index);
  }
  if (human_locked !== undefined) {
    fields.push(`human_locked = $${paramIndex++}`);
    values.push(human_locked);
  }

  if (fields.length === 0) {
    return reply.code(400).send({ error: 'No fields to update' });
  }

  fields.push(`updated_at = NOW()`);
  values.push(id); // for WHERE clause

  const queryStr = `
    UPDATE todos 
    SET ${fields.join(', ')}
    WHERE id = $${paramIndex}
    RETURNING *
  `;

  const result = await query(queryStr, values);

  if (result.rows.length === 0) {
    return reply.code(404).send({ error: 'Todo not found' });
  }

  return result.rows[0];
});

server.delete('/api/todos/:id', async (request, reply) => {
  const { id } = request.params;

  const result = await query('DELETE FROM todos WHERE id = $1 RETURNING *', [id]);

  if (result.rows.length === 0) {
    return reply.code(404).send({ error: 'Todo not found' });
  }

  return { success: true };
});

// Chat routes
// GET all chat sessions for a project
server.get('/api/projects/:id/chat/sessions', async (request, reply) => {
  const { id } = request.params;

  try {
    const sessionsRes = await query(
      "SELECT id, status, created_at FROM chat_sessions WHERE project_id = $1 ORDER BY created_at DESC",
      [id]
    );

    const sessions = [];
    for (const session of sessionsRes.rows) {
      // Find the first user message for a title
      const firstMsg = await query(
        "SELECT content FROM chat_messages WHERE session_id = $1 AND role = 'user' ORDER BY created_at ASC LIMIT 1",
        [session.id]
      );
      sessions.push({
        id: session.id,
        status: session.status,
        created_at: session.created_at,
        title: firstMsg.rows[0]?.content || "New conversation"
      });
    }

    return sessions;
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Failed to retrieve chat sessions', details: err.message });
  }
});

// POST to create a new chat session for a project
server.post('/api/projects/:id/chat/sessions', async (request, reply) => {
  const { id } = request.params;

  try {
    // 1. Optional: Archive or update older open sessions
    await query(
      "UPDATE chat_sessions SET status = 'committed' WHERE project_id = $1 AND status = 'open'",
      [id]
    );

    // 2. Create new session
    const sessionRes = await query(
      "INSERT INTO chat_sessions (project_id, status) VALUES ($1, 'open') RETURNING id, status, created_at",
      [id]
    );
    const newSession = sessionRes.rows[0];

    return {
      session_id: newSession.id,
      messages: [
        {
          id: 'welcome',
          sender: 'ai',
          text: "Hello! I am your Requirements Impact Assistant. Ask me to add features, adjust tasks, or perform impact triage. Try typing 'Add Google OAuth login' or click one of the quick commands below!"
        }
      ]
    };
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Failed to create chat session', details: err.message });
  }
});

// GET specific chat session history
server.get('/api/projects/:id/chat/sessions/:session_id/history', async (request, reply) => {
  const { id, session_id } = request.params;

  try {
    // 1. Fetch all messages in the session
    const messagesRes = await query(
      "SELECT id, role, content, created_at FROM chat_messages WHERE session_id = $1 ORDER BY created_at ASC, id ASC",
      [session_id]
    );

    // 2. Fetch all suggestions in the session
    const suggestionsRes = await query(
      "SELECT * FROM impact_suggestions WHERE session_id = $1",
      [session_id]
    );

    // Group suggestions by triggered_by (user message content)
    const suggestionsByTrigger = {};
    for (const sug of suggestionsRes.rows) {
      const key = sug.triggered_by || '';
      if (!suggestionsByTrigger[key]) {
        suggestionsByTrigger[key] = [];
      }
      let proposedVal = sug.proposed_value;
      if (typeof proposedVal === 'string') {
        try {
          proposedVal = JSON.parse(proposedVal);
        } catch (e) { }
      }
      suggestionsByTrigger[key].push({
        ...sug,
        proposed_value: proposedVal
      });
    }

    // Attach suggestions to the assistant message immediately following the triggering user message
    const messages = [];
    for (let i = 0; i < messagesRes.rows.length; i++) {
      const msg = messagesRes.rows[i];
      const mappedMsg = {
        id: msg.id,
        sender: msg.role === 'user' ? 'user' : 'ai',
        text: msg.content,
        created_at: msg.created_at,
        suggestions: []
      };

      if (msg.role === 'assistant') {
        // Find the preceding user message
        const prevMsg = messagesRes.rows[i - 1];
        if (prevMsg && prevMsg.role === 'user') {
          const triggerText = prevMsg.content;
          if (suggestionsByTrigger[triggerText]) {
            mappedMsg.suggestions = suggestionsByTrigger[triggerText];
          }
        }
      }
      messages.push(mappedMsg);
    }

    return {
      session_id: session_id,
      messages: messages.length > 0 ? messages : [
        {
          id: 'welcome',
          sender: 'ai',
          text: "Hello! I am your Requirements Impact Assistant. Ask me to add features, adjust tasks, or perform impact triage. Try typing 'Add Google OAuth login' or click one of the quick commands below!"
        }
      ]
    };
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Failed to retrieve session history', details: err.message });
  }
});

// GET active chat session history for a project
server.get('/api/projects/:id/chat/history', async (request, reply) => {
  const { id } = request.params;

  try {
    // 1. Get or create active session
    let sessionRes = await query(
      "SELECT id FROM chat_sessions WHERE project_id = $1 AND status = 'open' ORDER BY created_at DESC LIMIT 1",
      [id]
    );
    let sessionId;
    if (sessionRes.rows.length === 0) {
      const newSession = await query(
        "INSERT INTO chat_sessions (project_id, status) VALUES ($1, 'open') RETURNING id",
        [id]
      );
      sessionId = newSession.rows[0].id;
    } else {
      sessionId = sessionRes.rows[0].id;
    }

    // 2. Fetch all messages in the session
    const messagesRes = await query(
      "SELECT id, role, content, created_at FROM chat_messages WHERE session_id = $1 ORDER BY created_at ASC, id ASC",
      [sessionId]
    );

    // 3. Fetch all suggestions in the session
    const suggestionsRes = await query(
      "SELECT * FROM impact_suggestions WHERE session_id = $1",
      [sessionId]
    );

    // Group suggestions by triggered_by (user message content)
    const suggestionsByTrigger = {};
    for (const sug of suggestionsRes.rows) {
      const key = sug.triggered_by || '';
      if (!suggestionsByTrigger[key]) {
        suggestionsByTrigger[key] = [];
      }
      let proposedVal = sug.proposed_value;
      if (typeof proposedVal === 'string') {
        try {
          proposedVal = JSON.parse(proposedVal);
        } catch (e) { }
      }
      suggestionsByTrigger[key].push({
        ...sug,
        proposed_value: proposedVal
      });
    }

    // Attach suggestions to the assistant message immediately following the triggering user message
    const messages = [];
    for (let i = 0; i < messagesRes.rows.length; i++) {
      const msg = messagesRes.rows[i];
      const mappedMsg = {
        id: msg.id,
        sender: msg.role === 'user' ? 'user' : 'ai',
        text: msg.content,
        created_at: msg.created_at,
        suggestions: []
      };

      if (msg.role === 'assistant') {
        // Find the preceding user message
        const prevMsg = messagesRes.rows[i - 1];
        if (prevMsg && prevMsg.role === 'user') {
          const triggerText = prevMsg.content;
          if (suggestionsByTrigger[triggerText]) {
            mappedMsg.suggestions = suggestionsByTrigger[triggerText];
          }
        }
      }
      messages.push(mappedMsg);
    }

    return {
      session_id: sessionId,
      messages: messages
    };
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Failed to retrieve chat history', details: err.message });
  }
});

// GET all suggestions for a project
server.get('/api/projects/:id/suggestions', async (request, reply) => {
  const { id } = request.params;
  const result = await query(
    "SELECT * FROM impact_suggestions WHERE project_id = $1 AND status = 'pending' ORDER BY created_at DESC",
    [id]
  );
  return result.rows;
});

// APPLY suggestion
server.post('/api/suggestions/:id/apply', async (request, reply) => {
  const { id } = request.params;
  const { feature_id: overrideFeatureId } = request.body || {};

  try {
    const sugRes = await query('SELECT * FROM impact_suggestions WHERE id = $1', [id]);
    if (sugRes.rows.length === 0) {
      return reply.code(404).send({ error: 'Suggestion not found' });
    }
    const suggestion = sugRes.rows[0];

    if (suggestion.status !== 'pending') {
      return reply.code(400).send({ error: 'Suggestion has already been applied or skipped' });
    }

    const proposed = { ...suggestion.proposed_value };
    if (overrideFeatureId) proposed.feature_id = overrideFeatureId;

    if (suggestion.target_type === 'feature') {
      // ---- FEATURE-LEVEL operations ----
      if (suggestion.suggestion_type === 'add') {
        const mod = proposed.module || 'General';
        const conf = proposed.confidence || 0.8;
        const ents = (proposed.entities || []).map(e => e.toLowerCase());
        const countRes = await query('SELECT COUNT(*) FROM features WHERE project_id = $1', [suggestion.project_id]);
        const orderIdx = parseInt(countRes.rows[0].count) || 0;

        await query('BEGIN');
        try {
          const featRes = await query(
            `INSERT INTO features (project_id, title, description, entities, status, order_index, human_locked, module, confidence, created_by_suggestion)
             VALUES ($1, $2, $3, $4, 'draft', $5, true, $6, $7, $8) RETURNING id`,
            [suggestion.project_id, proposed.title, proposed.description || '', ents, orderIdx, mod, conf, id]
          );
          const newFeatureId = featRes.rows[0].id;

          const todos = proposed.todos || [];
          for (let ti = 0; ti < todos.length; ti++) {
            const t = todos[ti];
            await query(
              `INSERT INTO todos (project_id, feature_id, title, detail, entities, depends_on, status, order_index, human_locked)
               VALUES ($1, $2, $3, $4, $5, $6, 'open', $7, true)`,
              [suggestion.project_id, newFeatureId, t.title, t.detail || '', ents, [], ti]
            );
          }

          // Merge architecture implications
          if (proposed.arch_implications) {
            const arch = proposed.arch_implications;
            if (arch.schema && arch.schema.length > 0) {
              const ex = (await query('SELECT data_model_draft FROM projects WHERE id = $1', [suggestion.project_id])).rows[0];
              const merged = [...(ex?.data_model_draft || []), ...arch.schema];
              await query('UPDATE projects SET data_model_draft = $1 WHERE id = $2', [JSON.stringify(merged), suggestion.project_id]);
            }
            if (arch.api && arch.api.length > 0) {
              const ex = (await query('SELECT api_surface_draft FROM projects WHERE id = $1', [suggestion.project_id])).rows[0];
              const merged = [...(ex?.api_surface_draft || []), ...arch.api];
              await query('UPDATE projects SET api_surface_draft = $1 WHERE id = $2', [JSON.stringify(merged), suggestion.project_id]);
            }
            if (arch.integrations && arch.integrations.length > 0) {
              const ex = (await query('SELECT integrations_draft FROM projects WHERE id = $1', [suggestion.project_id])).rows[0];
              const merged = [...(ex?.integrations_draft || []), ...arch.integrations];
              await query('UPDATE projects SET integrations_draft = $1 WHERE id = $2', [JSON.stringify(merged), suggestion.project_id]);
            }
          }
          await query('COMMIT');
        } catch (txErr) {
          await query('ROLLBACK');
          throw txErr;
        }
      } else if (suggestion.suggestion_type === 'modify' && suggestion.target_id) {
        const fields = [];
        const values = [];
        let pi = 1;
        if (proposed.title) { fields.push(`title = $${pi++}`); values.push(proposed.title); }
        if (proposed.description) { fields.push(`description = $${pi++}`); values.push(proposed.description); }
        if (proposed.entities) { fields.push(`entities = $${pi++}`); values.push(proposed.entities.map(e => e.toLowerCase())); }
        if (proposed.module) { fields.push(`module = $${pi++}`); values.push(proposed.module); }
        if (fields.length > 0) {
          fields.push('human_locked = true', 'updated_at = NOW()');
          values.push(suggestion.target_id);
          await query(`UPDATE features SET ${fields.join(', ')} WHERE id = $${pi}`, values);
        }
      } else if (suggestion.suggestion_type === 'remove' && suggestion.target_id) {
        await query('BEGIN');
        try {
          await query('DELETE FROM todos WHERE feature_id = $1', [suggestion.target_id]);
          await query('DELETE FROM features WHERE id = $1', [suggestion.target_id]);
          await query('COMMIT');
        } catch (txErr) {
          await query('ROLLBACK');
          throw txErr;
        }
      }
    } else {
      // ---- TODO-LEVEL operations (existing behaviour) ----
      if (suggestion.suggestion_type === 'add') {
        const featureId = proposed.feature_id;
        if (!featureId) {
          return reply.code(400).send({ error: 'feature_id is required for add suggestions. Please specify which feature this task belongs to.' });
        }
        const featCheck = await query('SELECT id FROM features WHERE id = $1', [featureId]);
        if (featCheck.rows.length === 0) {
          return reply.code(400).send({ error: `Feature with id "${featureId}" not found. Please use an existing feature_id.` });
        }
        await query('BEGIN');
        try {
          const countRes = await query('SELECT COUNT(*) FROM todos WHERE feature_id = $1', [featureId]);
          const orderIdx = parseInt(countRes.rows[0].count) || 0;
          await query(
            `INSERT INTO todos (project_id, feature_id, title, detail, entities, depends_on, status, order_index, human_locked)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [suggestion.project_id, featureId, proposed.title, proposed.detail || '', (proposed.entities || []).map(e => e.toLowerCase()), [], 'open', orderIdx, true]
          );
          await query('COMMIT');
        } catch (txErr) {
          await query('ROLLBACK');
          throw txErr;
        }
      } else if (suggestion.suggestion_type === 'modify') {
        await query(
          `UPDATE todos SET title = $1, detail = $2, entities = $3, human_locked = true, updated_at = NOW() WHERE id = $4`,
          [proposed.title, proposed.detail || '', (proposed.entities || []).map(e => e.toLowerCase()), suggestion.target_id]
        );
      } else if (suggestion.suggestion_type === 'remove') {
        await query('DELETE FROM todos WHERE id = $1', [suggestion.target_id]);
      }
    }

    // Update suggestion status to applied
    await query("UPDATE impact_suggestions SET status = 'applied' WHERE id = $1", [id]);

    return { success: true };
  } catch (err) {
    console.error('[Apply Suggestion Error] Failed to apply:', err);
    return reply.code(500).send({ error: 'Failed to apply suggestion', details: err.message });
  }
});

// SKIP suggestion
server.post('/api/suggestions/:id/skip', async (request, reply) => {
  const { id } = request.params;
  const { reason } = request.body || {};

  try {
    const sugRes = await query('SELECT * FROM impact_suggestions WHERE id = $1', [id]);
    if (sugRes.rows.length === 0) {
      return reply.code(404).send({ error: 'Suggestion not found' });
    }
    const suggestion = sugRes.rows[0];

    if (suggestion.status !== 'pending') {
      return reply.code(400).send({ error: 'Suggestion has already been applied or skipped' });
    }

    await query(
      "UPDATE impact_suggestions SET status = 'skipped', skip_reason = $1 WHERE id = $2",
      [reason || 'Skipped by user', id]
    );

    return { success: true };
  } catch (err) {
    console.error('[Skip Suggestion Error] Failed to skip:', err);
    return reply.code(500).send({ error: 'Failed to skip suggestion', details: err.message });
  }
});

// ── Graph route (temporarily disabled) ──
// TODO: Rebuild graph with new module-based pipeline data
server.get('/api/projects/:id/graph', async (request, reply) => {
  return reply.code(503).send({ error: 'Graph view temporarily disabled during pipeline rebuild.', elements: [] });
});

};

