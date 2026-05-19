const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('./_lib/db');
const { sendJson, readJson } = require('./_lib/http');

function getJwtSecret() {
  const v = process.env.JWT_SECRET;
  if (!v) throw new Error('Missing env var: JWT_SECRET');
  return v;
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return sendJson(res, 405, { success: false, message: 'Method not allowed' });

    const { username, password } = await readJson(req);
    if (!username || !password) {
      return sendJson(res, 400, { success: false, message: 'Username and password are required.' });
    }

    const { rows } = await query('SELECT * FROM users WHERE username = ? LIMIT 1', [username]);
    const user = rows?.[0];
    if (!user) return sendJson(res, 401, { success: false, message: 'Invalid username or password.' });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return sendJson(res, 401, { success: false, message: 'Invalid username or password.' });

    const token = jwt.sign(
      { username: user.username, role: user.role, name: user.name },
      getJwtSecret(),
      { expiresIn: '7d' }
    );

    return sendJson(res, 200, { success: true, role: user.role, name: user.name, username: user.username, token });
  } catch (err) {
    console.error(err);
    return sendJson(res, err.statusCode || 500, { success: false, message: 'Server error.' });
  }
};

