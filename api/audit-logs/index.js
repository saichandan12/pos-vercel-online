const { query } = require('../_lib/db');
const { sendJson } = require('../_lib/http');

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      const { rows } = await query('SELECT id, timestamp, actor, action, details FROM audit_logs ORDER BY id DESC LIMIT 200');
      return sendJson(res, 200, rows || []);
    }

    if (req.method === 'DELETE') {
      await query('DELETE FROM audit_logs');
      return sendJson(res, 200, { success: true });
    }

    return sendJson(res, 405, { success: false, message: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return sendJson(res, 500, { success: false, message: 'Server error.' });
  }
};

