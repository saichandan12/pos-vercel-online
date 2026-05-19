const { query } = require('../_lib/db');
const { sendJson } = require('../_lib/http');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'GET') return sendJson(res, 405, { success: false, message: 'Method not allowed' });
    const url = new URL(req.url, 'http://localhost');
    const status = url.searchParams.get('status') || 'daily';
    const r = await query('SELECT COUNT(*) as total_orders FROM orders WHERE status = ?', [status]);
    return sendJson(res, 200, { total_orders: Number(r.rows?.[0]?.total_orders || 0) });
  } catch (err) {
    console.error(err);
    return sendJson(res, 500, { success: false, message: 'Server error.' });
  }
};

