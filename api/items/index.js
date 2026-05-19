const { query } = require('../_lib/db');
const { sendJson, readJson } = require('../_lib/http');

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      const { rows } = await query('SELECT * FROM items ORDER BY id DESC');
      return sendJson(res, 200, rows || []);
    }

    if (req.method === 'POST') {
      const { name, price, price_half, category, actor } = await readJson(req);
      if (!name || !price || !category) return sendJson(res, 400, { success: false, message: 'Name, price, and category are required.' });

      await query('INSERT INTO items (name, price, price_half, category, image) VALUES (?, ?, ?, ?, ?)', [
        String(name).trim(),
        Number(price),
        price_half == null || price_half === '' ? null : Number(price_half),
        String(category).trim(),
        '',
      ]);

      if (actor) await query('INSERT INTO audit_logs (actor, action, details) VALUES (?, ?, ?)', [actor, 'ITEM_ADDED', `Added item: ${name}`]);
      return sendJson(res, 200, { success: true });
    }

    if (req.method === 'DELETE') {
      const url = new URL(req.url, 'http://localhost');
      const all = String(url.searchParams.get('all') || '').toLowerCase() === 'true';
      const actor = url.searchParams.get('actor') || null;
      if (!all) return sendJson(res, 400, { success: false, message: 'Missing all=true' });

      const { rows } = await query('SELECT COUNT(*) as count FROM items');
      const deleted = Number(rows?.[0]?.count || 0);
      await query('DELETE FROM items');
      if (actor) await query('INSERT INTO audit_logs (actor, action, details) VALUES (?, ?, ?)', [actor, 'ITEMS_DELETED_ALL', `Deleted all items (${deleted})`]);
      return sendJson(res, 200, { success: true, deleted });
    }

    return sendJson(res, 405, { success: false, message: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return sendJson(res, err.statusCode || 500, { success: false, message: err.message || 'Server error.' });
  }
};

