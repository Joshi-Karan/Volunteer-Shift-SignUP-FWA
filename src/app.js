const path = require('node:path');
const express = require('express');
const { createShiftsRouter } = require('./routes/shiftsRouter');

function createApp(db) {
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

  return app;
}

module.exports = { createApp };
