const { Pool } = require('pg');
const pool = new Pool({ host:'localhost', port:5432, database:'requirements_os', user:'postgres', password:'postgres' });

(async () => {
  // Add graph_type to features: capability, service, risk
  await pool.query(`ALTER TABLE features ADD COLUMN IF NOT EXISTS graph_type TEXT DEFAULT 'capability'`);
  // Add graph_type to todos: service, infra, execution
  await pool.query(`ALTER TABLE todos ADD COLUMN IF NOT EXISTS graph_type TEXT DEFAULT 'service'`);
  
  console.log('graph_type columns added to features and todos');
  await pool.end();
})();