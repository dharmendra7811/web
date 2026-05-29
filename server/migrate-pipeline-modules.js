const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'requirements_os',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

(async () => {
  console.log('Running pipeline modules migration...\n');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pipeline_modules (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      run_id          UUID REFERENCES pipeline_runs(id) ON DELETE CASCADE,
      project_id      UUID REFERENCES projects(id) ON DELETE CASCADE,
      name            TEXT NOT NULL,
      rank            INTEGER NOT NULL DEFAULT 0,
      summary         TEXT,
      entities        JSONB DEFAULT '[]',
      status          TEXT DEFAULT 'pending',
      features_count  INTEGER DEFAULT 0,
      created_at      TIMESTAMPTZ DEFAULT now()
    )
  `);
  console.log('✓ pipeline_modules table created');

  await pool.query('CREATE INDEX IF NOT EXISTS idx_pipeline_modules_run ON pipeline_modules(run_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_pipeline_modules_rank ON pipeline_modules(run_id, rank)');
  console.log('✓ indexes created');

  console.log('\nMigration complete.');
  console.log('pipeline_modules.status values: pending | in_progress | done | skipped');
  await pool.end();
})();
