const { query } = require('../_lib/db');
const { sendJson } = require('../_lib/http');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'GET') return sendJson(res, 405, { success: false, message: 'Method not allowed' });
    const r = await query("SELECT COALESCE(MAX(daily_id), 0) + 1 as nextDailyId FROM orders WHERE status = 'daily'");
    return sendJson(res, 200, { nextId: Number(r.rows?.[0]?.nextDailyId || 1) });
  } catch (err) {
    console.error(err);
    return sendJson(res, 500, { success: false, message: 'Server error.' });
  }
};

