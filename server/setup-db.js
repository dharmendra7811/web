const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Database connection details - adjust as needed or use environment variables
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = process.env.DB_PORT || 5432;
const DB_NAME = process.env.DB_NAME || 'requirements_os';
const DB_USER = process.env.DB_USER || 'postgres';
const DB_PASSWORD = process.env.DB_PASSWORD || 'postgres';

const pool = new Pool({
  host: DB_HOST,
  port: DB_PORT,
  database: DB_NAME,
  user: DB_USER,
  password: DB_PASSWORD,
});

// Read the schema file
const schemaPath = path.join(__dirname, 'schema.sql');
const schema = fs.readFileSync(schemaPath, 'utf8');

// Split the schema into individual statements (simple split by semicolon)
// Note: This is a simplified approach and may not work for all SQL,
// but it should work for our schema which doesn't have semicolons in strings or complex constructs.
const statements = schema
  .split(';')
  .map(statement => statement.trim())
  .filter(statement => statement.length > 0);

async function setupDatabase() {
  let client;
  try {
    client = await pool.connect();
    console.log('Connected to database');

    for (const statement of statements) {
      try {
        await client.query(statement);
        console.log(`Executed: ${substring(statement, 0, 50)}...`);
      } catch (err) {
        // Ignore errors for statements that might fail if objects already exist
        // In a production setup, you'd want to handle this more carefully
        console.warn(`Warning executing statement: ${err.message}`);
        console.warn(`Statement: ${substring(statement, 0, 100)}...`);
      }
    }

    console.log('Database setup completed successfully');
  } catch (err) {
    console.error('Error setting up database:', err);
  } finally {
    if (client) {
      client.release();
    }
    // Close the pool to exit
    await pool.end();
  }
}

function substring(str, start, length) {
  if (str.length <= start + length) {
    return str;
  }
  return str.substring(start, start + length);
}

setupDatabase();