const Fastify = require('fastify');
const cors = require('@fastify/cors');
const { Pool } = require('pg');
const { Queue, Worker } = require('bullmq');
const Redis = require('ioredis');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const { extractRawText } = require('mammoth');


// Initialize Fastify
const server = Fastify({ logger: true });

// Register CORS
server.register(cors, {
  origin: '*',
});

// Environment variables (in real app, use .env)
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = process.env.DB_PORT || 5432;
const DB_NAME = process.env.DB_NAME || 'requirements_os';
const DB_USER = process.env.DB_USER || 'postgres';
const DB_PASSWORD = process.env.DB_PASSWORD || 'postgres';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || 'your-openrouter-key';
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

// Initialize PostgreSQL pool
const pool = new Pool({
  host: DB_HOST,
  port: DB_PORT,
  database: DB_NAME,
  user: DB_USER,
  password: DB_PASSWORD,
});

// Test connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Database connection error:', err.stack);
  } else {
    console.log('Connected to PostgreSQL');
  }
});

// Initialize Redis connection for BullMQ
const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

// Initialize OpenRouter (OpenAI-compatible)
const openai = new OpenAI({
  baseURL: OPENROUTER_BASE_URL,
  apiKey: OPENROUTER_API_KEY,
});

// Initialize BullMQ queues
const featureExtractionQueue = new Queue('feature-extraction', { connection });
const todoGenerationQueue = new Queue('todo-generation', { connection });

// Helper function to run queries
const query = (text, params) => pool.query(text, params);

// LLM Helper to call OpenRouter
// LLM Helper to call OpenRouter
async function callModel(model, prompt, systemPrompt) {
  // Check if API key is not configured or is the default placeholder
  if (!OPENROUTER_API_KEY || OPENROUTER_API_KEY === 'your-openrouter-key') {
    console.log(`[LLM Mock] Active API key not found. Using high-fidelity mock LLM generation for ${model}...`);
    
    // 1. Feature Extraction Prompt Mock
    if (prompt.includes('Extract all features') || prompt.includes('product analyst. Extract')) {
      // Create a nice set of features based on some keywords in the PRD text, or return defaults
      const features = [
        {
          title: "User Authentication & Access Control",
          description: "Enable secure email sign-up and login utilizing password-less one-time passcodes (OTP). Include session state, cookies, and JWT verification filters.",
          actors: ["End User", "System Administrator"],
          entities: ["user", "session", "otp"]
        },
        {
          title: "PRD Parser & Text Extractor",
          description: "Provide a seamless drag-and-drop document upload area accepting PDF, DOCX, TXT, and Markdown files. Convert binaries to clean plain text.",
          actors: ["Developer", "Product Manager"],
          entities: ["project", "document", "feature"]
        },
        {
          title: "Dependency Graph Canvas",
          description: "Visual canvas engine utilizing React Flow showing a multi-layered hierarchical network map of features and atomic implementation todos.",
          actors: ["End User"],
          entities: ["feature", "todo", "relationship"]
        },
        {
          title: "AI Chat Impact Analyst",
          description: "Conversational assistant sidebar processing raw human feature change instructions, conducting impact checks, and offering atomic triaged code changes.",
          actors: ["End User", "System Analyst"],
          entities: ["chat", "suggestion", "todo"]
        }
      ];
      return JSON.stringify({ features });
    }
    
    // 2. Summary Prompt Mock
    if (prompt.includes('Summarize this PRD') || prompt.includes('Summarize this PRD in 2-3 sentences')) {
      return "Requirements OS is an interactive product management utility designed to ingest PRD documents, decompose them into structured high-level features and atomic technical implementation todos, and visualizes them on a dependency graph. It allows managers to describe scope edits using natural English chat, triages the cascading impact of changes, and exposes exports for ticket-management tools like Linear and Jira.";
    }
    
    // 3. Todo Generation Prompt Mock
    if (prompt.includes('breaking down a feature') || prompt.includes('implementation todos')) {
      const titleMatch = prompt.match(/Feature:\s*([^\n]+)/);
      const featureTitle = titleMatch ? titleMatch[1].trim() : 'Feature Domain';
      
      let todos = [];
      if (featureTitle.includes('User Authentication')) {
        todos = [
          {
            title: "Design user schema & security indexes",
            detail: "Create Postgres DDL migration with unique email indexes, password hashes, and a session table.",
            entities: ["user", "session"],
            depends_on_titles: []
          },
          {
            title: "Build JWT & session endpoint routing",
            detail: "Implement secure login/signup route handlers in Fastify. Verify auth state using route-level validation hooks.",
            entities: ["user", "session"],
            depends_on_titles: ["Design user schema & security indexes"]
          },
          {
            title: "Implement frontend login screen layout",
            detail: "Create Next.js screen with interactive state, validation notifications, and secure cookie storage handlers.",
            entities: ["user", "session"],
            depends_on_titles: ["Build JWT & session endpoint routing"]
          }
        ];
      } else if (featureTitle.includes('Parser')) {
        todos = [
          {
            title: "Configure Fastify file upload engine",
            detail: "Integrate multipart handler middleware and implement file-type validator filters.",
            entities: ["project", "document"],
            depends_on_titles: []
          },
          {
            title: "Create Mammoth & pdfjs parsers",
            detail: "Implement parser utility taking binary buffers and resolving raw text strings for storage.",
            entities: ["document"],
            depends_on_titles: ["Configure Fastify file upload engine"]
          },
          {
            title: "Build document upload zone widget",
            detail: "Create beautiful React file drop boundary with upload status updates and drag over transitions.",
            entities: ["project", "document"],
            depends_on_titles: ["Create Mammoth & pdfjs parsers"]
          }
        ];
      } else if (featureTitle.includes('Graph')) {
        todos = [
          {
            title: "Implement graph visual structure endpoints",
            detail: "Create backend /api/projects/:id/graph fastify route compiling Postgres features & todos into nodes and depends_on edges.",
            entities: ["feature", "todo"],
            depends_on_titles: []
          },
          {
            title: "Integrate React Flow canvas package",
            detail: "Setup @xyflow/react canvas viewport inside web workspace, enabling fitView, zoom, and interactive navigation.",
            entities: ["todo", "relationship"],
            depends_on_titles: ["Implement graph visual structure endpoints"]
          },
          {
            title: "Create custom custom node elements",
            detail: "Design bespoke FeatureNode and TodoNode modules in React Flow showing active status and GIN entities.",
            entities: ["feature", "todo"],
            depends_on_titles: ["Integrate React Flow canvas package"]
          }
        ];
      } else if (featureTitle.includes('Chat')) {
        todos = [
          {
            title: "Create Fastify conversational router",
            detail: "Implement POST /api/projects/:id/chat route executing NLP token matches and impact predictions.",
            entities: ["chat", "suggestion"],
            depends_on_titles: []
          },
          {
            title: "Build AI interactive sidebar interface",
            detail: "Design right panel chat window displaying formatted prompts, message history, and loading placeholders.",
            entities: ["chat"],
            depends_on_titles: ["Create Fastify conversational router"]
          },
          {
            title: "Create Suggestion card approval elements",
            detail: "Implement dynamic ImpactPanel and inline SuggestionCards allowing quick Apply and Skip actions.",
            entities: ["suggestion", "todo"],
            depends_on_titles: ["Build AI interactive sidebar interface"]
          }
        ];
      } else {
        todos = [
          {
            title: `Design database migrations for ${featureTitle}`,
            detail: `Generate custom schema tables, indices, and triggers supporting ${featureTitle} structures.`,
            entities: ["feature"],
            depends_on_titles: []
          },
          {
            title: `Build backend service endpoints for ${featureTitle}`,
            detail: `Create Fastify CRUD operations to read and write ${featureTitle} models.`,
            entities: ["feature"],
            depends_on_titles: [`Design database migrations for ${featureTitle}`]
          },
          {
            title: `Develop Next.js views for ${featureTitle}`,
            detail: `Implement clean responsive frontend pages and client state bindings for ${featureTitle}.`,
            entities: ["feature"],
            depends_on_titles: [`Build backend service endpoints for ${featureTitle}`]
          }
        ];
      }
      return JSON.stringify({ todos });
    }
    
    // Catch all mock
    return JSON.stringify({});
  }

  try {
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt || 'Return only valid JSON. No preamble, no explanation, no markdown.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2
    });
    return response.choices[0].message.content;
  } catch (error) {
    console.error(`[LLM Error] Error calling model ${model}:`, error);
    throw error;
  }
}


// Safe JSON parse — strip any accidental markdown fences
function parseJSON(text) {
  try {
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch (e) {
    console.error('[JSON Parse Error] Failed to parse:', text);
    throw e;
  }
}

// BullMQ Worker for Feature Extraction
const featureExtractionWorker = new Worker('feature-extraction', async (job) => {
  const { projectId } = job.data;
  console.log(`[FeatureExtractionWorker] Processing project ${projectId}`);
  
  // Get project from DB
  const projectRes = await query('SELECT * FROM projects WHERE id = $1', [projectId]);
  if (projectRes.rows.length === 0) {
    throw new Error(`Project not found: ${projectId}`);
  }
  const project = projectRes.rows[0];
  
  if (!project.prd_text) {
    console.log(`[FeatureExtractionWorker] No PRD text for project ${projectId}`);
    return;
  }
  
  // Generate summary
  console.log(`[FeatureExtractionWorker] Generating summary for project ${projectId}`);
  const summaryPrompt = `You are a product analyst. Summarize this PRD in 2-3 sentences. Do not include any greeting or conversational filler.\n\nPRD:\n${project.prd_text}`;
  const summaryText = await callModel('meta-llama/llama-3.1-8b-instruct', summaryPrompt, 'You are a precise technical writer.');
  
  await query('UPDATE projects SET summary = $1 WHERE id = $2', [summaryText.trim(), projectId]);
  
  // Extract features
  console.log(`[FeatureExtractionWorker] Extracting features for project ${projectId}`);
  const featurePrompt = `You are a product analyst. Extract all features from this PRD.

A feature is a distinct user-facing capability or system module.
Aim for 5-15 features depending on PRD size.

Return ONLY valid JSON. No preamble, no explanation, no markdown.

{
  "features": [
    {
      "title": "short feature name",
      "description": "what the system must do — 1-2 sentences",
      "actors": ["who uses this — e.g. guest, admin, system"],
      "entities": ["key nouns involved — e.g. event, ticket, payment"]
    }
  ]
}

PRD:
${project.prd_text}`;

  const featureRaw = await callModel('meta-llama/llama-3.1-8b-instruct', featurePrompt);
  const { features } = parseJSON(featureRaw);
  
  console.log(`[FeatureExtractionWorker] Extracted ${features.length} features`);
  
  // Insert features and queue todo generation
  for (let i = 0; i < features.length; i++) {
    const f = features[i];
    const insertRes = await query(
      `INSERT INTO features 
        (project_id, title, description, actors, entities, status, order_index, human_locked) 
      VALUES 
        ($1, $2, $3, $4, $5, $6, $7, $8) 
      RETURNING *`,
      [
        projectId,
        f.title,
        f.description,
        f.actors || [],
        f.entities || [],
        'draft',
        i,
        false
      ]
    );
    
    const savedFeature = insertRes.rows[0];
    
    // Add to todo queue
    await todoGenerationQueue.add('generate-todos', {
      projectId,
      featureId: savedFeature.id,
      projectSummary: summaryText,
      featureTitle: savedFeature.title,
      featureDescription: savedFeature.description,
      featureActors: savedFeature.actors
    });
  }
}, { connection });

// BullMQ Worker for Parallel Todo Generation
const todoGenerationWorker = new Worker('todo-generation', async (job) => {
  const { projectId, featureId, projectSummary, featureTitle, featureDescription, featureActors } = job.data;
  console.log(`[TodoGenerationWorker] Generating todos for feature "${featureTitle}" (${featureId})`);
  
  const todoPrompt = `You are a senior engineer breaking down a feature into implementation todos.

Project context: ${projectSummary}

Feature: ${featureTitle}
Description: ${featureDescription}
Actors: ${featureActors ? featureActors.join(', ') : ''}

Generate concrete implementation todos. Each todo is one unit of work
a developer can pick up and complete independently.
Include frontend, backend, and any infra todos needed.

Return ONLY valid JSON. No preamble, no explanation, no markdown.

{
  "todos": [
    {
      "title": "short action-oriented title",
      "detail": "what needs to be done — acceptance criteria if possible",
      "entities": ["nouns this todo involves — must overlap with feature entities"],
      "depends_on_titles": ["title of todo this blocks on — use exact titles"]
    }
  ]
}`;

  const todoRaw = await callModel('meta-llama/llama-3.1-8b-instruct', todoPrompt);
  const { todos } = parseJSON(todoRaw);
  
  console.log(`[TodoGenerationWorker] Generated ${todos.length} todos for feature ${featureId}`);
  
  // Insert todos
  const insertedTodos = [];
  for (let i = 0; i < todos.length; i++) {
    const t = todos[i];
    const insertRes = await query(
      `INSERT INTO todos 
        (project_id, feature_id, title, detail, entities, depends_on, status, order_index, human_locked) 
      VALUES 
        ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
      RETURNING *`,
      [
        projectId,
        featureId,
        t.title,
        t.detail,
        t.entities || [],
        [], // depends_on initially empty, resolved next
        'open',
        i,
        false
      ]
    );
    
    const savedTodo = insertRes.rows[0];
    insertedTodos.push({
      ...savedTodo,
      depends_on_titles: t.depends_on_titles || []
    });
  }
  
  // Resolve depends_on relationships using Titles
  console.log(`[TodoGenerationWorker] Resolving depends_on relationships for feature ${featureId}`);
  for (const todo of insertedTodos) {
    if (todo.depends_on_titles && todo.depends_on_titles.length > 0) {
      const depIds = [];
      for (const depTitle of todo.depends_on_titles) {
        const match = insertedTodos.find(item => item.title.toLowerCase().trim() === depTitle.toLowerCase().trim());
        if (match) {
          depIds.push(match.id);
        }
      }
      
      if (depIds.length > 0) {
        await query(
          'UPDATE todos SET depends_on = $1 WHERE id = $2',
          [depIds, todo.id]
        );
      }
    }
  }
  
  // Update feature status to ready
  console.log(`[TodoGenerationWorker] Marking feature ${featureId} as ready`);
  await query("UPDATE features SET status = 'ready' WHERE id = $1", [featureId]);
}, { connection, concurrency: 5 });

// Handle worker failures
featureExtractionWorker.on('failed', (job, err) => {
  console.error(`[FeatureExtractionWorker] Job ${job ? job.id : 'unknown'} failed:`, err);
});

todoGenerationWorker.on('failed', (job, err) => {
  console.error(`[TodoGenerationWorker] Job ${job ? job.id : 'unknown'} failed:`, err);
});


// Health check
server.get('/health', async (request, reply) => {
  try {
    await pool.query('SELECT 1');
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
  
  // Trigger ingestion pipeline
  featureExtractionQueue.add('extract-features', { projectId: project.id }, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
  });
  
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
  
  await query('DELETE FROM projects WHERE id = $1', [id]);
  
  return { success: true };
});

// PRD ingestion
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
  
  // Trigger ingestion pipeline
  featureExtractionQueue.add('extract-features', { projectId: id }, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
  });
  
  return project;
});

// GET ingestion progress status
server.get('/api/projects/:id/ingest/status', async (request, reply) => {
  const { id } = request.params;
  
  const projectResult = await query('SELECT * FROM projects WHERE id = $1', [id]);
  if (projectResult.rows.length === 0) {
    return reply.code(404).send({ error: 'Project not found' });
  }
  
  const project = projectResult.rows[0];
  
  // Fetch features to compute status
  const featuresResult = await query('SELECT id, status FROM features WHERE project_id = $1', [id]);
  const features = featuresResult.rows;
  
  if (!project.prd_text) {
    return { status: 'idle', progress: 0, message: 'Waiting for PRD...' };
  }
  
  if (features.length === 0) {
    return { status: 'extracting_features', progress: 20, message: 'Extracting features from PRD...' };
  }
  
  const totalFeatures = features.length;
  const readyFeatures = features.filter(f => f.status === 'ready').length;
  
  if (readyFeatures < totalFeatures) {
    const progress = Math.round(20 + (readyFeatures / totalFeatures) * 70);
    return { 
      status: 'generating_todos', 
      progress, 
      message: `Generating todos: ${readyFeatures}/${totalFeatures} features ready` 
    };
  }
  
  return { status: 'done', progress: 100, message: 'Ingestion complete!' };
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
      entities,
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
server.post('/api/projects/:id/chat', async (request, reply) => {
  const { id } = request.params;
  const { message, session_id } = request.body;
  
  try {
    // 1. Resolve Session ID
    let sessionId = session_id;
    if (!sessionId) {
      const sessionRes = await query(
        'INSERT INTO chat_sessions (project_id, status) VALUES ($1, $2) RETURNING id',
        [id, 'open']
      );
      sessionId = sessionRes.rows[0].id;
    }
    
    // 2. Save User Message
    await query(
      "INSERT INTO chat_messages (session_id, role, content) VALUES ($1, 'user', $2)",
      [sessionId, message]
    );
    
    // 3. Fetch Project Summary
    const projectRes = await query('SELECT summary FROM projects WHERE id = $1', [id]);
    const projectSummary = projectRes.rows[0]?.summary || 'No project summary available.';
    
    // 4. Fetch Existing features and todos to form context
    const featuresRes = await query('SELECT id, title, description FROM features WHERE project_id = $1', [id]);
    const features = featuresRes.rows;
    
    const todosRes = await query('SELECT id, title, detail, feature_id FROM todos WHERE project_id = $1', [id]);
    const todos = todosRes.rows;
    
    const contextStr = features.map(f => {
      const featureTodos = todos.filter(t => t.feature_id === f.id);
      return `Feature: "${f.title}" (UUID: ${f.id})\nDescription: "${f.description || ''}"\nTodos:\n` + 
        featureTodos.map(t => ` - [Todo UUID: ${t.id}] "${t.title}": "${t.detail || ''}"`).join('\n');
    }).join('\n\n');
    
    // 5. Generate Response via LLM (or high-fidelity mock if no API key)
    let assistantResponse = '';
    let suggestions = [];
    
    if (!OPENROUTER_API_KEY || OPENROUTER_API_KEY === 'your-openrouter-key') {
      console.log("[LLM Mock] Chat endpoint executing high-fidelity mock fallback...");
      const userLower = message.toLowerCase();
      
      if (userLower.includes('oauth') || userLower.includes('google') || userLower.includes('login')) {
        assistantResponse = "Integrating Google OAuth requires setting up the client keys in Next.js, implementing session routing in Fastify, and updating the database model to persist oauth tokens. I have drafted 2 technical todos to support this.";
        suggestions = [
          {
            target_id: null,
            target_type: 'todo',
            suggestion_type: 'add',
            description: "Configure Google Developer API credentials in server configuration files.",
            proposed_value: {
              title: "Setup Google OAuth environment variables",
              detail: "Securely store GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET variables in backend environments.",
              entities: ["user", "session"],
              feature_id: features[0]?.id || null
            }
          },
          {
            target_id: null,
            target_type: 'todo',
            suggestion_type: 'add',
            description: "Implement callback handler routes for session authorization token generation.",
            proposed_value: {
              title: "Create Fastify Google OAuth callback routes",
              detail: "Develop handler capturing redirects, requesting tokens, and mapping records to active user sessions.",
              entities: ["user", "session"],
              feature_id: features[0]?.id || null
            }
          }
        ];
      } else if (userLower.includes('remove') || userLower.includes('delete') || userLower.includes('obsolete')) {
        const targetTodo = todos[0];
        assistantResponse = targetTodo 
          ? `Removing the obsolete todo "${targetTodo.title}" will simplify the development timeline without breaking any active downstream database or code dependencies. I have drafted a removal card.`
          : "No active todos are currently available to suggest removing.";
        suggestions = targetTodo ? [
          {
            target_id: targetTodo.id,
            target_type: 'todo',
            suggestion_type: 'remove',
            description: `Delete obsolete todo: "${targetTodo.title}"`,
            proposed_value: null
          }
        ] : [];
      } else {
        assistantResponse = `I have processed your requirements change request: "${message}". I will create a new implementation todo under your active features to monitor this task.`;
        suggestions = [
          {
            target_id: null,
            target_type: 'todo',
            suggestion_type: 'add',
            description: `Fulfill custom requirements instruction: "${message.length > 50 ? message.slice(0, 47) + '...' : message}"`,
            proposed_value: {
              title: message.length > 40 ? message.slice(0, 40) + '...' : message,
              detail: `Implement requested capability: ${message}`,
              entities: ["system"],
              feature_id: features[0]?.id || null
            }
          }
        ];
      }
    } else {
      const chatPrompt = `You are a product analyst conducting technical impact analysis. The user wants to apply a requirements change to the project technical todos.
  
Project Summary: ${projectSummary}
  
Existing Features and Todos:
${contextStr}
  
User Instruction: "${message}"
  
Your job is to identify what todo additions, removals, or modifications are needed to satisfy this instruction.
  
Return ONLY a valid JSON object matching the schema. No markdown fences, no preamble.
{
  "assistant_response": "Explain the cascading impact of this change in 2-3 sentences.",
  "suggestions": [
    {
      "target_id": "UUID of existing todo if type is remove or modify, else null",
      "target_type": "todo",
      "suggestion_type": "add" | "modify" | "remove",
      "description": "Short description of what changes and why",
      "proposed_value": {
        "title": "action-oriented title for the todo",
        "detail": "acceptance criteria detail",
        "entities": ["nouns involved"],
        "feature_id": "UUID of the feature this todo belongs to (MUST match one of the existing features UUIDs)"
      }
    }
  ]
}`;

      const chatRaw = await callModel('meta-llama/llama-3.1-8b-instruct', chatPrompt);
      const parsed = parseJSON(chatRaw);
      assistantResponse = parsed.assistant_response;
      suggestions = parsed.suggestions || [];
    }
    
    // 6. Save Assistant Response in DB
    await query(
      "INSERT INTO chat_messages (session_id, role, content) VALUES ($1, 'assistant', $2)",
      [sessionId, assistantResponse]
    );
    
    // 7. Store Suggestions in impact_suggestions table
    const savedSuggestions = [];
    for (const sug of suggestions) {
      const insertRes = await query(
        `INSERT INTO impact_suggestions 
          (session_id, project_id, triggered_by, target_id, target_type, suggestion_type, description, proposed_value, status) 
        VALUES 
          ($1, $2, $3, $4, $5, $6, $7, $8, 'pending') 
        RETURNING *`,
        [
          sessionId,
          id,
          message,
          sug.target_id || null,
          sug.target_type || 'todo',
          sug.suggestion_type,
          sug.description,
          sug.proposed_value ? JSON.stringify(sug.proposed_value) : null
        ]
      );
      savedSuggestions.push(insertRes.rows[0]);
    }
    
    return {
      session_id: sessionId,
      assistant_response: assistantResponse,
      suggestions: savedSuggestions
    };
  } catch (err) {
    console.error('[Chat Error] Failed to process chat message:', err);
    return reply.code(500).send({ error: 'Failed to process chat message', details: err.message });
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
  
  try {
    const sugRes = await query('SELECT * FROM impact_suggestions WHERE id = $1', [id]);
    if (sugRes.rows.length === 0) {
      return reply.code(404).send({ error: 'Suggestion not found' });
    }
    const suggestion = sugRes.rows[0];
    
    if (suggestion.status !== 'pending') {
      return reply.code(400).send({ error: 'Suggestion has already been applied or skipped' });
    }
    
    const proposed = suggestion.proposed_value;
    
    if (suggestion.suggestion_type === 'add') {
      // Find order_index
      const countRes = await query('SELECT COUNT(*) FROM todos WHERE feature_id = $1', [proposed.feature_id]);
      const orderIdx = parseInt(countRes.rows[0].count) || 0;
      
      await query(
        `INSERT INTO todos 
          (project_id, feature_id, title, detail, entities, depends_on, status, order_index, human_locked) 
        VALUES 
          ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          suggestion.project_id,
          proposed.feature_id,
          proposed.title,
          proposed.detail || '',
          proposed.entities || [],
          [], // depends_on initially empty
          'open',
          orderIdx,
          true // human_locked
        ]
      );
    } else if (suggestion.suggestion_type === 'modify') {
      await query(
        `UPDATE todos 
         SET title = $1, detail = $2, entities = $3, human_locked = true, updated_at = NOW() 
         WHERE id = $4`,
        [
          proposed.title,
          proposed.detail || '',
          proposed.entities || [],
          suggestion.target_id
        ]
      );
    } else if (suggestion.suggestion_type === 'remove') {
      await query('DELETE FROM todos WHERE id = $1', [suggestion.target_id]);
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


// Graph route
server.get('/api/projects/:id/graph', async (request, reply) => {
  const { id } = request.params;
  
  // Fetch project with features and todos
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
  const featuresWithTodos = [];
  for (const feature of featuresResult.rows) {
    const todosResult = await query(
      'SELECT * FROM todos WHERE feature_id = $1 ORDER BY order_index',
      [feature.id]
    );
    feature.todos = todosResult.rows;
    featuresWithTodos.push(feature);
  }
  
  // Convert to React Flow format
  const nodes = [];
  const edges = [];
  
  // Add feature nodes
  featuresWithTodos.forEach((feature, index) => {
    nodes.push({
      id: feature.id,
      type: 'feature',
      position: { x: index * 320, y: 0 },
      data: {
        label: feature.title,
        status: feature.status,
        human_locked: feature.human_locked,
        entity_count: feature.entities.length,
        todo_count: feature.todos.length,
      }
    });
    
    // Add todo nodes under this feature
    feature.todos.forEach((todo, todoIndex) => {
      nodes.push({
        id: todo.id,
        type: 'todo',
        position: { x: index * 320, y: (todoIndex + 1) * 80 + 120 },
        data: {
          label: todo.title,
          status: todo.status,
          human_locked: todo.human_locked,
          entity_count: todo.entities.length,
        }
      });
      
      // Add depends_on edges
      todo.depends_on.forEach(depId => {
        edges.push({
          id: `${todo.id}-depends-on-${depId}`,
          source: depId,
          target: todo.id,
          type: 'depends_on',
          animated: true,
        });
      });
    });
  });
  
  // TODO: Add same_entity edges (capped at 20)
  
  return { nodes, edges };
});

// Start the server
const start = async () => {
  try {
    await server.listen({ port: 3000, host: '0.0.0.0' });
    console.log(`Server listening on ${server.server.address().port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();

// Graceful shutdown
process.on('SIGINT', async () => {
  await server.close();
  pool.end();
  process.exit(0);
});