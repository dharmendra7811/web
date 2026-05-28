module.exports = function registerRedmineRoutes(server, deps) {
  const { query, redmineRequest, REDMINE_URL, REDMINE_API_KEY,
          REDMINE_PROJECT_IDENTIFIER, REDMINE_FEATURE_TRACKER_ID, REDMINE_TODO_TRACKER_ID } = deps;

// ── Helpers ──
function mapStatusToRedmine(status) {
  const mapping = { 'draft': 1, 'ready': 1, 'in_progress': 2, 'done': 5, 'open': 1, 'blocked': 1 };
  return mapping[status] || 1;
}
function mapStatusFromRedmine(redmineStatusId) {
  const mapping = { 1: 'open', 2: 'in_progress', 3: 'in_progress', 4: 'open', 5: 'done', 6: 'open' };
  return mapping[redmineStatusId] || 'open';
}
async function getRedmineProjectId(projectId) {
  const projectRes = await query('SELECT redmine_project_identifier FROM projects WHERE id = $1', [projectId]);
  if (projectRes.rows.length > 0 && projectRes.rows[0].redmine_project_identifier)
    return projectRes.rows[0].redmine_project_identifier;
  return REDMINE_PROJECT_IDENTIFIER;
}

// ── Sync full project ──
server.post('/api/projects/:id/sync/redmine', async (request, reply) => {
  const { id } = request.params;
  try {
    const projectRes = await query('SELECT * FROM projects WHERE id = $1', [id]);
    if (projectRes.rows.length === 0) return reply.code(404).send({ error: 'Project not found' });
    const featuresRes = await query('SELECT * FROM features WHERE project_id = $1 ORDER BY order_index', [id]);
    const features = featuresRes.rows;
    const redmineProjectId = await getRedmineProjectId(id);
    const results = { features: [], todos: [], errors: [] };

    for (const feature of features) {
      try {
        const todosRes = await query('SELECT * FROM todos WHERE feature_id = $1 ORDER BY order_index', [feature.id]);
        const todos = todosRes.rows;
        const featurePayload = { issue: { project_id: redmineProjectId, subject: feature.title, description: feature.description || '', tracker_id: REDMINE_FEATURE_TRACKER_ID, status_id: mapStatusToRedmine(feature.status) } };
        let redmineIssueId;
        if (feature.ticket_id && feature.ticket_adapter === 'redmine') {
          try { await redmineRequest(`issues/${feature.ticket_id}`, 'PUT', featurePayload); redmineIssueId = feature.ticket_id; }
          catch (err) {
            if (err.message.includes('404')) { const r = await redmineRequest('issues', 'POST', featurePayload); redmineIssueId = r.issue.id; await query('UPDATE features SET ticket_id = $1, ticket_adapter = $2 WHERE id = $3', [redmineIssueId.toString(), 'redmine', feature.id]); }
            else throw err;
          }
        } else { const r = await redmineRequest('issues', 'POST', featurePayload); redmineIssueId = r.issue.id; await query('UPDATE features SET ticket_id = $1, ticket_adapter = $2 WHERE id = $3', [redmineIssueId.toString(), 'redmine', feature.id]); }
        results.features.push({ id: feature.id, redmine_issue_id: redmineIssueId, title: feature.title });
        for (const todo of todos) {
          try {
            const todoPayload = { issue: { project_id: redmineProjectId, subject: todo.title, description: todo.detail || '', tracker_id: REDMINE_TODO_TRACKER_ID, status_id: mapStatusToRedmine(todo.status), parent_issue_id: redmineIssueId } };
            let todoRedmineId;
            if (todo.ticket_id && todo.ticket_adapter === 'redmine') {
              try { await redmineRequest(`issues/${todo.ticket_id}`, 'PUT', todoPayload); todoRedmineId = todo.ticket_id; }
              catch (err) {
                if (err.message.includes('404')) { const r = await redmineRequest('issues', 'POST', todoPayload); todoRedmineId = r.issue.id; await query('UPDATE todos SET ticket_id = $1, ticket_adapter = $2 WHERE id = $3', [todoRedmineId.toString(), 'redmine', todo.id]); }
                else throw err;
              }
            } else { const r = await redmineRequest('issues', 'POST', todoPayload); todoRedmineId = r.issue.id; await query('UPDATE todos SET ticket_id = $1, ticket_adapter = $2 WHERE id = $3', [todoRedmineId.toString(), 'redmine', todo.id]); }
            results.todos.push({ id: todo.id, redmine_issue_id: todoRedmineId, title: todo.title });
          } catch (err) { results.errors.push(`Todo ${todo.id}: ${err.message}`); }
        }
      } catch (err) { results.errors.push(`Feature ${feature.id}: ${err.message}`); }
    }

    const syncedFeatureIds = results.features.map(f => f.id);
    const syncedTodoIds = results.todos.map(t => t.id);
    await query('UPDATE projects SET last_synced_at = NOW(), synced_feature_ids = $1, synced_todo_ids = $2, state = $3 WHERE id = $4', [syncedFeatureIds, syncedTodoIds, 'synced', id]);
    const prevFids = projectRes.rows[0].synced_feature_ids || [];
    const prevTids = projectRes.rows[0].synced_todo_ids || [];
    return { success: true, ...results, state: 'synced', diff: { new_features: syncedFeatureIds.filter(f => !prevFids.includes(f)).length, new_todos: syncedTodoIds.filter(t => !prevTids.includes(t)).length, total_features: syncedFeatureIds.length, total_todos: syncedTodoIds.length, previously_synced: prevFids.length > 0 } };
  } catch (err) { request.log.error(err); return reply.code(500).send({ error: 'Sync failed', details: err.message }); }
});

// ── Sync single feature ──
server.post('/api/features/:id/sync/redmine', async (request, reply) => {
  const { id } = request.params;
  try {
    const fr = await query('SELECT * FROM features WHERE id = $1', [id]);
    if (fr.rows.length === 0) return reply.code(404).send({ error: 'Feature not found' });
    const feature = fr.rows[0];
    const rpid = await getRedmineProjectId(feature.project_id);
    const payload = { issue: { project_id: rpid, subject: feature.title, description: feature.description || '', tracker_id: REDMINE_FEATURE_TRACKER_ID, status_id: mapStatusToRedmine(feature.status) } };
    if (feature.ticket_id && feature.ticket_adapter === 'redmine') {
      await redmineRequest(`issues/${feature.ticket_id}`, 'PUT', payload);
      return { success: true, redmine_issue_id: feature.ticket_id, updated: true };
    }
    const result = await redmineRequest('issues', 'POST', payload);
    await query('UPDATE features SET ticket_id = $1, ticket_adapter = $2 WHERE id = $3', [result.issue.id.toString(), 'redmine', id]);
    return { success: true, redmine_issue_id: result.issue.id, created: true };
  } catch (err) { return reply.code(500).send({ error: 'Sync failed', details: err.message }); }
});

// ── Sync single todo ──
server.post('/api/todos/:id/sync/redmine', async (request, reply) => {
  const { id } = request.params;
  try {
    const tr = await query('SELECT * FROM todos WHERE id = $1', [id]);
    if (tr.rows.length === 0) return reply.code(404).send({ error: 'Todo not found' });
    const todo = tr.rows[0];
    const featureRes = await query('SELECT * FROM features WHERE id = $1', [todo.feature_id]);
    if (featureRes.rows.length === 0) return reply.code(400).send({ error: 'Parent feature not found' });
    const feature = featureRes.rows[0];
    const rpid = await getRedmineProjectId(todo.project_id);
    const parentId = feature.ticket_id || undefined;
    const payload = { issue: { project_id: rpid, subject: todo.title, description: todo.detail || '', tracker_id: REDMINE_TODO_TRACKER_ID, status_id: mapStatusToRedmine(todo.status), parent_issue_id: parentId } };
    if (todo.ticket_id && todo.ticket_adapter === 'redmine') {
      await redmineRequest(`issues/${todo.ticket_id}`, 'PUT', payload);
      return { success: true, redmine_issue_id: todo.ticket_id, updated: true };
    }
    const result = await redmineRequest('issues', 'POST', payload);
    await query('UPDATE todos SET ticket_id = $1, ticket_adapter = $2 WHERE id = $3', [result.issue.id.toString(), 'redmine', id]);
    return { success: true, redmine_issue_id: result.issue.id, created: true };
  } catch (err) { return reply.code(500).send({ error: 'Sync failed', details: err.message }); }
});

// ── Redmine project management ──
server.get('/api/redmine/projects', async (request, reply) => {
  const { project_id } = request.query;
  try {
    let rpid;
    if (project_id) rpid = await getRedmineProjectId(project_id);
    const result = await redmineRequest('projects', 'GET');
    return { projects: result.projects || [], current_project: rpid || REDMINE_PROJECT_IDENTIFIER };
  } catch (err) { return reply.code(500).send({ error: 'Failed to list Redmine projects', details: err.message }); }
});

server.put('/api/projects/:id/redmine-project', async (request, reply) => {
  const { id } = request.params;
  const { redmine_project_identifier } = request.body;
  try {
    const pr = await query('SELECT * FROM projects WHERE id = $1', [id]);
    if (pr.rows.length === 0) return reply.code(404).send({ error: 'Project not found' });
    await query('UPDATE projects SET redmine_project_identifier = $1, updated_at = NOW() WHERE id = $2', [redmine_project_identifier || null, id]);
    return { success: true, redmine_project_identifier };
  } catch (err) { return reply.code(500).send({ error: 'Failed to set Redmine project', details: err.message }); }
});

server.get('/api/redmine/status', async (request, reply) => {
  const { project_id } = request.query;
  if (!REDMINE_API_KEY) return { configured: false, message: 'Redmine API key not set' };
  try {
    let checkProject = REDMINE_PROJECT_IDENTIFIER;
    if (project_id) checkProject = await getRedmineProjectId(project_id);
    const result = await redmineRequest('projects/' + checkProject);
    return { configured: true, connected: true, project: result.project?.name || checkProject, url: REDMINE_URL, redmine_project_identifier: checkProject };
  } catch (err) { return { configured: true, connected: false, error: err.message, redmine_project_identifier: project_id ? await getRedmineProjectId(project_id) : REDMINE_PROJECT_IDENTIFIER }; }
});

};