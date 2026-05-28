const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost', port: 5432, database: 'requirements_os',
  user: process.env.DB_USER || 'postgres', password: process.env.DB_PASSWORD || 'postgres'
});

async function clean() {
  const { rows } = await pool.query('SELECT id, data_model_draft, api_surface_draft FROM projects WHERE data_model_draft IS NOT NULL LIMIT 1');
  if (rows.length === 0) { console.log('No data'); process.exit(0); }
  const { id, data_model_draft: rawModel, api_surface_draft: rawApi } = rows[0];

  // console.log(`Raw: ${rawModel?.length || 0} schema, ${rawApi?.length || 0} API`);

  const tableMap = new Map();

  for (const entry of (rawModel || [])) {
    let tableName = null;
    let cols = new Set();

    if (typeof entry === 'string') {
      // "CREATE TABLE otp (id UUID PRIMARY KEY, ...)"
      let m = entry.match(/CREATE\s+TABLE\s+(\w+)\s*\((.+)\)/i);
      if (m) {
        tableName = m[1].toLowerCase();
        const colStr = m[2];
        for (const part of colStr.split(',')) {
          const colName = part.trim().split(/\s+/)[0].toLowerCase();
          if (colName && !['primary', 'foreign', 'unique', 'check', 'constraint', 'index'].includes(colName)) {
            cols.add(colName);
          }
        }
      }
      // "event(id PK, title, description, ...)"
      if (!tableName) {
        m = entry.match(/^(\w+)\s*\((.+)\)/);
        if (m) {
          tableName = m[1].toLowerCase();
          for (const part of m[2].split(',')) {
            const colName = part.trim().split(/\s+/)[0].toLowerCase();
            if (colName && colName !== 'id' && !colName.startsWith('...')) cols.add(colName);
          }
        }
      }
      // "Add columns to location table: timezone, latitude"
      if (!tableName) {
        m = entry.match(/to\s+`?(\w+)`?\s+table/i);
        if (m) tableName = m[1].toLowerCase();
      }
      // "Add location_id column to user_preferences table"
      if (!tableName) {
        m = entry.match(/to\s+`?(\w+)`?\s+table\s*$/i);
        if (m) tableName = m[1].toLowerCase();
      }
      // "Create user_artist_follows table (userId FK, artistId FK, ...)"
      if (!tableName) {
        m = entry.match(/(?:create|new)\s+`?(\w+)`?\s+table/i);
        if (m) tableName = m[1].toLowerCase();
      }
      // "venues table: add capacity INT, amenities JSON, ..."
      if (!tableName) {
        m = entry.match(/^`?(\w+)`?\s+table[:.]/i);
        if (m) tableName = m[1].toLowerCase();
      }
      // "booking (id PK, user_id FK, ...)"
      if (!tableName) {
        m = entry.match(/^(\w+)\s+\(/);
        if (m && !/\b(?:CREATE|ALTER|ADD|INDEX|INSERT|SELECT|UPDATE|DELETE)\b/i.test(m[1])) {
          tableName = m[1].toLowerCase();
        }
      }
    } else if (entry && typeof entry === 'object') {
      tableName = (entry.table || '').toLowerCase();
      if (entry.columns && Array.isArray(entry.columns)) {
        for (const c of entry.columns) {
          const name = typeof c === 'string' ? c.split(/\s+/)[0].toLowerCase() : (c?.name || '').toLowerCase();
          if (name) cols.add(name);
        }
      }
    }

    if (!tableName) continue;

    const existing = tableMap.get(tableName);
    if (existing) {
      for (const c of cols) existing.columns.add(c);
    } else {
      tableMap.set(tableName, { table: tableName, columns: cols });
    }
  }

  const normSchema = Array.from(tableMap.values()).map(t => ({
    table: t.table,
    columns: Array.from(t.columns)
  }));

  // API normalization (same as before)
  const epMap = new Map();
  for (const entry of (rawApi || [])) {
    let method = '', endpoint = '', module = '';
    if (typeof entry === 'string') {
      const m = entry.match(/^(GET|POST|PUT|PATCH|DELETE)\s+(\S+)/);
      if (m) { method = m[1]; endpoint = m[2]; }
    } else {
      method = entry.method || ''; endpoint = entry.endpoint || ''; module = entry.module || '';
    }
    if (method && endpoint) {
      const key = `${method} ${endpoint}`;
      if (!epMap.has(key)) epMap.set(key, { method, endpoint, module });
    }
  }
  const normApi = Array.from(epMap.values());

  await pool.query('UPDATE projects SET data_model_draft = $1, api_surface_draft = $2 WHERE id = $3',
    [JSON.stringify(normSchema), JSON.stringify(normApi), id]);

  // console.log(`Cleaned: ${normSchema.length} tables, ${normApi.length} endpoints`);
  // for (const t of normSchema.slice(0, 5)) {
  //   console.log(`  ${t.table}: [${t.columns.slice(0, 5).join(', ')}${t.columns.length > 5 ? '...' : ''}]`);
  // }
  process.exit(0);
}

clean().catch(e => { console.error(e); process.exit(1); });
