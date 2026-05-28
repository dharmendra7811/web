const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'requirements_os',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

(async () => {
  console.log('Running pipeline migration...\n');

  // 1. Create pipeline_runs table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pipeline_runs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
      run_number INTEGER,
      phase TEXT,
      resume_from_phase TEXT,
      swm JSONB,
      error TEXT,
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);
  console.log('✓ pipeline_runs table created');

  // 2. Create index on pipeline_runs(project_id)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_pipeline_runs_project ON pipeline_runs(project_id)
  `);
  console.log('✓ idx_pipeline_runs_project index created');

  // 3. Create pipeline_checkpoints table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pipeline_checkpoints (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      run_id UUID REFERENCES pipeline_runs(id) ON DELETE CASCADE,
      questions JSONB,
      answers JSONB,
      status TEXT,
      answered_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);
  console.log('✓ pipeline_checkpoints table created');

  // 4. Create index on pipeline_checkpoints(run_id)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_pipeline_checkpoints_run ON pipeline_checkpoints(run_id)
  `);
  console.log('✓ idx_pipeline_checkpoints_run index created');

  // 5. Add group column to todos table
  await pool.query(`
    ALTER TABLE todos ADD COLUMN IF NOT EXISTS "group" TEXT
  `);
  console.log('✓ todos.group column added');

  console.log('\nPipeline migration complete.');
  await pool.end();
})();
