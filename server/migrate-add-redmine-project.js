// Migration: Add redmine_project_identifier to projects table
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
    console.log('Starting migration: Add redmine_project_identifier to projects table...');
    
    // Check if column already exists
    const checkResult = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'projects' AND column_name = 'redmine_project_identifier'
    `);
    
    if (checkResult.rows.length === 0) {
      console.log('Adding redmine_project_identifier column to projects table...');
      await client.query(`ALTER TABLE projects ADD COLUMN redmine_project_identifier TEXT`);
      console.log('Migration completed successfully!');
    } else {
      console.log('Column already exists, skipping migration.');
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
