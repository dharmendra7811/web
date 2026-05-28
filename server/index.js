require('dotenv').config();

const Fastify = require('fastify');
const cors = require('@fastify/cors');
const { Pool } = require('pg');
const Redis = require('ioredis');
const OpenAI = require('openai');

// ── Server ──
const server = Fastify({
  logger: true,
  disableRequestLogging: true
});
server.register(cors, {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform'],
});
server.register(require('@fastify/multipart'), { limits: { fileSize: 20 * 1024 * 1024 } });

// ── Config ──
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = process.env.DB_PORT || 5432;
const DB_NAME = process.env.DB_NAME || 'requirements_os';
const DB_USER = process.env.DB_USER || 'postgres';
const DB_PASSWORD = process.env.DB_PASSWORD || 'postgres';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

// ── Database ──
const pool = new Pool({ host: DB_HOST, port: DB_PORT, database: DB_NAME, user: DB_USER, password: DB_PASSWORD });
const query = (text, params) => pool.query(text, params);

// ── Redis ──
const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

// ── OpenAI ──
const openai = new OpenAI({
  baseURL: OPENROUTER_BASE_URL,
  apiKey: OPENROUTER_API_KEY || 'dummy-key',
  defaultHeaders: { "HTTP-Referer": "http://localhost:3000", "X-Title": "Requirements OS" }
});

// ── Redmine ──
const REDMINE_URL = process.env.REDMINE_URL || 'http://localhost:3001';
const REDMINE_API_KEY = process.env.REDMINE_API_KEY;
const REDMINE_PROJECT_IDENTIFIER = process.env.REDMINE_PROJECT_IDENTIFIER || 'requirements-os';
const REDMINE_FEATURE_TRACKER_ID = parseInt(process.env.REDMINE_FEATURE_TRACKER_ID || '2');
const REDMINE_TODO_TRACKER_ID = parseInt(process.env.REDMINE_TODO_TRACKER_ID || '1');

// ── Routes ──
server.register(require('./routes/pipeline'), { query });

// ── Start ──
const start = async () => {
  try {
    await server.listen({ port: 3000, host: '0.0.0.0' });
    console.log(`Server running on http://localhost:3000`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};
start();
