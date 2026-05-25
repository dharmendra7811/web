const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'requirements_os',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

async function migrate() {
  const client = await pool.connect();
  
  try {
    console.log('Starting migration: PRD Review Pipeline update...');
    
    // Add columns to projects table if they don't exist
    await client.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS modules_analyzed JSONB`);
    await client.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS data_model_draft JSONB`);
    await client.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS api_surface_draft JSONB`);
    await client.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS integrations_draft JSONB`);
    await client.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS review_risks JSONB`);
    await client.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS review_assumptions JSONB`);
    
    // Check if review_state and review_questions exist on projects table (from previous steps)
    await client.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS review_state TEXT DEFAULT 'idle'`);
    await client.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS review_questions JSONB`);
    await client.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS review_answers JSONB`);

    console.log('projects table columns updated.');

    // Create review_jobs table
    await client.query(`
      CREATE TABLE IF NOT EXISTS review_jobs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
        module TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        result JSONB,
        created_at TIMESTAMPTZ DEFAULT now()
      )
    `);
    console.log('review_jobs table verified/created.');
    console.log('Migration completed successfully!');
  } catch (err) {
    console.error('Migration failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(err => {
  console.error(err);
  process.exit(1);
});
