const bcrypt = require('bcryptjs');
const { query } = require('./_lib/db');
const { sendJson, readJson } = require('./_lib/http');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return sendJson(res, 405, { success: false, message: 'Method not allowed' });
    const { username, password, name } = await readJson(req);

    if (!username || !password || !name) {
      return sendJson(res, 400, { success: false, message: 'All fields (name, username, password) are required.' });
    }

    const hash = await bcrypt.hash(password, 10);
    try {
      await query('INSERT INTO users (username, password, role, name) VALUES (?, ?, ?, ?)', [
        String(username).trim(),
        hash,
        'staff',
        String(name).trim(),
      ]);
    } catch (e) {
      const msg = String(e?.message || '');
      if (msg.toLowerCase().includes('unique')) {
        return sendJson(res, 400, { success: false, message: 'Username already exists.' });
      }
      throw e;
    }

    return sendJson(res, 200, { success: true, message: 'User registered successfully as Staff.' });
  } catch (err) {
    console.error(err);
    return sendJson(res, err.statusCode || 500, { success: false, message: 'Server error during registration.' });
  }
};

