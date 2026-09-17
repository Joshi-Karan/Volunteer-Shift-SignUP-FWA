const path = require('node:path');
const express = require('express');
const { createDb } = require('./db');
const { seedShifts } = require('./seed');
const { createShiftsRouter } = require('./routes/shiftsRouter');

const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, '..', 'data', 'volunteer_signup.db');

const db = createDb(DB_PATH);
seedShifts(db);

const app = express();
app.use(express.json());
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'Malformed JSON body' });
  }
  next(err);
});
app.use('/api', createShiftsRouter(db));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.listen(PORT, () => {
  console.log(`Volunteer Shift Sign-Up server running at http://localhost:${PORT}`);
});
