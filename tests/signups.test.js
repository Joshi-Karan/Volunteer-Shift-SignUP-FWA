const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createDb } = require('../src/db');
const { createApp } = require('../src/app');

function insertShift(db, { task = 'Test Shift', date = '2026-10-01', time = '09:00-10:00', slots_available }) {
  const info = db
    .prepare('INSERT INTO shifts (task, date, time, slots_available) VALUES (?, ?, ?, ?)')
    .run(task, date, time, slots_available);
  return info.lastInsertRowid;
}

test('POST /api/signups succeeds when slots are available', async () => {
  const db = createDb(':memory:');
  const shiftId = insertShift(db, { slots_available: 1 });
  const app = createApp(db);

  const res = await request(app)
    .post('/api/signups')
    .send({ first_name: 'Jane', last_name: 'Doe', email: 'jane@example.com', shift_id: shiftId });

  assert.equal(res.status, 201);
  assert.equal(res.body.shift_id, shiftId);
  assert.equal(res.body.slots_available, 0);

  const shiftsRes = await request(app).get('/api/shifts');
  const shift = shiftsRes.body.find((s) => s.shift_id === shiftId);
  assert.equal(shift.slots_available, 0);

  db.close();
});

test('POST /api/signups is rejected when the shift is full', async () => {
  const db = createDb(':memory:');
  const shiftId = insertShift(db, { slots_available: 0 });
  const app = createApp(db);

  const res = await request(app)
    .post('/api/signups')
    .send({ first_name: 'Bob', last_name: 'Lee', email: 'bob@example.com', shift_id: shiftId });

  assert.equal(res.status, 409);
  assert.equal(res.body.error, 'SHIFT_FULL');

  const signupsRes = await request(app).get(`/api/shifts/${shiftId}/signups`);
  assert.equal(signupsRes.body.signups.length, 0);

  db.close();
});

test('POST /api/signups is rejected on duplicate volunteer/shift pair', async () => {
  const db = createDb(':memory:');
  const shiftId = insertShift(db, { slots_available: 5 });
  const app = createApp(db);
  const payload = { first_name: 'Sam', last_name: 'Lee', email: 'sam@example.com', shift_id: shiftId };

  const first = await request(app).post('/api/signups').send(payload);
  assert.equal(first.status, 201);

  const second = await request(app).post('/api/signups').send(payload);
  assert.equal(second.status, 409);
  assert.equal(second.body.error, 'DUPLICATE_SIGNUP');

  const shiftsRes = await request(app).get('/api/shifts');
  const shift = shiftsRes.body.find((s) => s.shift_id === shiftId);
  assert.equal(shift.slots_available, 4);

  db.close();
});

test('GET /api/shifts/:id/signups returns the correct volunteer list (stretch)', async () => {
  const db = createDb(':memory:');
  const shiftId = insertShift(db, { task: 'Stretch Shift', slots_available: 5 });
  const app = createApp(db);

  await request(app)
    .post('/api/signups')
    .send({ first_name: 'A', last_name: 'A', email: 'a@example.com', shift_id: shiftId });
  await request(app)
    .post('/api/signups')
    .send({ first_name: 'B', last_name: 'B', email: 'b@example.com', shift_id: shiftId });

  const res = await request(app).get(`/api/shifts/${shiftId}/signups`);

  assert.equal(res.status, 200);
  assert.equal(res.body.task, 'Stretch Shift');
  assert.equal(res.body.signups.length, 2);
  assert.equal(res.body.signups[0].email, 'a@example.com');
  assert.equal(res.body.signups[1].email, 'b@example.com');

  db.close();
});

test('POST /api/signups returns 404 for a nonexistent shift_id (stretch)', async () => {
  const db = createDb(':memory:');
  const app = createApp(db);

  const res = await request(app)
    .post('/api/signups')
    .send({ first_name: 'X', last_name: 'Y', email: 'x@example.com', shift_id: 999 });

  assert.equal(res.status, 404);
  assert.equal(res.body.error, 'SHIFT_NOT_FOUND');

  db.close();
});
