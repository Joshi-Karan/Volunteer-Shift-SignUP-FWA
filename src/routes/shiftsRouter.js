const express = require('express');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SQLITE_CONSTRAINT_UNIQUE = 2067;

class SignupError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const ERROR_STATUS = {
  SHIFT_FULL: 409,
  DUPLICATE_SIGNUP: 409,
};

function validateSignupInput(body) {
  const { first_name, last_name, email, shift_id } = body || {};

  if (typeof first_name !== 'string' || first_name.trim().length < 1 || first_name.trim().length > 100) {
    return 'first_name is required and must be 1-100 characters';
  }
  if (typeof last_name !== 'string' || last_name.trim().length < 1 || last_name.trim().length > 100) {
    return 'last_name is required and must be 1-100 characters';
  }
  if (
    typeof email !== 'string' ||
    email.trim().length === 0 ||
    email.trim().length > 200 ||
    !EMAIL_RE.test(email.trim())
  ) {
    return 'email is required and must be a valid email address';
  }
  const shiftIdNum = Number(shift_id);
  if (shift_id === undefined || shift_id === null || !Number.isInteger(shiftIdNum) || shiftIdNum <= 0) {
    return 'shift_id is required and must be a positive integer';
  }
  return null;
}

function performSignup(db, { firstName, lastName, email, shiftId }) {
  const shift = db.prepare('SELECT slots_available FROM shifts WHERE shift_id = ?').get(shiftId);
  if (!shift || shift.slots_available <= 0) {
    throw new SignupError('SHIFT_FULL', 'This shift has no open slots');
  }

  let volunteerId;
  const volunteer = db.prepare('SELECT volunteer_id FROM volunteers WHERE email = ?').get(email);
  if (volunteer) {
    volunteerId = volunteer.volunteer_id;
  } else {
    const info = db
      .prepare('INSERT INTO volunteers (first_name, last_name, email) VALUES (?, ?, ?)')
      .run(firstName, lastName, email);
    volunteerId = info.lastInsertRowid;
  }

  const existingSignup = db
    .prepare('SELECT 1 FROM signups WHERE volunteer_id = ? AND shift_id = ?')
    .get(volunteerId, shiftId);
  if (existingSignup) {
    throw new SignupError('DUPLICATE_SIGNUP', 'This volunteer has already signed up for this shift');
  }

  const signupInfo = db
    .prepare('INSERT INTO signups (volunteer_id, shift_id) VALUES (?, ?)')
    .run(volunteerId, shiftId);

  db.prepare('UPDATE shifts SET slots_available = slots_available - 1 WHERE shift_id = ?').run(shiftId);

  const signupRow = db
    .prepare('SELECT signup_id, signup_date FROM signups WHERE signup_id = ?')
    .get(signupInfo.lastInsertRowid);
  const updatedShift = db.prepare('SELECT slots_available FROM shifts WHERE shift_id = ?').get(shiftId);

  return {
    signup_id: signupRow.signup_id,
    volunteer_id: volunteerId,
    shift_id: shiftId,
    signup_date: signupRow.signup_date,
    slots_available: updatedShift.slots_available,
  };
}

function createShiftsRouter(db) {
  const router = express.Router();

  router.get('/shifts', (req, res) => {
    const shifts = db
      .prepare(
        'SELECT shift_id, task, date, time, slots_available FROM shifts ORDER BY date, time'
      )
      .all();
    res.json(shifts);
  });

  router.post('/signups', (req, res) => {
    const validationError = validateSignupInput(req.body);
    if (validationError) {
      return res.status(400).json({ error: 'INVALID_INPUT', message: validationError });
    }

    const { first_name, last_name, email, shift_id } = req.body;
    const firstName = first_name.trim();
    const lastName = last_name.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const shiftId = Number(shift_id);

    const shiftExists = db.prepare('SELECT 1 FROM shifts WHERE shift_id = ?').get(shiftId);
    if (!shiftExists) {
      return res.status(404).json({ error: 'SHIFT_NOT_FOUND', message: `No shift with id ${shiftId}` });
    }

    let result;
    db.exec('BEGIN');
    try {
      result = performSignup(db, { firstName, lastName, email: normalizedEmail, shiftId });
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');

      if (err instanceof SignupError) {
        return res.status(ERROR_STATUS[err.code]).json({ error: err.code, message: err.message });
      }
      if (err.code === 'ERR_SQLITE_ERROR' && err.errcode === SQLITE_CONSTRAINT_UNIQUE) {
        return res
          .status(409)
          .json({ error: 'DUPLICATE_SIGNUP', message: 'This volunteer has already signed up for this shift' });
      }
      throw err;
    }

    return res.status(201).json(result);
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

    res.json({ shift_id: shift.shift_id, task: shift.task, signups });
  });

  return router;
}

module.exports = { createShiftsRouter, SignupError };
