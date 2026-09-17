const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createDb } = require('../src/db');
const { createApp } = require('../src/app');

function seedFixtureShifts(db) {
  const insert = db.prepare(
    'INSERT INTO shifts (task, date, time, slots_available) VALUES (?, ?, ?, ?)'
  );
  insert.run('Test Shift A', '2026-10-01', '09:00-10:00', 3);
  insert.run('Test Shift B', '2026-10-02', '14:00-15:00', 0);
}

test('GET /api/shifts returns the correct list', async () => {
  const db = createDb(':memory:');
  seedFixtureShifts(db);
  const app = createApp(db);

  const res = await request(app).get('/api/shifts');

  assert.equal(res.status, 200);
  assert.equal(res.body.length, 2);
  assert.deepEqual(res.body[0], {
    shift_id: 1,
    task: 'Test Shift A',
    date: '2026-10-01',
    time: '09:00-10:00',
    slots_available: 3,
  });
  assert.deepEqual(res.body[1], {
    shift_id: 2,
    task: 'Test Shift B',
    date: '2026-10-02',
    time: '14:00-15:00',
    slots_available: 0,
  });

  db.close();
});
