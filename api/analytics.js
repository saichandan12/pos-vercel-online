const { query } = require('./_lib/db');
const { sendJson } = require('./_lib/http');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'GET') return sendJson(res, 405, { success: false, message: 'Method not allowed' });

    const summaryR = await query(`SELECT 
      COUNT(*) as totalOrders,
      COALESCE(SUM(total), 0) as totalRevenue,
      COALESCE(AVG(total), 0) as avgOrder
      FROM orders`);

    const summary = {
      totalOrders: Number(summaryR.rows?.[0]?.totalOrders || 0),
      totalRevenue: Number(summaryR.rows?.[0]?.totalRevenue || 0),
      avgOrder: Number(summaryR.rows?.[0]?.avgOrder || 0),
    };

    const topItemsR = await query(`
      SELECT i.name, COALESCE(SUM(oi.quantity),0) as totalQty
      FROM order_items oi
      LEFT JOIN items i ON i.id = oi.item_id
      GROUP BY oi.item_id
      ORDER BY totalQty DESC
      LIMIT 10
    `);

    const byCategoryR = await query(`
      SELECT i.category as category, COALESCE(SUM(oi.quantity * oi.price_at_time),0) as totalRevenue
      FROM order_items oi
      LEFT JOIN items i ON i.id = oi.item_id
      GROUP BY i.category
      ORDER BY totalRevenue DESC
    `);

    const dailyR = await query(`
      SELECT substr(timestamp, 1, 10) as date,
             COUNT(*) as orders,
             COALESCE(SUM(total),0) as revenue
      FROM orders
      GROUP BY substr(timestamp, 1, 10)
      ORDER BY date DESC
      LIMIT 30
    `);

    return sendJson(res, 200, {
      summary,
      topItems: topItemsR.rows || [],
      byCategory: byCategoryR.rows || [],
      daily: (dailyR.rows || []).reverse(),
    });
  } catch (err) {
    console.error(err);
    return sendJson(res, 500, { success: false, message: 'Server error.' });
  }
};

