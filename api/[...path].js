const bcrypt = require('bcryptjs');
const { query } = require('./_lib/db');
const { sendJson, readJson } = require('./_lib/http');

function pathOf(req) {
  return new URL(req.url, 'http://localhost').pathname;
}

module.exports = async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const pathname = url.pathname;

    if (pathname === '/api/health' && req.method === 'GET') {
      return sendJson(res, 200, { ok: true, ts: new Date().toISOString() });
    }

    if (pathname === '/api/login' && req.method === 'POST') {
      const { username, password } = await readJson(req);
      if (!username || !password) return sendJson(res, 400, { success: false, message: 'Username and password are required.' });
      const r = await query('SELECT * FROM users WHERE username = ? LIMIT 1', [username]);
      const user = r.rows?.[0];
      if (!user) return sendJson(res, 401, { success: false, message: 'Invalid username or password.' });
      const ok = await bcrypt.compare(password, user.password);
      if (!ok) return sendJson(res, 401, { success: false, message: 'Invalid username or password.' });
      return sendJson(res, 200, { success: true, role: user.role, name: user.name, username: user.username, id: Number(user.id) });
    }

    if (pathname === '/api/register' && req.method === 'POST') {
      const { username, password, name } = await readJson(req);
      if (!username || !password || !name) return sendJson(res, 400, { success: false, message: 'All fields (name, username, password) are required.' });
      const hash = await bcrypt.hash(password, 10);
      try {
        await query('INSERT INTO users (username, password, role, name) VALUES (?, ?, ?, ?)', [
          String(username).trim(),
          hash,
          'staff',
          String(name).trim(),
        ]);
      } catch (e) {
        const msg = String(e?.message || '').toLowerCase();
        if (msg.includes('unique')) return sendJson(res, 400, { success: false, message: 'Username already exists.' });
        throw e;
      }
      return sendJson(res, 200, { success: true, message: 'User registered successfully as Staff.' });
    }

    if (pathname === '/api/items' && req.method === 'GET') {
      const r = await query('SELECT * FROM items ORDER BY id DESC');
      return sendJson(res, 200, r.rows || []);
    }

    if (pathname === '/api/items' && req.method === 'POST') {
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

    if (pathname === '/api/items' && req.method === 'DELETE') {
      const all = String(url.searchParams.get('all') || '').toLowerCase() === 'true';
      const actor = url.searchParams.get('actor') || null;
      if (!all) return sendJson(res, 400, { success: false, message: 'Missing all=true' });
      const countR = await query('SELECT COUNT(*) as count FROM items');
      const deleted = Number(countR.rows?.[0]?.count || 0);
      await query('DELETE FROM items');
      if (actor) await query('INSERT INTO audit_logs (actor, action, details) VALUES (?, ?, ?)', [actor, 'ITEMS_DELETED_ALL', `Deleted all items (${deleted})`]);
      return sendJson(res, 200, { success: true, deleted });
    }

    if (pathname === '/api/items/bulk' && req.method === 'POST') {
      const { items, actor, mode } = await readJson(req);
      if (!Array.isArray(items) || items.length === 0) return sendJson(res, 400, { success: false, message: 'Items array is required.' });
      const normalizedMode = String(mode || 'upsert').toLowerCase();
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
        const found = await query('SELECT id FROM items WHERE name = ? AND category = ? LIMIT 1', [it.name, it.category]);
        const row = found.rows?.[0];
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
    }

    if (pathname.startsWith('/api/items/') && (req.method === 'PUT' || req.method === 'DELETE')) {
      const id = pathname.split('/').pop();
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

      const actor = url.searchParams.get('actor') || null;
      await query('DELETE FROM items WHERE id = ?', [id]);
      if (actor) await query('INSERT INTO audit_logs (actor, action, details) VALUES (?, ?, ?)', [actor, 'ITEM_DELETED', `Deleted item ID ${id}`]);
      return sendJson(res, 200, { success: true });
    }

    if (pathname === '/api/orders/next-id' && req.method === 'GET') {
      const r = await query("SELECT COALESCE(MAX(daily_id), 0) + 1 as nextDailyId FROM orders WHERE status = 'daily'");
      return sendJson(res, 200, { nextId: Number(r.rows?.[0]?.nextDailyId || 1) });
    }

    if (pathname === '/api/orders/stats' && req.method === 'GET') {
      const status = url.searchParams.get('status') || 'daily';
      const r = await query('SELECT COUNT(*) as total_orders FROM orders WHERE status = ?', [status]);
      return sendJson(res, 200, { total_orders: Number(r.rows?.[0]?.total_orders || 0) });
    }

    if (pathname === '/api/orders' && req.method === 'POST') {
      const { subtotal, total, items, cashier_name } = await readJson(req);
      if (!Array.isArray(items) || items.length === 0) return sendJson(res, 400, { success: false, message: 'Items are required.' });
      const nextDaily = await query("SELECT COALESCE(MAX(daily_id), 0) + 1 as nextDailyId FROM orders WHERE status = 'daily'");
      const dailyId = Number(nextDaily.rows?.[0]?.nextDailyId || 1);
      const created = await query('INSERT INTO orders (subtotal, total, cashier_name, status, daily_id) VALUES (?, ?, ?, ?, ?)', [
        Number(subtotal || 0),
        Number(total || 0),
        cashier_name || 'Unknown',
        'daily',
        dailyId,
      ]);
      const orderId = Number(created.lastInsertRowid);
      for (const it of items) {
        await query('INSERT INTO order_items (order_id, item_id, quantity, price_at_time) VALUES (?, ?, ?, ?)', [
          Number(orderId),
          Number(it.id),
          Number(it.quantity || 1),
          Number(it.price || 0),
        ]);
      }
      return sendJson(res, 200, { success: true, orderId: dailyId, globalId: orderId });
    }

    if (pathname === '/api/orders' && req.method === 'GET') {
      const status = url.searchParams.get('status') || 'daily';
      const ordersR = await query(
        `SELECT o.id, o.daily_id, o.timestamp, o.subtotal, o.total, o.cashier_name, o.status
         FROM orders o
         WHERE o.status = ?
         ORDER BY o.id DESC`,
        [status]
      );

      const out = [];
      for (const o of ordersR.rows || []) {
        const itemsR = await query(
          `SELECT oi.item_id as id, oi.quantity, oi.price_at_time as price, i.name
           FROM order_items oi
           LEFT JOIN items i ON i.id = oi.item_id
           WHERE oi.order_id = ?`,
          [o.id]
        );
        out.push({ ...o, items: itemsR.rows || [] });
      }
      return sendJson(res, 200, out);
    }

    if (pathname === '/api/users' && req.method === 'GET') {
      const r = await query('SELECT id, username, role, name FROM users ORDER BY id DESC');
      return sendJson(res, 200, r.rows || []);
    }

    if (pathname === '/api/users' && req.method === 'POST') {
      const { username, password, name, role } = await readJson(req);
      if (!username || !password || !name || !role) return sendJson(res, 400, { success: false, message: 'All fields are required.' });
      try {
        const hash = await bcrypt.hash(password, 10);
        await query('INSERT INTO users (username, password, role, name) VALUES (?, ?, ?, ?)', [username, hash, role, name]);
      } catch (e) {
        if (String(e?.message).toLowerCase().includes('unique')) return sendJson(res, 400, { success: false, message: 'Username already exists.' });
        throw e;
      }
      return sendJson(res, 200, { success: true });
    }

    if (pathname.startsWith('/api/users/') && pathname.endsWith('/reset-password') && req.method === 'POST') {
      const id = pathname.split('/')[3]; 
      const r = await query('SELECT role FROM users WHERE id = ?', [id]);
      const user = r.rows?.[0];
      if (!user) return sendJson(res, 404, { success: false, message: 'User not found.' });
      const defaultPassword = user.role === 'staff' ? 'staff123' : (user.role === 'admin' ? 'admin123' : 'super123');
      const hash = await bcrypt.hash(defaultPassword, 10);
      await query('UPDATE users SET password = ? WHERE id = ?', [hash, id]);
      return sendJson(res, 200, { success: true, message: `Password reset to ${defaultPassword}` });
    }

    if (pathname.startsWith('/api/users/') && req.method === 'PUT' && pathname !== '/api/users/update') {
      const id = pathname.split('/').pop();
      const { username, name, role } = await readJson(req);
      if (!username || !name || !role) return sendJson(res, 400, { success: false, message: 'Username, name, and role are required.' });
      try {
        await query('UPDATE users SET username = ?, name = ?, role = ? WHERE id = ?', [username, name, role, id]);
      } catch (e) {
        if (String(e?.message).toLowerCase().includes('unique')) return sendJson(res, 400, { success: false, message: 'Username already exists.' });
        throw e;
      }
      return sendJson(res, 200, { success: true });
    }

    if (pathname.startsWith('/api/users/') && req.method === 'DELETE') {
      const id = pathname.split('/').pop();
      await query('DELETE FROM users WHERE id = ?', [id]);
      return sendJson(res, 200, { success: true });
    }

    if (pathname === '/api/users/update' && req.method === 'PUT') {
      const { currentUsername, newName, newUsername, newPassword } = await readJson(req);
      if (!currentUsername || !newName || !newUsername) return sendJson(res, 400, { success: false, message: 'Missing required fields.' });
      const r = await query('SELECT id FROM users WHERE username = ? LIMIT 1', [currentUsername]);
      const row = r.rows?.[0];
      if (!row) return sendJson(res, 404, { success: false, message: 'User not found.' });

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
    }

    if (pathname === '/api/audit-logs' && req.method === 'GET') {
      const r = await query('SELECT id, timestamp, actor, action, details FROM audit_logs ORDER BY id DESC LIMIT 200');
      return sendJson(res, 200, r.rows || []);
    }
    if (pathname === '/api/audit-logs' && req.method === 'DELETE') {
      await query('DELETE FROM audit_logs');
      return sendJson(res, 200, { success: true });
    }

    if (pathname === '/api/analytics' && req.method === 'GET') {
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
    }

    return sendJson(res, 404, { success: false, message: `Not found: ${pathOf(req)}` });
  } catch (err) {
    console.error(err);
    return sendJson(res, err.statusCode || 500, { success: false, message: err.message || 'Server error.' });
  }
};

