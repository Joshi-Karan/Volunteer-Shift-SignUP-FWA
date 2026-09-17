const crypto = require('node:crypto');

const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'admin';

const activeTokens = new Map();

function createSessionToken() {
  const token = crypto.randomBytes(32).toString('hex');
  activeTokens.set(token, { createdAt: new Date().toISOString() });
  return token;
}

function isValidToken(token) {
  return typeof token === 'string' && activeTokens.has(token);
}

function invalidateToken(token) {
  activeTokens.delete(token);
}

function requireAdmin(req, res, next) {
  const authHeader = req.get('Authorization') || '';
  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !isValidToken(token)) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'A valid admin session token is required' });
  }

  req.adminToken = token;
  next();
}

module.exports = {
  ADMIN_USERNAME,
  ADMIN_PASSWORD,
  createSessionToken,
  isValidToken,
  invalidateToken,
  requireAdmin,
};
