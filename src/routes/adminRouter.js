const express = require('express');
const {
  ADMIN_USERNAME,
  ADMIN_PASSWORD,
  createSessionToken,
  invalidateToken,
  requireAdmin,
} = require('../adminAuth');
const { sendShiftCancellationEmail } = require('../emailService');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SHIFT_FIELDS = ['task', 'date', 'time', 'slots_available'];

function validateField(field, value) {
  switch (field) {
    case 'task': {
      if (typeof value !== 'string' || value.trim().length < 1 || value.trim().length > 200) {
        return 'task is required and must be 1-200 characters';
      }
      return null;
    }
    case 'date': {
      if (typeof value !== 'string' || !DATE_RE.test(value.trim())) {
        return "date is required and must be in 'YYYY-MM-DD' format";
      }
      return null;
    }
    case 'time': {
      if (typeof value !== 'string' || value.trim().length < 1 || value.trim().length > 50) {
        return 'time is required and must be 1-50 characters';
      }
      return null;
    }
    case 'slots_available': {
      const num = Number(value);
      if (value === undefined || value === null || !Number.isInteger(num) || num < 0) {
        return 'slots_available is required and must be a non-negative integer';
      }
      return null;
    }
    default:
      return null;
  }
}

function validateShiftInput(body, { partial }) {
  const fieldsPresent = SHIFT_FIELDS.filter((field) => body && Object.prototype.hasOwnProperty.call(body, field));

  if (partial && fieldsPresent.length === 0) {
    return { error: 'At least one field (task, date, time, slots_available) is required' };
  }

  const fieldsToValidate = partial ? fieldsPresent : SHIFT_FIELDS;
  for (const field of fieldsToValidate) {
    const message = validateField(field, body ? body[field] : undefined);
    if (message) {
      return { error: message };
    }
  }

  return { fieldsToValidate };
}

function normalizeShiftValue(field, value) {
  if (field === 'task' || field === 'date' || field === 'time') {
    return value.trim();
  }
  if (field === 'slots_available') {
    return Number(value);
  }
  return value;
}

function createAdminRouter(db) {
  const router = express.Router();

  router.post('/login', (req, res) => {
    const { username, password } = req.body || {};

    if (typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'INVALID_INPUT', message: 'username and password are required' });
    }

    if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid username or password' });
    }

    const token = createSessionToken();
    return res.status(200).json({ token });
  });

  router.use(requireAdmin);

  router.post('/logout', (req, res) => {
    invalidateToken(req.adminToken);
    return res.status(204).send();
  });

  router.get('/session', (req, res) => {
    return res.status(200).json({ valid: true });
  });

  router.post('/shifts', (req, res) => {
    const { error } = validateShiftInput(req.body, { partial: false });
    if (error) {
      return res.status(400).json({ error: 'INVALID_INPUT', message: error });
    }

    const values = SHIFT_FIELDS.map((field) => normalizeShiftValue(field, req.body[field]));
    const info = db
      .prepare('INSERT INTO shifts (task, date, time, slots_available) VALUES (?, ?, ?, ?)')
      .run(...values);

    const shift = db
      .prepare('SELECT shift_id, task, date, time, slots_available FROM shifts WHERE shift_id = ?')
      .get(info.lastInsertRowid);

    return res.status(201).json(shift);
  });

  router.patch('/shifts/:id', (req, res) => {
    const shiftId = Number(req.params.id);
    if (!Number.isInteger(shiftId) || shiftId <= 0) {
      return res.status(404).json({ error: 'SHIFT_NOT_FOUND', message: `No shift with id ${req.params.id}` });
    }

    const existing = db.prepare('SELECT shift_id FROM shifts WHERE shift_id = ?').get(shiftId);
    if (!existing) {
      return res.status(404).json({ error: 'SHIFT_NOT_FOUND', message: `No shift with id ${shiftId}` });
    }

    const { error, fieldsToValidate } = validateShiftInput(req.body, { partial: true });
    if (error) {
      return res.status(400).json({ error: 'INVALID_INPUT', message: error });
    }

    const setClause = fieldsToValidate.map((field) => `${field} = ?`).join(', ');
    const values = fieldsToValidate.map((field) => normalizeShiftValue(field, req.body[field]));
    db.prepare(`UPDATE shifts SET ${setClause} WHERE shift_id = ?`).run(...values, shiftId);

    const shift = db
      .prepare('SELECT shift_id, task, date, time, slots_available FROM shifts WHERE shift_id = ?')
      .get(shiftId);

    return res.status(200).json(shift);
  });

  router.delete('/shifts/:id', (req, res) => {
    const shiftId = Number(req.params.id);
    if (!Number.isInteger(shiftId) || shiftId <= 0) {
      return res.status(404).json({ error: 'SHIFT_NOT_FOUND', message: `No shift with id ${req.params.id}` });
    }

    const shift = db.prepare('SELECT shift_id, task, date FROM shifts WHERE shift_id = ?').get(shiftId);
    if (!shift) {
      return res.status(404).json({ error: 'SHIFT_NOT_FOUND', message: `No shift with id ${shiftId}` });
    }

    const affectedVolunteers = db
      .prepare(
        `SELECT v.first_name, v.email
         FROM signups s
         JOIN volunteers v ON v.volunteer_id = s.volunteer_id
         WHERE s.shift_id = ?`
      )
      .all(shiftId);

    db.exec('BEGIN');
    try {
      db.prepare('DELETE FROM signups WHERE shift_id = ?').run(shiftId);
      db.prepare('DELETE FROM shifts WHERE shift_id = ?').run(shiftId);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    for (const volunteer of affectedVolunteers) {
      sendShiftCancellationEmail({ firstName: volunteer.first_name, email: volunteer.email, shift });
    }

    return res.status(200).json({ deleted_shift_id: shiftId, notified_count: affectedVolunteers.length });
  });

  router.get('/shifts/:id/signups', (req, res) => {
    const shiftId = Number(req.params.id);
    if (!Number.isInteger(shiftId) || shiftId <= 0) {
      return res.status(404).json({ error: 'SHIFT_NOT_FOUND', message: `No shift with id ${req.params.id}` });
    }

    const shift = db.prepare('SELECT shift_id, task FROM shifts WHERE shift_id = ?').get(shiftId);
    if (!shift) {
      return res.status(404).json({ error: 'SHIFT_NOT_FOUND', message: `No shift with id ${shiftId}` });
    }

    const signups = db
      .prepare(
        `SELECT s.signup_id, v.first_name, v.last_name, v.email, s.signup_date
         FROM signups s
         JOIN volunteers v ON v.volunteer_id = s.volunteer_id
         WHERE s.shift_id = ?
         ORDER BY s.signup_date`
      )
      .all(shiftId);

    return res.status(200).json({ shift_id: shift.shift_id, task: shift.task, signups });
  });

  return router;
}

module.exports = { createAdminRouter };
