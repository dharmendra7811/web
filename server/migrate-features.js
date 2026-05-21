const { Pool } = require('pg');
const pool = new Pool({ host:'localhost', port:5432, database:'requirements_os', user:'postgres', password:'postgres' });

(async () => {
  await pool.query(`ALTER TABLE features ADD COLUMN IF NOT EXISTS constraints TEXT[] DEFAULT '{}'`);
  await pool.query(`ALTER TABLE features ADD COLUMN IF NOT EXISTS external_deps TEXT[] DEFAULT '{}'`);
  await pool.query(`ALTER TABLE features ADD COLUMN IF NOT EXISTS confidence FLOAT DEFAULT 0.5`);
  await pool.query(`ALTER TABLE features ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'inferred'`);
  console.log('Columns added');
  await pool.end();
})();