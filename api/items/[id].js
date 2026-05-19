const { query } = require('../_lib/db');
const { sendJson, readJson } = require('../_lib/http');

module.exports = async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const id = url.pathname.split('/').pop();
    if (!id) return sendJson(res, 400, { success: false, message: 'Missing id.' });

    if (req.method === 'PUT') {
      const { name, price, price_half, category, actor } = await readJson(req);
      if (!name || !price || !category) return sendJson(res, 400, { success: false, message: 'Name, price, and category are required.' });

      await query('UPDATE items SET name = ?, price = ?, price_half = ?, category = ? WHERE id = ?', [
        String(name).trim(),
        Number(price),
        price_half == null || price_half === '' ? null : Number(price_half),
        String(category).trim(),
        id,
      ]);

      if (actor) await query('INSERT INTO audit_logs (actor, action, details) VALUES (?, ?, ?)', [actor, 'ITEM_UPDATED', `Updated item ID ${id}`]);
      return sendJson(res, 200, { success: true });
    }

    if (req.method === 'DELETE') {
      const actor = url.searchParams.get('actor') || null;
      await query('DELETE FROM items WHERE id = ?', [id]);
      if (actor) await query('INSERT INTO audit_logs (actor, action, details) VALUES (?, ?, ?)', [actor, 'ITEM_DELETED', `Deleted item ID ${id}`]);
      return sendJson(res, 200, { success: true });
    }

    return sendJson(res, 405, { success: false, message: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return sendJson(res, err.statusCode || 500, { success: false, message: err.message || 'Server error.' });
  }
};

