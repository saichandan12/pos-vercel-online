const bcrypt = require('bcryptjs');
const { query } = require('../_lib/db');
const { sendJson, readJson } = require('../_lib/http');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'PUT') return sendJson(res, 405, { success: false, message: 'Method not allowed' });
    const { currentUsername, newName, newUsername, newPassword } = await readJson(req);
    if (!currentUsername || !newName || !newUsername) return sendJson(res, 400, { success: false, message: 'Missing required fields.' });

    const { rows } = await query('SELECT id FROM users WHERE username = ? LIMIT 1', [currentUsername]);
    const row = rows?.[0];
    if (!row) return sendJson(res, 404, { success: false, message: 'User not found.' });

    // If username is changing, ensure uniqueness
    if (String(newUsername).trim() !== String(currentUsername).trim()) {
      const exists = await query('SELECT id FROM users WHERE username = ? LIMIT 1', [newUsername]);
      if (exists.rows?.length) return sendJson(res, 400, { success: false, message: 'Username already exists.' });
    }

    if (newPassword) {
      const hash = await bcrypt.hash(newPassword, 10);
      await query('UPDATE users SET name = ?, username = ?, password = ? WHERE id = ?', [newName, newUsername, hash, row.id]);
    } else {
      await query('UPDATE users SET name = ?, username = ? WHERE id = ?', [newName, newUsername, row.id]);
    }

    return sendJson(res, 200, { success: true, message: 'Profile updated successfully.' });
  } catch (err) {
    console.error(err);
    return sendJson(res, 500, { success: false, message: 'Server error.' });
  }
};

