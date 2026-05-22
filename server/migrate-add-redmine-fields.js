// Migration: Add Redmine fields to features table
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
    console.log('Starting migration: Add Redmine fields to features table...');
    
    // Check if columns already exist
    const checkResult = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'features' AND column_name = 'ticket_id'
    `);
    
    if (checkResult.rows.length === 0) {
      console.log('Adding ticket_id column to features table...');
      await client.query(`ALTER TABLE features ADD COLUMN ticket_id TEXT`);
      console.log('Adding ticket_adapter column to features table...');
      await client.query(`ALTER TABLE features ADD COLUMN ticket_adapter TEXT`);
      console.log('Migration completed successfully!');
    } else {
      console.log('Columns already exist, skipping migration.');
    }
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
