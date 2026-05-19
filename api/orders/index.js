const { query } = require('../_lib/db');
const { sendJson, readJson } = require('../_lib/http');

module.exports = async (req, res) => {
  try {
    if (req.method === 'POST') {
      const { subtotal, total, items, cashier_name } = await readJson(req);
      if (!Array.isArray(items) || items.length === 0) return sendJson(res, 400, { success: false, message: 'Items are required.' });

      const status = 'daily';
      const nextDaily = await query("SELECT COALESCE(MAX(daily_id), 0) + 1 as nextDailyId FROM orders WHERE status = 'daily'");
      const dailyId = Number(nextDaily.rows?.[0]?.nextDailyId || 1);

      const created = await query(
        'INSERT INTO orders (subtotal, total, cashier_name, status, daily_id) VALUES (?, ?, ?, ?, ?)',
        [Number(subtotal || 0), Number(total || 0), cashier_name || 'Unknown', status, dailyId]
      );

      const orderId = created.lastInsertRowid;
      for (const it of items) {
        await query('INSERT INTO order_items (order_id, item_id, quantity, price_at_time) VALUES (?, ?, ?, ?)', [
          orderId,
          Number(it.id),
          Number(it.quantity || 1),
          Number(it.price || 0),
        ]);
      }

      return sendJson(res, 200, { success: true, orderId: dailyId, globalId: orderId });
    }

    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const status = url.searchParams.get('status') || 'daily';

      const { rows } = await query(
        `SELECT o.id, o.daily_id, o.timestamp, o.subtotal, o.total, o.cashier_name, o.status
         FROM orders o
         WHERE o.status = ?
         ORDER BY o.id DESC`,
        [status]
      );

      // Attach items
      const out = [];
      for (const o of rows || []) {
        const items = await query(
          `SELECT oi.item_id as id, oi.quantity, oi.price_at_time as price, i.name
           FROM order_items oi
           LEFT JOIN items i ON i.id = oi.item_id
           WHERE oi.order_id = ?`,
          [o.id]
        );
        out.push({ ...o, items: items.rows || [] });
      }

      return sendJson(res, 200, out);
    }

    return sendJson(res, 405, { success: false, message: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return sendJson(res, err.statusCode || 500, { success: false, message: err.message || 'Server error.' });
  }
};

