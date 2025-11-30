#!/usr/bin/env node
require('dotenv').config();
const db = require('../src/db');

(async () => {
  try {
    await db.migrate();
    console.log('Migrations finished');
    if (db && db.pool && typeof db.pool.end === 'function') {
      await db.pool.end();
    }
    process.exit(0);
  } catch (err) {
    console.error('Migration runner failed:', err);
    try { if (db && db.pool && typeof db.pool.end === 'function') await db.pool.end(); } catch (_) {}
    process.exit(1);
  }
})();
require('dotenv').config();
const path = require('path');
const { migrate, pool } = require('../src/db');

async function run() {
  try {
    console.log('Running migrations...');
    await migrate();
    console.log('Migrations applied successfully');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
