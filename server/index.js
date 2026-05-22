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
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform'],
});

// Register multipart for file uploads
server.register(require('@fastify/multipart'), {
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

// Environment variables (in real app, use .env)
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = process.env.DB_PORT || 5432;
const DB_NAME = process.env.DB_NAME || 'requirements_os';
const DB_USER = process.env.DB_USER || 'postgres';
const DB_PASSWORD = process.env.DB_PASSWORD || 'postgres';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

// Initialize PostgreSQL pool
const pool = new Pool({
  host: DB_HOST,
  port: DB_PORT,
  database: DB_NAME,
  user: DB_USER,
  password: DB_PASSWORD
});

// Redis client setup (if needed for websockets, skipping for simple demo)
// const redisClient = new Redis(REDIS_URL);

// Initialize Redis connection for BullMQ
const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

// Initialize BullMQ queues
const featureExtractionQueue = new Queue('feature-extraction', { connection });
const todoGenerationQueue = new Queue('todo-generation', { connection });

// Initialize OpenRouter (OpenAI-compatible)
const openai = new OpenAI({
  baseURL: OPENROUTER_BASE_URL,
  apiKey: OPENROUTER_API_KEY || 'dummy-key',
  defaultHeaders: {
    "HTTP-Referer": "http://localhost:3000",
    "X-Title": "Requirements OS",
  }
});

// Redmine Configuration
const REDMINE_URL = process.env.REDMINE_URL || 'http://localhost:3001';
const REDMINE_API_KEY = process.env.REDMINE_API_KEY;
const REDMINE_PROJECT_IDENTIFIER = process.env.REDMINE_PROJECT_IDENTIFIER || 'requirements-os';
const REDMINE_FEATURE_TRACKER_ID = parseInt(process.env.REDMINE_FEATURE_TRACKER_ID || '2');
const REDMINE_TODO_TRACKER_ID = parseInt(process.env.REDMINE_TODO_TRACKER_ID || '1');

// Redmine API Helper
async function redmineRequest(endpoint, method = 'GET', data = null) {
  const url = `${REDMINE_URL}/${endpoint}.json`;
  const headers = {
    'Content-Type': 'application/json',
    'X-Redmine-API-Key': REDMINE_API_KEY,
  };

  const options = {
    method,
    headers,
  };

  if (data && (method === 'POST' || method === 'PUT')) {
    options.body = JSON.stringify(data);
  }

  const response = await fetch(url, options);
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Redmine API error: ${response.status} ${errorText}`);
  }

  return response.json();
}

// Create or update a Redmine issue
async function syncToRedmine(issue) {
  // issue: { subject, description, tracker_id, status_id, parent_issue_id, custom_fields }
  if (!REDMINE_API_KEY) {
    throw new Error('Redmine API key not configured');
  }

  const payload = { issue };
  
  // Check if issue already exists (by checking ticket_id)
  if (issue.id) {
    // Update existing issue
    const result = await redmineRequest(`issues/${issue.id}`, 'PUT', payload);
    return result;
  } else {
    // Create new issue
    const result = await redmineRequest('issues', 'POST', payload);
    return result;
  }
}

// Helper function to run queries
const query = (text, params) => pool.query(text, params);

// LLM Helper to call OpenRouter
// LLM Helper to call OpenRouter
async function callModel(model, prompt, systemPrompt) {
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


// Safe JSON parse — handles common LLM output issues
function parseJSON(text) {
  // Strip markdown fences
  let clean = text.replace(/```json\s*|```/g, '').trim();

  // If the response has text before/after JSON, try to extract just the JSON object/array
  const firstBrace = clean.indexOf('{');
  const firstBracket = clean.indexOf('[');
  const startIdx = Math.min(
    firstBrace === -1 ? Infinity : firstBrace,
    firstBracket === -1 ? Infinity : firstBracket
  );
  if (startIdx !== Infinity && startIdx > 0) {
    clean = clean.slice(startIdx);
  }
  // Trim trailing text after last closing brace/bracket
  const lastBrace = clean.lastIndexOf('}');
  const lastBracket = clean.lastIndexOf(']');
  const endIdx = Math.max(lastBrace, lastBracket);
  if (endIdx !== -1 && endIdx < clean.length - 1) {
    clean = clean.slice(0, endIdx + 1);
  }

  try {
    return JSON.parse(clean);
  } catch (e) {
    // Try stripping trailing commas (common LLM mistake)
    try {
      const noTrailingCommas = clean.replace(/,(\s*[}\]])/g, '$1');
      return JSON.parse(noTrailingCommas);
    } catch (e2) {
      console.error('[JSON Parse Error] Failed to parse. Raw text:', text.slice(0, 500));
      throw e;
    }
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
  const summaryPrompt = `You are a product analyst. Summarize this PRD in 2-3 sentences. Your summary must cover: (1) the primary user role this product serves, (2) the core value proposition, and (3) any key technical constraints or integrations mentioned (e.g. payment providers, auth methods, compliance requirements). Do not include any greeting or conversational filler.\n\nPRD:\n${project.prd_text}`;
  const summaryText = await callModel('openai/gpt-oss-120b', summaryPrompt, 'You are a precise technical writer.');

  await query('UPDATE projects SET summary = $1 WHERE id = $2', [summaryText.trim(), projectId]);

  // Extract features
  console.log(`[FeatureExtractionWorker] Extracting features for project ${projectId}`);
  const featurePrompt = `You are a product analyst extracting a formal Semantic IR from a PRD.

Each feature must include:
- title: short system capability name (e.g. AUTH_LOGIN, PAYMENT_CHECKOUT)
- description: what the system must do — 1-2 sentences
- actors: who uses this
- entities: lowercase, singular domain nouns only — NOT UI component names or endpoint names
- constraints: hidden requirements inferred from PRD text (e.g. "rate_limited", "otp_required", "pci_compliant", "audit_logged"). Empty array if none found.
- external_deps: external systems/services this depends on (e.g. "stripe", "sendgrid", "google_maps"). Empty array if none.
- confidence: number 0-1 — how certain you are this feature is genuinely required by the PRD (0.9+ for explicit mentions, 0.5-0.8 for strong inference, below 0.5 for guesswork)
- source: "explicit" if the feature is directly stated in the PRD text. "inferred" if you deduced it from context.
- graph_type: classify the feature into one of:
    "capability" — user-facing business capability (e.g. AUTH_LOGIN, PAYMENT_CHECKOUT, SEARCH_RESTAURANTS)
    "service" — backend/internal service module (e.g. NOTIFICATION_DISPATCHER, PAYMENT_GATEWAY_ADAPTER)
    "risk" — compliance, security, or operational risk concern (e.g. PCI_COMPLIANCE, RATE_LIMITER, AUDIT_LOGGER)
  If a feature fits multiple, pick the most specific. Prefer "risk" only when the feature IS primarily a risk concern, not just a feature that happens to have constraints.

Deduplication rules (IMPORTANT):
- If two capabilities are variations of the same domain verb or business action (e.g. AUTH_LOGIN and AUTH_REGISTER both deal with authentication entry), merge them into ONE feature with a broader title (e.g. AUTH_ENTRY).
- Do NOT produce sibling features that differ only by minor workflow variation. Consolidate aggressively.
- Each feature title must be unique.

Return ONLY valid JSON. No preamble, no explanation, no markdown.

{
  "features": [
    {
      "title": "AUTH_LOGIN",
      "description": "Allow users to log in via email OTP or Google OAuth",
      "actors": ["user"],
      "entities": ["user", "session", "otp"],
      "constraints": ["otp_required", "rate_limited"],
      "external_deps": ["google_oauth", "twilio"],
      "confidence": 0.95,
      "source": "explicit",
      "graph_type": "capability"
    }
  ]
}

PRD:
${project.prd_text}`;

  const featureRaw = await callModel('openai/gpt-oss-120b', featurePrompt);
  const { features } = parseJSON(featureRaw);

  console.log(`[FeatureExtractionWorker] Extracted ${features.length} features`);

  // Insert features and queue todo generation
  for (let i = 0; i < features.length; i++) {
    const f = features[i];
    const insertRes = await query(
      `INSERT INTO features 
        (project_id, title, description, actors, entities, status, order_index, human_locked, constraints, external_deps, confidence, source, graph_type) 
      VALUES 
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) 
      RETURNING *`,
      [
        projectId,
        f.title,
        f.description,
        f.actors || [],
        (f.entities || []).map(e => e.toLowerCase()),
        'draft',
        i,
        false,
        (f.constraints || []).map(e => e.toLowerCase()),
        (f.external_deps || []).map(e => e.toLowerCase()),
        typeof f.confidence === 'number' ? f.confidence : 0.5,
        f.source || 'inferred',
        f.graph_type || 'capability'
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

  const todoPrompt = `You are a senior engineer preparing developer assignment specs from a feature breakdown.

Project context: ${projectSummary}

Feature: ${featureTitle}
Description: ${featureDescription}
Actors: ${featureActors ? featureActors.join(', ') : ''}

Generate COMPLETE developer assignments. Each todo is a self-contained unit of work a developer can own end-to-end — a service, module, schema, endpoint, or integration. Write acceptance criteria in the detail field so the developer knows exactly what "done" means.

Rules:
- Each todo must be substantial — at least a day of work, not a 5-minute fix
- Use CAPITALIZED_UNDERSCORE names (OTP_PROVIDER, PAYMENT_GATEWAY_ADAPTER, USER_SEARCH_SERVICE)
- Do NOT generate: "add validation hook", "write unit test", "fix lint error", "run npm install"
- Cover all layers: data model, backend service, frontend component, infra config
- Include dependencies so a developer knows what to build first
- IMPORTANT: The "depends_on_titles" array must ONLY reference titles of other todos defined in THIS response. Do not reference todos from other features or any title not present in this output. If there are no intra-feature dependencies, use an empty array [].

Classify each assignment into a graph layer:
  "service" — backend service, primary API endpoint, or database schema
  "infra" — middleware, auth, external adapter, deployment config
  "execution" — frontend component, data migration, integration work

Return ONLY valid JSON. No preamble, no explanation, no markdown.

{
  "todos": [
    {
      "title": "USER_AUTH_SERVICE",
      "detail": "Build the authentication microservice. Handle signup/login via email OTP and Google OAuth. Store user sessions in Redis. Expose POST /auth/signup, POST /auth/login, POST /auth/verify-otp. Rate-limit OTP requests to 3 per minute per IP. Return JWT on success.",
      "entities": ["user", "session", "otp"],
      "depends_on_titles": ["USER_SCHEMA"],
      "graph_type": "service"
    }
  ]
}`;

  const todoRaw = await callModel('openai/gpt-oss-120b', todoPrompt);
  const { todos } = parseJSON(todoRaw);

  console.log(`[TodoGenerationWorker] Generated ${todos.length} todos for feature ${featureId}`);

  // Insert todos
  const insertedTodos = [];
  for (let i = 0; i < todos.length; i++) {
    const t = todos[i];
    const insertRes = await query(
      `INSERT INTO todos 
        (project_id, feature_id, title, detail, entities, depends_on, status, order_index, human_locked, graph_type) 
      VALUES 
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
      RETURNING *`,
      [
        projectId,
        featureId,
        t.title,
        t.detail,
        (t.entities || []).map(e => e.toLowerCase()),
        [], // depends_on initially empty, resolved next
        'open',
        i,
        false,
        t.graph_type || 'service'
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

// File parse endpoint — accepts .pdf, .docx, .md, .txt and returns plaintext
server.post('/api/parse', async (request, reply) => {
  const data = await request.file();
  if (!data) {
    return reply.code(400).send({ error: 'No file uploaded' });
  }

  const buffer = await data.toBuffer();
  const filename = data.filename || '';
  const ext = filename.split('.').pop()?.toLowerCase();

  let text;
  try {
    if (ext === 'pdf') {
      const parsed = await pdfParse(buffer);
      text = parsed.text;
    } else if (ext === 'docx') {
      const { value } = await extractRawText({ buffer });
      text = value;
    } else if (ext === 'md' || ext === 'txt') {
      text = buffer.toString('utf-8');
    } else {
      return reply.code(400).send({ error: `Unsupported file type: .${ext}` });
    }
  } catch (err) {
    console.error('[Parse Error]', err);
    return reply.code(500).send({ error: 'Failed to parse file: ' + err.message });
  }

  return { text, filename };
});

// AI PRD Review — analyzes PRD and returns clarifying questions
server.post('/api/projects/:id/review', async (request, reply) => {
  const { id } = request.params;

  const projectRes = await query('SELECT * FROM projects WHERE id = $1', [id]);
  if (projectRes.rows.length === 0) {
    return reply.code(404).send({ error: 'Project not found' });
  }
  const project = projectRes.rows[0];

  if (!project.prd_text) {
    return reply.code(400).send({ error: 'No PRD text to review' });
  }

  const reviewPrompt = `You are a Senior Solutions Architect reviewing a PRD for technical completeness before engineering begins.

Step 1: Map all distinct business modules in this PRD (e.g., Auth, Checkout, Catalog, Notifications). Keep this list internal — do not output it.
Step 2: For each module, identify ONLY questions where the answer materially changes a database schema, core business logic, or a third-party integration decision. Ignore surface-level ambiguity.

Severity levels:
- "critical": The answer directly changes table structure, a foreign key constraint, or a branching business rule. Engineering cannot proceed without this. (e.g., "Can one user hold multiple active subscriptions simultaneously?", "Are refunds processed immediately or queued for end-of-day batch?")
- "moderate": An important edge case or state-transition gap that will cause bugs if assumed incorrectly. (e.g., "What happens to in-progress orders when a vendor account is deactivated?")
- "minor": A configuration detail or threshold that can be defaulted but should be confirmed. (e.g., "What is the maximum number of items allowed per cart?")

Rules:
- Do NOT ask questions just to fill space. If a module is clearly specified, ask ZERO questions about it.
- If the entire PRD is unambiguous, return "questions": [].

- Distribute questions across modules — no more than 3 questions for any single module.
- Order the output array by severity: all "critical" questions first, then "moderate", then "minor".
- Every question MUST have an "options" array of 3-4 concrete, mutually exclusive answer choices — not vague placeholders.
- Every question MUST have a "recommended_default" string — the option you would implement if forced to decide today, based on standard industry practice. This must exactly match one entry in the "options" array.
- The "context" field must explain the TECHNICAL CONSEQUENCE of leaving this unspecified (e.g., "Without this, we cannot design the refund ledger table or determine whether a compensating transaction entry is required."). Do not just restate what the PRD says.
- The "summary" field must be a single sentence technical verdict (e.g., "The PRD is mostly complete but has 2 critical schema gaps in the Checkout and Subscription modules that must be resolved before data modelling.").

Return ONLY valid JSON. No preamble, no explanation, no markdown.

{
  "summary": "One-sentence technical verdict on PRD completeness and where the gaps are.",
  "questions": [
    {
      "module": "Checkout",
      "severity": "critical",
      "question": "If a multi-day event is partially cancelled, how are refunds calculated?",
      "context": "Without this, we cannot design the refund ledger schema or determine whether a line-item credit table is required alongside the orders table.",
      "options": [
        "Full refund issued automatically to original payment method",
        "Prorated refund calculated per remaining day",
        "Store credit issued to wallet balance",
        "Manual support ticket required — no automated refund"
      ],
      "recommended_default": "Prorated refund calculated per remaining day"
    }
  ]
}

PRD:
${project.prd_text}`;

  try {
    const raw = await callModel('openai/gpt-oss-120b', reviewPrompt);
    const review = parseJSON(raw);

    // If the AI returned an empty array, auto-skip review and jump straight to ingestion!
    if (!review.questions || review.questions.length === 0) {
      await query(
        "UPDATE projects SET review_state = 'answered' WHERE id = $1",
        [id]
      );

      await featureExtractionQueue.add('extract-features', { projectId: id }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      });

      return { review_state: 'answered', message: 'No blockers found. Ingestion auto-started.', questions: [] };
    }

    await query(
      "UPDATE projects SET review_state = 'reviewing', review_questions = $1 WHERE id = $2",
      [JSON.stringify(review.questions), id]
    );

    return { review_state: 'reviewing', ...review };
  } catch (err) {
    console.error('[Review Error]', err);
    return reply.code(500).send({ error: 'Review failed: ' + err.message });
  }
});

// AI PRD Clarify — accepts answers, enriches PRD, runs full extraction
server.post('/api/projects/:id/clarify', async (request, reply) => {
  const { id } = request.params;
  const { answers } = request.body; // [{ question: "...", answer: "..." }]

  if (!answers || !answers.length) {
    return reply.code(400).send({ error: 'Answers required' });
  }

  const projectRes = await query('SELECT * FROM projects WHERE id = $1', [id]);
  if (projectRes.rows.length === 0) {
    return reply.code(404).send({ error: 'Project not found' });
  }
  const project = projectRes.rows[0];

  // Build Q&A text to append to PRD
  const qaText = answers
    .map(a => `Q: ${a.question}\nA: ${a.answer}`)
    .join('\n\n');

  // Enrich the PRD with answers
  const enrichedPRD = `${project.prd_text}\n\n--- Clarifications from review ---\n${qaText}`;

  // Save answers and update PRD
  await query(
    "UPDATE projects SET review_state = 'answered', review_answers = $1, prd_text = $2 WHERE id = $3",
    [JSON.stringify(answers), enrichedPRD, id]
  );

  // Trigger ingestion pipeline with enriched PRD
  await featureExtractionQueue.add('extract-features', { projectId: id }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
  });

  return { review_state: 'answered', message: 'Clarifications applied. Ingestion started.' };
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

  // Pipeline trigger moved to POST /api/projects/:id/clarify
  // We no longer trigger extraction immediately on PRD update

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
        } catch (e) {}
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
        } catch (e) {}
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

    // 4b. Fetch prior chat history for this session to provide conversation memory
    let historyStr = '';
    if (sessionId) {
      const historyRes = await query(
        'SELECT role, content FROM chat_messages WHERE session_id = $1 ORDER BY created_at ASC LIMIT 20',
        [sessionId]
      );
      if (historyRes.rows.length > 0) {
        historyStr = historyRes.rows
          .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
          .join('\n');
      }
    }

    // 5. Generate Response via LLM
    let assistantResponse = '';
    let suggestions = [];

    const chatPrompt = `You are a product analyst conducting technical impact analysis. The user wants to apply a requirements change to the project technical todos.
Analyze the user's message against the existing features and todos. Determine how this change cascades through the system.

Project Summary:
${projectSummary}

Existing State:
${contextStr}
${historyStr ? `\nConversation History (most recent at bottom):\n${historyStr}\n` : ''}
User Request: "${message}"

IMPORTANT: Use the Conversation History to understand prior decisions and intent. If the user is referring to something mentioned earlier in the conversation (e.g. "also remove that", "keep the previous change"), resolve the reference using the history. Do not treat each message as independent.

Output ONLY a JSON object with two keys:
1. "assistantResponse": A conversational response explaining what the change means and what parts of the system are affected. (e.g. "Adding Google OAuth will require adding two new backend routes and updating the Next.js auth configuration.")
2. "suggestions": An array of specific changes to apply to the todo list.

Suggestion format:
{
  "target_id": "uuid string if modifying or removing, or null if adding",
  "target_type": "todo",
  "suggestion_type": "add" | "modify" | "remove",
  "description": "Short explanation of why this suggestion is needed",
  "proposed_value": {
    "title": "String",
    "detail": "String",
    "entities": ["array", "of", "strings"],
    "feature_id": "uuid string (MANDATORY for 'add' — must be one of the Feature UUIDs listed above)"
  } // null if suggestion_type is "remove"
}

CRITICAL: Every "add" suggestion MUST include a valid feature_id from the existing features listed above. Never omit feature_id. Never invent a UUID. Pick the most relevant existing feature. If unsure which feature to use, pick the first one.
Return ONLY valid JSON.`;

    const chatRaw = await callModel('openai/gpt-oss-120b', chatPrompt);
    const parsed = parseJSON(chatRaw);
    assistantResponse = parsed.assistantResponse || 'I have analyzed the request and prepared suggestions.';
    suggestions = parsed.suggestions || [];

    // 6. Save Assistant Message
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
          sug.suggestion_type || 'add',
          sug.description || '',
          sug.proposed_value ? JSON.stringify(sug.proposed_value) : null
        ]
      );
      savedSuggestions.push(insertRes.rows[0]);
    }

    // Catch all mock
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

    if (suggestion.suggestion_type === 'add') {
      // Require a valid feature_id for add suggestions. If missing or invalid, reject.
      // This ensures tasks are always placed under an existing feature.
      const featureId = proposed.feature_id;

      if (!featureId) {
        return reply.code(400).send({
          error: 'feature_id is required for add suggestions. Please specify which feature this task belongs to.'
        });
      }

      const featCheck = await query('SELECT id FROM features WHERE id = $1', [featureId]);
      if (featCheck.rows.length === 0) {
        return reply.code(400).send({
          error: `Feature with id "${featureId}" not found. Please use an existing feature_id.`
        });
      }

      // Wrap in a transaction so partial state doesn't persist on failure.
      await query('BEGIN');
      try {

        // Find order_index for the new todo under the resolved feature
        const countRes = await query('SELECT COUNT(*) FROM todos WHERE feature_id = $1', [featureId]);
        const orderIdx = parseInt(countRes.rows[0].count) || 0;

        await query(
          `INSERT INTO todos 
            (project_id, feature_id, title, detail, entities, depends_on, status, order_index, human_locked) 
          VALUES 
            ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            suggestion.project_id,
            featureId,
            proposed.title,
            proposed.detail || '',
            (proposed.entities || []).map(e => e.toLowerCase()),
            [], // depends_on initially empty
            'open',
            orderIdx,
            true // human_locked
          ]
        );

        await query('COMMIT');
      } catch (txErr) {
        await query('ROLLBACK');
        throw txErr;
      }
    } else if (suggestion.suggestion_type === 'modify') {
      await query(
        `UPDATE todos 
         SET title = $1, detail = $2, entities = $3, human_locked = true, updated_at = NOW() 
         WHERE id = $4`,
        [
          proposed.title,
          proposed.detail || '',
          (proposed.entities || []).map(e => e.toLowerCase()),
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

  // Convert to Cytoscape elements format (compound nodes: features contain todos)
  const elements = [];

  // Add feature nodes (parents) and todo nodes (children)
  for (const feature of featuresWithTodos) {
    // Add feature as a parent node
    elements.push({
      data: {
        id: feature.id,
        label: feature.title,
        type: 'feature',
        graph_type: feature.graph_type || 'capability',
        status: feature.status,
        human_locked: feature.human_locked,
        entity_count: feature.entities?.length || 0,
        todo_count: feature.todos?.length || 0,
        constraints: feature.constraints || [],
        confidence: feature.confidence,
        source: feature.source,
      }
    });

    // Add todo nodes as children of the feature (compound nodes)
    for (const todo of feature.todos) {
      elements.push({
        data: {
          id: todo.id,
          label: todo.title,
          type: 'todo',
          graph_type: todo.graph_type || 'service',
          status: todo.status,
          human_locked: todo.human_locked,
          entity_count: todo.entities?.length || 0,
          parent: feature.id, // Compound node: todo is inside feature
        }
      });

      // Add depends_on edges (only between todos)
      if (todo.depends_on && Array.isArray(todo.depends_on)) {
        for (const depId of todo.depends_on) {
          // Verify the source node exists in our elements
          const sourceExists = elements.some(e => e.data.id === depId);
          if (sourceExists) {
            elements.push({
              data: {
                id: `edge-${todo.id}-dep-${depId}`,
                source: depId,
                target: todo.id,
                type: 'depends_on',
              }
            });
          } else {
            console.warn(`[Graph] Skipping edge: source node ${depId} not found for todo ${todo.id}`);
          }
        }
      }
    }
  }  // <-- closes for (const feature of featuresWithTodos)

  // Summary log
  const nodeCount = elements.filter(e => !e.data.source).length;
  const edgeCount = elements.filter(e => e.data.source).length;
  const dependsOnEdges = elements.filter(e => e.data.type === 'depends_on').length;
  console.log(`[Graph] Returning ${nodeCount} nodes and ${edgeCount} edges (${dependsOnEdges} depends_on edges)`);

  return { elements };
});

// ==================== Redmine Sync Endpoints ====================

// Helper: Map requirements-os status to Redmine status ID
function mapStatusToRedmine(status) {
  // Default Redmine statuses: 1=New, 2=In Progress, 3=Resolved, 4=Feedback, 5=Closed, 6=Rejected
  const mapping = {
    'draft': 1,
    'ready': 1,
    'in_progress': 2,
    'done': 5,
    'open': 1,
    'blocked': 1,
  };
  return mapping[status] || 1;
}

// Helper: Map Redmine status ID to requirements-os status
function mapStatusFromRedmine(redmineStatusId) {
  const mapping = {
    1: 'open',
    2: 'in_progress',
    3: 'in_progress',
    4: 'open',
    5: 'done',
    6: 'open',
  };
  return mapping[redmineStatusId] || 'open';
}

// Helper: Get Redmine project identifier for a project
async function getRedmineProjectId(projectId) {
  // First check if project has a specific Redmine project set
  const projectRes = await query('SELECT redmine_project_identifier FROM projects WHERE id = $1', [projectId]);
  if (projectRes.rows.length > 0 && projectRes.rows[0].redmine_project_identifier) {
    return projectRes.rows[0].redmine_project_identifier;
  }
  // Fall back to global config
  return REDMINE_PROJECT_IDENTIFIER;
}

// POST /api/projects/:id/sync/redmine - Sync all features and todos to Redmine
server.post('/api/projects/:id/sync/redmine', async (request, reply) => {
  const { id } = request.params;

  try {
    // Get project with features and todos
    const projectRes = await query('SELECT * FROM projects WHERE id = $1', [id]);
    if (projectRes.rows.length === 0) {
      return reply.code(404).send({ error: 'Project not found' });
    }

    const featuresRes = await query('SELECT * FROM features WHERE project_id = $1 ORDER BY order_index', [id]);
    const features = featuresRes.rows;

    // Get Redmine project ID for this project
    const redmineProjectId = await getRedmineProjectId(id);

    const results = {
      features: [],
      todos: [],
      errors: [],
    };

    // Sync each feature
    for (const feature of features) {
      try {
        const todosRes = await query('SELECT * FROM todos WHERE feature_id = $1 ORDER BY order_index', [feature.id]);
        const todos = todosRes.rows;

        // Create/update feature in Redmine
        const featurePayload = {
          issue: {
            project_id: redmineProjectId,
            subject: feature.title,
            description: feature.description || '',
            tracker_id: REDMINE_FEATURE_TRACKER_ID, // Feature tracker in Redmine
            status_id: mapStatusToRedmine(feature.status),
          }
        };

        let redmineIssueId;
        if (feature.ticket_id && feature.ticket_adapter === 'redmine') {
          try {
            // Update existing
            await redmineRequest(`issues/${feature.ticket_id}`, 'PUT', featurePayload);
            redmineIssueId = feature.ticket_id;
          } catch (err) {
            // If issue doesn't exist in Redmine (404), create new one
            if (err.message.includes('404')) {
              const result = await redmineRequest('issues', 'POST', featurePayload);
              redmineIssueId = result.issue.id;
              // Update our DB with new ticket_id
              await query('UPDATE features SET ticket_id = $1, ticket_adapter = $2 WHERE id = $3', [redmineIssueId.toString(), 'redmine', feature.id]);
            } else {
              throw err; // Re-throw if it's not a 404
            }
          }
        } else {
          // Create new
          const result = await redmineRequest('issues', 'POST', featurePayload);
          redmineIssueId = result.issue.id;
          // Update our DB
          await query('UPDATE features SET ticket_id = $1, ticket_adapter = $2 WHERE id = $3', [redmineIssueId.toString(), 'redmine', feature.id]);
        }

        results.features.push({ id: feature.id, redmine_issue_id: redmineIssueId, title: feature.title });

        // Sync todos for this feature
        for (const todo of todos) {
          try {
            const todoPayload = {
              issue: {
                project_id: redmineProjectId,
                subject: todo.title,
                description: todo.detail || '',
                tracker_id: REDMINE_TODO_TRACKER_ID, // Todo tracker in Redmine
                status_id: mapStatusToRedmine(todo.status),
                parent_issue_id: redmineIssueId, // Link to feature's issue
              }
            };

            let todoRedmineId;
            if (todo.ticket_id && todo.ticket_adapter === 'redmine') {
              try {
                await redmineRequest(`issues/${todo.ticket_id}`, 'PUT', todoPayload);
                todoRedmineId = todo.ticket_id;
              } catch (err) {
                // If issue doesn't exist in Redmine (404), create new one
                if (err.message.includes('404')) {
                  const result = await redmineRequest('issues', 'POST', todoPayload);
                  todoRedmineId = result.issue.id;
                  await query('UPDATE todos SET ticket_id = $1, ticket_adapter = $2 WHERE id = $3', [todoRedmineId.toString(), 'redmine', todo.id]);
                } else {
                  throw err; // Re-throw if it's not a 404
                }
              }
            } else {
              const result = await redmineRequest('issues', 'POST', todoPayload);
              todoRedmineId = result.issue.id;
              await query('UPDATE todos SET ticket_id = $1, ticket_adapter = $2 WHERE id = $3', [todoRedmineId.toString(), 'redmine', todo.id]);
            }

            results.todos.push({ id: todo.id, redmine_issue_id: todoRedmineId, title: todo.title });
          } catch (err) {
            results.errors.push(`Todo ${todo.id}: ${err.message}`);
          }
        }
      } catch (err) {
        results.errors.push(`Feature ${feature.id}: ${err.message}`);
      }
    }

    return { success: true, ...results };
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Sync failed', details: err.message });
  }
});

// POST /api/features/:id/sync/redmine - Sync single feature
server.post('/api/features/:id/sync/redmine', async (request, reply) => {
  const { id } = request.params;

  try {
    const featureRes = await query('SELECT * FROM features WHERE id = $1', [id]);
    if (featureRes.rows.length === 0) {
      return reply.code(404).send({ error: 'Feature not found' });
    }
    const feature = featureRes.rows[0];

    // Get Redmine project ID for this feature's project
    const redmineProjectId = await getRedmineProjectId(feature.project_id);

    const featurePayload = {
      issue: {
        project_id: redmineProjectId,
        subject: feature.title,
        description: feature.description || '',
        tracker_id: REDMINE_FEATURE_TRACKER_ID,
        status_id: mapStatusToRedmine(feature.status),
      }
    };

    let redmineIssueId;
    if (feature.ticket_id && feature.ticket_adapter === 'redmine') {
      try {
        await redmineRequest(`issues/${feature.ticket_id}`, 'PUT', featurePayload);
        redmineIssueId = feature.ticket_id;
      } catch (err) {
        // If issue doesn't exist in Redmine (404), create new one
        if (err.message.includes('404')) {
          const result = await redmineRequest('issues', 'POST', featurePayload);
          redmineIssueId = result.issue.id;
          await query('UPDATE features SET ticket_id = $1, ticket_adapter = $2 WHERE id = $3', [redmineIssueId.toString(), 'redmine', id]);
        } else {
          throw err;
        }
      }
    } else {
      const result = await redmineRequest('issues', 'POST', featurePayload);
      redmineIssueId = result.issue.id;
      await query('UPDATE features SET ticket_id = $1, ticket_adapter = $2 WHERE id = $3', [redmineIssueId.toString(), 'redmine', id]);
    }

    return { success: true, feature_id: id, redmine_issue_id: redmineIssueId };
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Sync failed', details: err.message });
  }
});

// POST /api/todos/:id/sync/redmine - Sync single todo
server.post('/api/todos/:id/sync/redmine', async (request, reply) => {
  const { id } = request.params;

  try {
    const todoRes = await query('SELECT * FROM todos WHERE id = $1', [id]);
    if (todoRes.rows.length === 0) {
      return reply.code(404).send({ error: 'Todo not found' });
    }
    const todo = todoRes.rows[0];

    // Get parent feature for parent_issue_id
    const featureRes = await query('SELECT * FROM features WHERE id = $1', [todo.feature_id]);
    const feature = featureRes.rows[0];

    // Get Redmine project ID for this todo's project
    const redmineProjectId = await getRedmineProjectId(todo.project_id);

    const todoPayload = {
      issue: {
        project_id: redmineProjectId,
        subject: todo.title,
        description: todo.detail || '',
        tracker_id: REDMINE_TODO_TRACKER_ID,
        status_id: mapStatusToRedmine(todo.status),
        parent_issue_id: (feature && feature.ticket_id && feature.ticket_adapter === 'redmine') ? parseInt(feature.ticket_id) : undefined,
      }
    };

    let redmineIssueId;
    if (todo.ticket_id && todo.ticket_adapter === 'redmine') {
      try {
        await redmineRequest(`issues/${todo.ticket_id}`, 'PUT', todoPayload);
        redmineIssueId = todo.ticket_id;
      } catch (err) {
        // If issue doesn't exist in Redmine (404), create new one
        if (err.message.includes('404')) {
          const result = await redmineRequest('issues', 'POST', todoPayload);
          redmineIssueId = result.issue.id;
          await query('UPDATE todos SET ticket_id = $1, ticket_adapter = $2 WHERE id = $3', [redmineIssueId.toString(), 'redmine', id]);
        } else {
          throw err;
        }
      }
    } else {
      const result = await redmineRequest('issues', 'POST', todoPayload);
      redmineIssueId = result.issue.id;
      await query('UPDATE todos SET ticket_id = $1, ticket_adapter = $2 WHERE id = $3', [redmineIssueId.toString(), 'redmine', id]);
    }

    return { success: true, todo_id: id, redmine_issue_id: redmineIssueId };
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Sync failed', details: err.message });
  }
});

// ==================== Redmine Project Management ====================

// GET /api/redmine/projects - List available Redmine projects
// Optionally filter by requirements-os project ID
server.get('/api/redmine/projects', async (request, reply) => {
  const { project_id } = request.query;
  
  try {
    let redmineProjectId;
    if (project_id) {
      redmineProjectId = await getRedmineProjectId(project_id);
    }
    
    const result = await redmineRequest('projects', 'GET');
    return { 
      projects: result.projects || [],
      current_project: redmineProjectId || REDMINE_PROJECT_IDENTIFIER,
    };
  } catch (err) {
    return reply.code(500).send({ error: 'Failed to list Redmine projects', details: err.message });
  }
});

// PUT /api/projects/:id/redmine-project - Set which Redmine project to sync to
server.put('/api/projects/:id/redmine-project', async (request, reply) => {
  const { id } = request.params;
  const { redmine_project_identifier } = request.body;

  try {
    const projectRes = await query('SELECT * FROM projects WHERE id = $1', [id]);
    if (projectRes.rows.length === 0) {
      return reply.code(404).send({ error: 'Project not found' });
    }

    await query('UPDATE projects SET redmine_project_identifier = $1, updated_at = NOW() WHERE id = $2', 
      [redmine_project_identifier || null, id]);

    return { success: true, redmine_project_identifier };
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'Failed to set Redmine project', details: err.message });
  }
});

// Update redmine/status to accept optional project_id
server.get('/api/redmine/status', async (request, reply) => {
  const { project_id } = request.query;
  
  if (!REDMINE_API_KEY) {
    return { configured: false, message: 'Redmine API key not set' };
  }
  
  try {
    let checkProject = REDMINE_PROJECT_IDENTIFIER;
    if (project_id) {
      checkProject = await getRedmineProjectId(project_id);
    }
    
    const result = await redmineRequest('projects/' + checkProject);
    return { 
      configured: true, 
      connected: true, 
      project: result.project?.name || checkProject,
      url: REDMINE_URL,
      redmine_project_identifier: checkProject,
    };
  } catch (err) {
    return { 
      configured: true, 
      connected: false, 
      error: err.message,
      redmine_project_identifier: project_id ? await getRedmineProjectId(project_id) : REDMINE_PROJECT_IDENTIFIER,
    };
  }
});

// ==================== End Redmine Project Management ====================

// ==================== End Redmine Sync ====================

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