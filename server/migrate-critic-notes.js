const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'requirements_os',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

(async () => {
  await pool.query(`ALTER TABLE features ADD COLUMN IF NOT EXISTS critic_notes TEXT`);
  console.log('✓ features.critic_notes added');
  await pool.end();
})();
