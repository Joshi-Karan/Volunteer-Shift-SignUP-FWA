const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

function createDb(pathOrMemory) {
  if (pathOrMemory !== ':memory:') {
    fs.mkdirSync(path.dirname(pathOrMemory), { recursive: true });
  }

  const db = new DatabaseSync(pathOrMemory);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

  return db;
}

module.exports = { createDb };
