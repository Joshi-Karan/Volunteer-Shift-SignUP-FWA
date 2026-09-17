const path = require('node:path');
const { createDb } = require('./db');
const { seedShifts } = require('./seed');
const { createApp } = require('./app');

const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, '..', 'data', 'volunteer_signup.db');

const db = createDb(DB_PATH);
seedShifts(db);

const app = createApp(db);

app.listen(PORT, () => {
  console.log(`Volunteer Shift Sign-Up server running at http://localhost:${PORT}`);
});
