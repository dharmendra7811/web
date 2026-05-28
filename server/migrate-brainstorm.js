const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'requirements_os',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

(async () => {
  console.log('Running brainstorm migration...\n');

  // 1. Add state column to projects (replaces review_state over time)
  await pool.query(`
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS state TEXT DEFAULT 'idle'
  `);
  console.log('✓ projects.state added (idle/parsing/exploring/finalized/synced/updating)');

  // 2. Set existing projects to sensible states based on current data
  await pool.query(`
    UPDATE projects SET state = 
      CASE 
        WHEN review_state = 'reviewing' THEN 'exploring'
        WHEN prd_text IS NOT NULL AND review_state = 'answered' THEN 'exploring'
        WHEN prd_text IS NOT NULL THEN 'exploring'
        ELSE 'idle'
      END
    WHERE state = 'idle'
  `);
  console.log('✓ existing projects migrated to new state values');

  // 3. Add module and confidence to features
  await pool.query(`
    ALTER TABLE features ADD COLUMN IF NOT EXISTS module TEXT
  `);
  await pool.query(`
    ALTER TABLE features ADD COLUMN IF NOT EXISTS confidence REAL
  `);
  console.log('✓ features.module and features.confidence added');

  // 4. Track which suggestion created a feature (for undo)
  await pool.query(`
    ALTER TABLE features ADD COLUMN IF NOT EXISTS created_by_suggestion UUID REFERENCES impact_suggestions(id)
  `);
  console.log('✓ features.created_by_suggestion added');

  // 5. Sync tracking columns on projects
  await pool.query(`
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ
  `);
  await pool.query(`
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS synced_feature_ids UUID[]
  `);
  await pool.query(`
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS synced_todo_ids UUID[]
  `);
  console.log('✓ projects.last_synced_at, synced_feature_ids, synced_todo_ids added');

  // 6. Add review_state to state constraint comment (keep both columns for now)
  console.log('\nMigration complete. review_state column kept for backward compat.');
  console.log('state values: idle | parsing | exploring | finalized | synced | updating');

  await pool.end();
})();
