import fs from 'fs';
import path from 'path';
import { pool } from './db';

async function init() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('Tables created successfully');
  await pool.end();
}

init().catch((err) => {
  console.error('Failed to create tables:', err);
  process.exit(1);
});