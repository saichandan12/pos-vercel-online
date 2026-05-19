const { query } = require('../_lib/db');
const { sendJson, readJson } = require('../_lib/http');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return sendJson(res, 405, { success: false, message: 'Method not allowed' });

    const { items, actor, mode } = await readJson(req);
    if (!Array.isArray(items) || items.length === 0) return sendJson(res, 400, { success: false, message: 'Items array is required.' });

    const normalizedMode = String(mode || 'upsert').toLowerCase(); // upsert | insert_only
    if (!['upsert', 'insert_only'].includes(normalizedMode)) return sendJson(res, 400, { success: false, message: 'Invalid mode.' });

    const cleaned = items
      .map(it => ({
        name: String(it?.name || '').trim(),
        category: String(it?.category || '').trim(),
        price: Number(it?.price),
        price_half: it?.price_half === '' || it?.price_half == null ? null : Number(it?.price_half),
      }))
      .filter(it => it.name && it.category && Number.isFinite(it.price));

    if (!cleaned.length) return sendJson(res, 400, { success: false, message: 'No valid items to import.' });

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const it of cleaned) {
      if (normalizedMode === 'insert_only') {
        await query('INSERT INTO items (name, price, price_half, category, image) VALUES (?, ?, ?, ?, ?)', [it.name, it.price, it.price_half, it.category, '']);
        inserted += 1;
        continue;
      }

      const { rows } = await query('SELECT id FROM items WHERE name = ? AND category = ? LIMIT 1', [it.name, it.category]);
      const row = rows?.[0];
      if (!row) {
        await query('INSERT INTO items (name, price, price_half, category, image) VALUES (?, ?, ?, ?, ?)', [it.name, it.price, it.price_half, it.category, '']);
        inserted += 1;
      } else {
        await query('UPDATE items SET price = ?, price_half = ? WHERE id = ?', [it.price, it.price_half, row.id]);
        updated += 1;
      }
    }

    if (actor) await query('INSERT INTO audit_logs (actor, action, details) VALUES (?, ?, ?)', [actor, 'ITEMS_IMPORTED', `Imported ${cleaned.length} items (inserted ${inserted}, updated ${updated}, skipped ${skipped})`]);
    return sendJson(res, 200, { success: true, inserted, updated, skipped, total: cleaned.length });
  } catch (err) {
    console.error(err);
    return sendJson(res, err.statusCode || 500, { success: false, message: err.message || 'Server error.' });
  }
};

