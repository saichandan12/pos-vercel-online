const { query } = require('../_lib/db');
const { sendJson } = require('../_lib/http');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'GET') return sendJson(res, 405, { success: false, message: 'Method not allowed' });
    const { rows } = await query('SELECT id, username, role, name FROM users ORDER BY id DESC');
    return sendJson(res, 200, rows || []);
  } catch (err) {
    console.error(err);
    return sendJson(res, 500, { success: false, message: 'Server error.' });
  }
};

