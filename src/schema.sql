CREATE TABLE IF NOT EXISTS volunteers (
  volunteer_id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name   TEXT NOT NULL,
  last_name    TEXT NOT NULL,
  email        TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS shifts (
  shift_id        INTEGER PRIMARY KEY AUTOINCREMENT,
  task            TEXT NOT NULL,
  date            TEXT NOT NULL,
  time            TEXT NOT NULL,
  slots_available INTEGER NOT NULL CHECK (slots_available >= 0)
);

CREATE TABLE IF NOT EXISTS signups (
  signup_id    INTEGER PRIMARY KEY AUTOINCREMENT,
  volunteer_id INTEGER NOT NULL REFERENCES volunteers(volunteer_id),
  shift_id     INTEGER NOT NULL REFERENCES shifts(shift_id),
  signup_date  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (volunteer_id, shift_id)
);
