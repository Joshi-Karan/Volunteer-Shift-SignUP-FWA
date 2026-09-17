function seedShifts(db) {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM shifts').get();
  if (count > 0) return;

  const insert = db.prepare(
    'INSERT INTO shifts (task, date, time, slots_available) VALUES (?, ?, ?, ?)'
  );

  const seedRows = [
    ['Food Bank Sorting', '2026-09-20', '09:00-11:00', 5],
    ['Park Cleanup', '2026-09-20', '13:00-15:00', 3],
    ['Soup Kitchen Serving', '2026-09-21', '11:00-13:00', 4],
    ['Book Drive Setup', '2026-09-21', '09:00-10:30', 2],
    ['Animal Shelter Walk', '2026-09-22', '10:00-12:00', 6],
  ];

  for (const row of seedRows) {
    insert.run(...row);
  }
}

module.exports = { seedShifts };
