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

async function loginAsAdmin(app) {
  const res = await request(app).post('/api/admin/login').send({ username: 'admin', password: 'admin' });
  return res.body.token;
}

test('POST /api/admin/login succeeds with correct credentials', async () => {
  const db = createDb(':memory:');
  const app = createApp(db);

  const res = await request(app).post('/api/admin/login').send({ username: 'admin', password: 'admin' });

  assert.equal(res.status, 200);
  assert.equal(typeof res.body.token, 'string');
  assert.ok(res.body.token.length > 0);

  db.close();
});

test('POST /api/admin/login fails with wrong credentials', async () => {
  const db = createDb(':memory:');
  const app = createApp(db);

  const res = await request(app).post('/api/admin/login').send({ username: 'admin', password: 'wrong' });

  assert.equal(res.status, 401);
  assert.equal(res.body.error, 'INVALID_CREDENTIALS');

  db.close();
});

test('POST /api/admin/login fails with missing fields', async () => {
  const db = createDb(':memory:');
  const app = createApp(db);

  const res = await request(app).post('/api/admin/login').send({ username: 'admin' });

  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'INVALID_INPUT');

  db.close();
});

test('admin routes reject requests without a token', async () => {
  const db = createDb(':memory:');
  const app = createApp(db);

  const res = await request(app).get('/api/admin/session');

  assert.equal(res.status, 401);
  assert.equal(res.body.error, 'UNAUTHORIZED');

  db.close();
});

test('admin routes reject requests with an invalid token', async () => {
  const db = createDb(':memory:');
  const app = createApp(db);

  const res = await request(app).get('/api/admin/session').set('Authorization', 'Bearer not-a-real-token');

  assert.equal(res.status, 401);
  assert.equal(res.body.error, 'UNAUTHORIZED');

  db.close();
});

test('GET /api/admin/session succeeds with a valid token', async () => {
  const db = createDb(':memory:');
  const app = createApp(db);
  const token = await loginAsAdmin(app);

  const res = await request(app).get('/api/admin/session').set('Authorization', `Bearer ${token}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.valid, true);

  db.close();
});

test('POST /api/admin/logout invalidates the token', async () => {
  const db = createDb(':memory:');
  const app = createApp(db);
  const token = await loginAsAdmin(app);

  const logoutRes = await request(app).post('/api/admin/logout').set('Authorization', `Bearer ${token}`);
  assert.equal(logoutRes.status, 204);

  const sessionRes = await request(app).get('/api/admin/session').set('Authorization', `Bearer ${token}`);
  assert.equal(sessionRes.status, 401);

  db.close();
});

test('POST /api/admin/shifts creates a shift', async () => {
  const db = createDb(':memory:');
  const app = createApp(db);
  const token = await loginAsAdmin(app);

  const res = await request(app)
    .post('/api/admin/shifts')
    .set('Authorization', `Bearer ${token}`)
    .send({ task: 'New Shift', date: '2026-11-15', time: '10:00-12:00', slots_available: 4 });

  assert.equal(res.status, 201);
  assert.equal(res.body.task, 'New Shift');
  assert.equal(res.body.slots_available, 4);

  const shiftsRes = await request(app).get('/api/shifts');
  const created = shiftsRes.body.find((s) => s.shift_id === res.body.shift_id);
  assert.ok(created, 'created shift should appear in GET /api/shifts');

  db.close();
});

test('POST /api/admin/shifts rejects invalid input', async () => {
  const db = createDb(':memory:');
  const app = createApp(db);
  const token = await loginAsAdmin(app);

  const cases = [
    { date: '2026-11-15', time: '10:00-12:00', slots_available: 4 },
    { task: 'Missing date', time: '10:00-12:00', slots_available: 4 },
    { task: 'Bad date', date: '11-15-2026', time: '10:00-12:00', slots_available: 4 },
    { task: 'Negative slots', date: '2026-11-15', time: '10:00-12:00', slots_available: -1 },
  ];

  for (const body of cases) {
    const res = await request(app).post('/api/admin/shifts').set('Authorization', `Bearer ${token}`).send(body);
    assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(body)}`);
    assert.equal(res.body.error, 'INVALID_INPUT');
  }

  db.close();
});

test('PATCH /api/admin/shifts/:id updates only the provided fields', async () => {
  const db = createDb(':memory:');
  const shiftId = insertShift(db, { task: 'Original', date: '2026-10-01', time: '09:00-10:00', slots_available: 3 });
  const app = createApp(db);
  const token = await loginAsAdmin(app);

  const res = await request(app)
    .patch(`/api/admin/shifts/${shiftId}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ slots_available: 7 });

  assert.equal(res.status, 200);
  assert.equal(res.body.slots_available, 7);
  assert.equal(res.body.task, 'Original');
  assert.equal(res.body.date, '2026-10-01');
  assert.equal(res.body.time, '09:00-10:00');

  db.close();
});

test('PATCH /api/admin/shifts/:id returns 404 for a nonexistent shift', async () => {
  const db = createDb(':memory:');
  const app = createApp(db);
  const token = await loginAsAdmin(app);

  const res = await request(app)
    .patch('/api/admin/shifts/999')
    .set('Authorization', `Bearer ${token}`)
    .send({ slots_available: 1 });

  assert.equal(res.status, 404);
  assert.equal(res.body.error, 'SHIFT_NOT_FOUND');

  db.close();
});

test('PATCH /api/admin/shifts/:id returns 400 when no fields are provided', async () => {
  const db = createDb(':memory:');
  const shiftId = insertShift(db, { slots_available: 3 });
  const app = createApp(db);
  const token = await loginAsAdmin(app);

  const res = await request(app).patch(`/api/admin/shifts/${shiftId}`).set('Authorization', `Bearer ${token}`).send({});

  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'INVALID_INPUT');

  db.close();
});

test('DELETE /api/admin/shifts/:id removes a shift with no signups', async () => {
  const db = createDb(':memory:');
  const shiftId = insertShift(db, { slots_available: 2 });
  const app = createApp(db);
  const token = await loginAsAdmin(app);

  const res = await request(app).delete(`/api/admin/shifts/${shiftId}`).set('Authorization', `Bearer ${token}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.deleted_shift_id, shiftId);
  assert.equal(res.body.notified_count, 0);

  const shiftsRes = await request(app).get('/api/shifts');
  assert.equal(shiftsRes.body.find((s) => s.shift_id === shiftId), undefined);

  db.close();
});

test('DELETE /api/admin/shifts/:id returns 404 for a nonexistent shift', async () => {
  const db = createDb(':memory:');
  const app = createApp(db);
  const token = await loginAsAdmin(app);

  const res = await request(app).delete('/api/admin/shifts/999').set('Authorization', `Bearer ${token}`);

  assert.equal(res.status, 404);
  assert.equal(res.body.error, 'SHIFT_NOT_FOUND');

  db.close();
});

test('DELETE /api/admin/shifts/:id cascades signups and notifies affected volunteers by email', async () => {
  const db = createDb(':memory:');
  const shiftId = insertShift(db, { task: 'Cascade Shift', slots_available: 5 });
  const app = createApp(db);
  const token = await loginAsAdmin(app);

  await request(app)
    .post('/api/signups')
    .send({ first_name: 'A', last_name: 'A', email: 'a@example.com', shift_id: shiftId });
  await request(app)
    .post('/api/signups')
    .send({ first_name: 'B', last_name: 'B', email: 'b@example.com', shift_id: shiftId });

  const originalLog = console.log;
  const logs = [];
  console.log = (...args) => logs.push(args.join(' '));

  let res;
  try {
    res = await request(app).delete(`/api/admin/shifts/${shiftId}`).set('Authorization', `Bearer ${token}`);
  } finally {
    console.log = originalLog;
  }

  assert.equal(res.status, 200);
  assert.equal(res.body.notified_count, 2);

  const remainingSignups = db.prepare('SELECT 1 FROM signups WHERE shift_id = ?').all(shiftId);
  assert.equal(remainingSignups.length, 0);

  const cancellationLogs = logs.filter((line) => line.includes('Cancellation email sent'));
  assert.equal(cancellationLogs.length, 2);
  assert.ok(cancellationLogs.some((line) => line.includes('a@example.com')));
  assert.ok(cancellationLogs.some((line) => line.includes('b@example.com')));

  db.close();
});

test('GET /api/admin/shifts/:id/signups requires auth', async () => {
  const db = createDb(':memory:');
  const shiftId = insertShift(db, { slots_available: 5 });
  const app = createApp(db);

  const res = await request(app).get(`/api/admin/shifts/${shiftId}/signups`);

  assert.equal(res.status, 401);

  db.close();
});

test('GET /api/admin/shifts/:id/signups returns the correct volunteer list', async () => {
  const db = createDb(':memory:');
  const shiftId = insertShift(db, { task: 'Stretch Shift', slots_available: 5 });
  const app = createApp(db);
  const token = await loginAsAdmin(app);

  await request(app)
    .post('/api/signups')
    .send({ first_name: 'A', last_name: 'A', email: 'a@example.com', shift_id: shiftId });
  await request(app)
    .post('/api/signups')
    .send({ first_name: 'B', last_name: 'B', email: 'b@example.com', shift_id: shiftId });

  const res = await request(app).get(`/api/admin/shifts/${shiftId}/signups`).set('Authorization', `Bearer ${token}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.task, 'Stretch Shift');
  assert.equal(res.body.signups.length, 2);
  assert.equal(res.body.signups[0].email, 'a@example.com');
  assert.equal(res.body.signups[1].email, 'b@example.com');

  db.close();
});

test('GET /api/admin/shifts/:id/signups returns 404 for a nonexistent shift', async () => {
  const db = createDb(':memory:');
  const app = createApp(db);
  const token = await loginAsAdmin(app);

  const res = await request(app).get('/api/admin/shifts/999/signups').set('Authorization', `Bearer ${token}`);

  assert.equal(res.status, 404);
  assert.equal(res.body.error, 'SHIFT_NOT_FOUND');

  db.close();
});
