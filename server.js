const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// Serve static files
app.use(express.static('./'));

// Default route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'pos_login.html'));
});

// Database initialization
let db;
function initDb() {
    db = new sqlite3.Database('./pos.db', (err) => {
        if (err) {
            console.error('Error opening database:', err.message);
        } else {
            console.log('Connected to the SQLite database.');
            initializeTables();
        }
    });
}

function initializeTables() {
    db.serialize(() => {
        // Users Table
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('staff', 'admin')),
            name TEXT NOT NULL
        )`);

        // Items Table
        db.run(`CREATE TABLE IF NOT EXISTS items (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            price REAL NOT NULL,
            price_half REAL,
            category TEXT NOT NULL,
            image TEXT
        )`);

        // Orders Table
        db.run(`CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            subtotal REAL NOT NULL,
            total REAL NOT NULL,
            cashier_name TEXT,
            status TEXT DEFAULT 'daily',
            daily_id INTEGER
        )`);

        // Order Items Table
        db.run(`CREATE TABLE IF NOT EXISTS order_items (
            order_id INTEGER,
            item_id INTEGER,
            quantity INTEGER,
            price_at_time REAL,
            FOREIGN KEY(order_id) REFERENCES orders(id),
            FOREIGN KEY(item_id) REFERENCES items(id)
        )`);

        // Audit Logs Table
        db.run(`CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            actor TEXT NOT NULL,
            action TEXT NOT NULL,
            details TEXT
        )`);

        // Seed initial users if table is empty
        db.get("SELECT COUNT(*) as count FROM users", async (err, row) => {
            if (err || row.count > 0) return;

            const saltRounds = 10;
            const defaultUsers = [
                { username: 'staff', password: 'staff123', role: 'staff', name: 'Ravi Kumar' },
                { username: 'admin', password: 'admin123', role: 'admin', name: 'Priya Sharma' }
            ];

            for (const user of defaultUsers) {
                const hash = await bcrypt.hash(user.password, saltRounds);
                db.run(
                    "INSERT INTO users (username, password, role, name) VALUES (?, ?, ?, ?)",
                    [user.username, hash, user.role, user.name]
                );
            }
            console.log('Seeded default users.');
        });

        // Seed initial items if table is empty
        db.get("SELECT COUNT(*) as count FROM items", (err, row) => {
            if (err || row.count > 0) return;

            const initialItems = [
                { id: 1, name: 'Clear Veg Soup',        price: 150,  category: 'soups' },
                { id: 2, name: 'Paneer 65',             price: 280,  category: 'veg-starters' },
                { id: 3, name: 'Chicken Majestic',      price: 350,  category: 'non-veg-starters' },
                { id: 4, name: 'Veg Fried Rice',        price: 220,  category: 'veg-fried-rice' },
                { id: 5, name: 'Chicken Biryani Full',  price: 380,  category: 'chicken-biryani' },
                { id: 6, name: 'Butter Naan',           price: 45,   category: 'breads' },
                { id: 7, name: 'Paneer Butter Masala',  price: 320,  category: 'veg-curries' },
                { id: 8, name: 'Chicken Curry',         price: 360,  category: 'non-veg-curries' }
            ];

            const stmt = db.prepare("INSERT INTO items (id, name, price, category, image) VALUES (?, ?, ?, ?, ?)");
            initialItems.forEach(item => stmt.run(item.id, item.name, item.price, item.category, ''));
            stmt.finalize();
            console.log('Seeded initial items.');
        });
    });
}

// ── Audit Log Helper ──
function logAudit(actor, action, details) {
    db.run(
        "INSERT INTO audit_logs (actor, action, details) VALUES (?, ?, ?)",
        [actor || 'system', action, details || null]
    );
}

// ──────────────────────────────────────────
// Auth Endpoints
// ──────────────────────────────────────────

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Username and password are required.' });
    }

    db.get("SELECT * FROM users WHERE username = ?", [username], async (err, user) => {
        if (err) return res.status(500).json({ success: false, message: 'Server error.' });
        if (!user) {
            logAudit(username, 'LOGIN_FAILED', `Failed login attempt for username: ${username}`);
            return res.status(401).json({ success: false, message: 'Invalid username or password.' });
        }

        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            logAudit(username, 'LOGIN_FAILED', `Wrong password for: ${username}`);
            return res.status(401).json({ success: false, message: 'Invalid username or password.' });
        }

        logAudit(username, 'LOGIN', `${user.role} logged in`);
        res.json({ success: true, role: user.role, name: user.name, username: user.username });
    });
});

app.post('/api/register', async (req, res) => {
    const { username, password, name } = req.body;
    
    if (!username || !password || !name) {
        return res.status(400).json({ success: false, message: 'All fields (name, username, password) are required.' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        db.run(`INSERT INTO users (username, password, role, name) VALUES (?, ?, ?, ?)`,
            [username, hashedPassword, 'staff', name],
            function(err) {
                if (err) {
                    if (err.message.includes('UNIQUE constraint failed')) {
                        return res.status(400).json({ success: false, message: 'Username already exists.' });
                    }
                    return res.status(500).json({ success: false, message: 'Error creating user.' });
                }
                res.json({ success: true, message: 'User registered successfully as Staff.' });
            }
        );
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error during registration.' });
    }
});

// ──────────────────────────────────────────
// Item Endpoints
// ──────────────────────────────────────────

app.get('/api/items', (req, res) => {
    db.all("SELECT * FROM items", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/items', (req, res) => {
    const { name, price, price_half, category, actor } = req.body;
    if (!name || !price || !category) {
        return res.status(400).json({ success: false, message: 'Name, price, and category are required.' });
    }
    db.run(`INSERT INTO items (name, price, price_half, category) VALUES (?, ?, ?, ?)`,
        [name, price, price_half || null, category],
        function(err) {
            if (err) return res.status(500).json({ success: false, message: err.message });
            logAudit(actor || 'admin', 'ITEM_ADDED', `Added item: ${name} (₹${price})`);
            res.json({ success: true, id: this.lastID });
        }
    );
});

app.post('/api/items/bulk', (req, res) => {
    const { items, actor, mode } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, message: 'Items array is required.' });
    }

    const normalizedMode = (mode || 'upsert').toLowerCase(); // upsert | insert_only
    if (!['upsert', 'insert_only'].includes(normalizedMode)) {
        return res.status(400).json({ success: false, message: 'Invalid mode.' });
    }

    const cleaned = items
        .map(it => ({
            name: String(it?.name || '').trim(),
            category: String(it?.category || '').trim(),
            price: Number(it?.price),
            price_half: it?.price_half === '' || it?.price_half == null ? null : Number(it?.price_half),
        }))
        .filter(it => it.name && it.category && Number.isFinite(it.price));

    if (cleaned.length === 0) {
        return res.status(400).json({ success: false, message: 'No valid items to import.' });
    }

    db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        let inserted = 0;
        let updated = 0;
        let skipped = 0;

        const finish = (err) => {
            if (err) {
                db.run('ROLLBACK', () => {
                    res.status(500).json({ success: false, message: err.message || 'Import failed.' });
                });
                return;
            }

            db.run('COMMIT', (commitErr) => {
                if (commitErr) return res.status(500).json({ success: false, message: commitErr.message });
                logAudit(actor || 'admin', 'ITEMS_IMPORTED', `Imported ${cleaned.length} items (inserted ${inserted}, updated ${updated}, skipped ${skipped})`);
                res.json({ success: true, inserted, updated, skipped, total: cleaned.length });
            });
        };

        let remaining = cleaned.length;
        const doneOne = (err) => {
            remaining -= 1;
            if (err) return finish(err);
            if (remaining === 0) finish(null);
        };

        cleaned.forEach((it) => {
            if (normalizedMode === 'insert_only') {
                db.run(
                    `INSERT INTO items (name, price, price_half, category) VALUES (?, ?, ?, ?)`,
                    [it.name, it.price, it.price_half, it.category],
                    function(err) {
                        if (!err) inserted += 1;
                        doneOne(err);
                    }
                );
                return;
            }

            db.get(
                `SELECT id FROM items WHERE name = ? AND category = ? LIMIT 1`,
                [it.name, it.category],
                (err, row) => {
                    if (err) return doneOne(err);
                    if (!row) {
                        db.run(
                            `INSERT INTO items (name, price, price_half, category) VALUES (?, ?, ?, ?)`,
                            [it.name, it.price, it.price_half, it.category],
                            function(insertErr) {
                                if (!insertErr) inserted += 1;
                                doneOne(insertErr);
                            }
                        );
                        return;
                    }

                    db.run(
                        `UPDATE items SET price = ?, price_half = ? WHERE id = ?`,
                        [it.price, it.price_half, row.id],
                        function(updateErr) {
                            if (!updateErr) updated += 1;
                            doneOne(updateErr);
                        }
                    );
                }
            );
        });
    });
});

app.put('/api/items/:id', (req, res) => {
    const { name, price, price_half, category, actor } = req.body;
    if (!name || !price || !category) {
        return res.status(400).json({ success: false, message: 'Name, price, and category are required.' });
    }
    db.run(`UPDATE items SET name = ?, price = ?, price_half = ?, category = ? WHERE id = ?`,
        [name, price, price_half || null, category, req.params.id],
        function(err) {
            if (err) return res.status(500).json({ success: false, message: err.message });
            if (this.changes === 0) return res.status(404).json({ success: false, message: 'Item not found.' });
            logAudit(actor || 'admin', 'ITEM_UPDATED', `Updated item ID ${req.params.id}: ${name}`);
            res.json({ success: true });
        }
    );
});

app.delete('/api/items/:id', (req, res) => {
    db.get("SELECT name FROM items WHERE id = ?", [req.params.id], (err, item) => {
        const itemName = item ? item.name : `ID ${req.params.id}`;
        db.run(`DELETE FROM items WHERE id = ?`, [req.params.id], function(err) {
            if (err) return res.status(500).json({ success: false, message: err.message });
            if (this.changes === 0) return res.status(404).json({ success: false, message: 'Item not found.' });
            logAudit(req.query.actor || 'admin', 'ITEM_DELETED', `Deleted item: ${itemName}`);
            res.json({ success: true });
        });
    });
});

app.delete('/api/items', (req, res) => {
    const all = String(req.query.all || '').toLowerCase() === 'true';
    if (!all) return res.status(400).json({ success: false, message: 'Missing all=true' });

    db.run('DELETE FROM items', [], function(err) {
        if (err) return res.status(500).json({ success: false, message: err.message });
        logAudit(req.query.actor || 'admin', 'ITEMS_DELETED_ALL', `Deleted all items (${this.changes || 0})`);
        res.json({ success: true, deleted: this.changes || 0 });
    });
});

// ──────────────────────────────────────────
// Order Endpoints
// ──────────────────────────────────────────

app.post('/api/orders', (req, res) => {
    const { subtotal, tax, total, items, cashier_name } = req.body;

    db.get("SELECT COALESCE(MAX(daily_id), 0) + 1 as nextDailyId FROM orders WHERE status = 'daily'", [], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        
        const dailyId = row.nextDailyId;

        db.run(`INSERT INTO orders (subtotal, total, cashier_name, daily_id) VALUES (?, ?, ?, ?)`,
            [subtotal, total, cashier_name || 'Unknown', dailyId],
            function(err) {
                if (err) return res.status(500).json({ error: err.message });

                const orderId = this.lastID;
                const stmt = db.prepare(`INSERT INTO order_items (order_id, item_id, quantity, price_at_time) VALUES (?, ?, ?, ?)`);
                items.forEach(item => stmt.run(orderId, item.id, item.quantity, item.price));
                stmt.finalize();

                res.json({ success: true, orderId: dailyId, globalId: orderId });
            }
        );
    });
});

app.get('/api/orders', (req, res) => {
    const status = req.query.status || 'daily';
    const role = req.query.role || 'admin';
    
    let query = `
        SELECT o.id, o.daily_id, o.timestamp, o.subtotal, o.total, o.cashier_name, o.status,
               GROUP_CONCAT(i.name || ' x' || oi.quantity, ', ') AS items_summary
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.order_id
        LEFT JOIN items i ON oi.item_id = i.id
        WHERE o.status = ?
    `;
    
    if (role === 'admin') {
        query += " AND o.is_deleted_by_admin = 0 ";
    }
    
    query += `
        GROUP BY o.id
        ORDER BY o.timestamp DESC
    `;

    db.all(query, [status], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/orders/stats', (req, res) => {
    const status = req.query.status || 'daily';
    const role = req.query.role || 'admin';
    
    let query = `
        SELECT 
            COUNT(*) as total_orders,
            CAST(COALESCE(SUM(total), 0) AS REAL) as total_revenue,
            CAST(COALESCE(AVG(total), 0) AS REAL) as avg_order_value
        FROM orders
    `;
    let params = [];
    let whereClauses = [];

    if (status !== 'all') {
        whereClauses.push("status = ?");
        params.push(status);
    }
    if (role === 'admin') {
        whereClauses.push("is_deleted_by_admin = 0");
    }

    if (whereClauses.length > 0) {
        query += " WHERE " + whereClauses.join(" AND ");
    }
    
    db.get(query, params, (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row);
    });
});

app.get('/api/orders/next-id', (req, res) => {
    db.get("SELECT COALESCE(MAX(daily_id), 0) + 1 as nextId FROM orders WHERE status = 'daily'", [], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ nextId: row.nextId });
    });
});

app.get('/api/orders/:id', (req, res) => {
    const orderId = req.params.id;
    const role = req.query.role || 'admin';
    
    let query = "SELECT * FROM orders WHERE id = ?";
    if (role === 'admin') {
        query += " AND is_deleted_by_admin = 0";
    }

    db.get(query, [orderId], (err, order) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!order) return res.status(404).json({ error: "Order not found" });

        db.all(`
            SELECT oi.*, i.name 
            FROM order_items oi 
            JOIN items i ON oi.item_id = i.id 
            WHERE oi.order_id = ?
        `, [orderId], (err, items) => {
            if (err) return res.status(500).json({ error: err.message });
            order.items = items;
            res.json(order);
        });
    });
});

app.delete('/api/orders/all', (req, res) => {
    const status = req.query.status;
    const actor = req.query.actor || 'admin';

    db.serialize(() => {
        // Hard delete everything for admin
        if (status) {
            db.run("DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE status = ?)", [status]);
            db.run("DELETE FROM orders WHERE status = ?", [status], function(err) {
                if (err) return res.status(500).json({ success: false, error: err.message });
                logAudit(actor, 'HISTORY_CLEARED_PERMANENTLY', `Admin cleared ${status} history`);
                res.json({ success: true, message: `${status} history permanently cleared.` });
            });
        } else {
            db.run("DELETE FROM order_items");
            db.run("DELETE FROM orders", [], function(err) {
                if (err) return res.status(500).json({ success: false, error: err.message });
                logAudit(actor, 'HISTORY_CLEARED_PERMANENTLY', 'Admin cleared all history');
                res.json({ success: true, message: "All history permanently cleared." });
            });
        }
    });
});

app.delete('/api/orders/:id', (req, res) => {
    const orderId = req.params.id;
    const actor = req.query.actor || 'admin';
    
    db.get("SELECT daily_id, status FROM orders WHERE id = ?", [orderId], (err, row) => {
        if (!row) return res.status(404).json({ success: false, error: "Order not found" });
        
        const { daily_id: deletedId } = row;

        // Hard delete for admin
        db.serialize(() => {
            db.run("DELETE FROM order_items WHERE order_id = ?", [orderId]);
            db.run("DELETE FROM orders WHERE id = ?", [orderId], function(err) {
                if (err) return res.status(500).json({ success: false, error: err.message });
                logAudit(actor, 'ORDER_DELETED_PERMANENTLY', `Admin deleted order #${deletedId}`);
                res.json({ success: true, message: "Order permanently deleted." });
            });
        });
    });
});
app.post('/api/orders/zread/daily', (req, res) => {
    db.run("UPDATE orders SET status = 'monthly' WHERE status = 'daily'", [], function(err) {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, message: `Daily Z-Read completed. Moved ${this.changes} orders to monthly.` });
    });
});

app.post('/api/orders/zread/monthly', (req, res) => {
    db.run("UPDATE orders SET status = 'archived' WHERE status = 'monthly'", [], function(err) {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, message: `Monthly Z-Read completed. Archived ${this.changes} orders.` });
    });
});

// ──────────────────────────────────────────
// User Management Endpoints (Super Admin only)
// ──────────────────────────────────────────

app.get('/api/users', (req, res) => {
    db.all("SELECT id, username, name, role FROM users", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/users', async (req, res) => {
    const { username, password, name, role } = req.body;
    if (!username || !password || !name || !role) {
        return res.status(400).json({ success: false, message: 'All fields are required.' });
    }
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        db.run(`INSERT INTO users (username, password, role, name) VALUES (?, ?, ?, ?)`,
            [username, hashedPassword, role, name],
            function(err) {
                if (err) {
                    if (err.message.includes('UNIQUE constraint failed')) {
                        return res.status(400).json({ success: false, message: 'Username already exists.' });
                    }
                    return res.status(500).json({ success: false, message: err.message });
                }
                res.json({ success: true, id: this.lastID });
            }
        );
});

// Settings Update Endpoint
app.put('/api/users/update', async (req, res) => {
    const { currentUsername, newUsername, newPassword, newName } = req.body;
    
    if (!currentUsername) {
        return res.status(400).json({ success: false, message: 'Current username is required.' });
    }

    try {
        let query = "UPDATE users SET username = ? ";
        let params = [newUsername || currentUsername];

        if (newName) {
            query += ", name = ? ";
            params.push(newName);
        }

        if (newPassword) {
            const hash = await bcrypt.hash(newPassword, 10);
            query += ", password = ? ";
            params.push(hash);
        }

        query += "WHERE username = ?";
        params.push(currentUsername);

        db.run(query, params, function(err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                    return res.status(400).json({ success: false, message: 'Username already taken.' });
                }
                return res.status(500).json({ success: false, message: 'Update failed.' });
            }
            res.json({ success: true, message: 'Profile updated successfully.' });
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});


app.put('/api/users/:id', (req, res) => {
    const { username, name, role } = req.body;
    if (!username || !name || !role) {
        return res.status(400).json({ success: false, message: 'Username, name, and role are required.' });
    }
    db.run(`UPDATE users SET username = ?, name = ?, role = ? WHERE id = ?`,
        [username, name, role, req.params.id],
        function(err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                    return res.status(400).json({ success: false, message: 'Username already exists.' });
                }
                return res.status(500).json({ success: false, message: err.message });
            }
            if (this.changes === 0) return res.status(404).json({ success: false, message: 'User not found.' });
            res.json({ success: true });
        }
    );
});

app.delete('/api/users/:id', (req, res) => {
    db.run(`DELETE FROM users WHERE id = ?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ success: false, message: err.message });
        if (this.changes === 0) return res.status(404).json({ success: false, message: 'User not found.' });
        res.json({ success: true });
    });
});

app.post('/api/users/:id/reset-password', async (req, res) => {
    db.get("SELECT role FROM users WHERE id = ?", [req.params.id], async (err, user) => {
        if (err) return res.status(500).json({ success: false, message: 'Server error' });
        if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

        const defaultPassword = user.role === 'staff' ? 'staff123' : (user.role === 'admin' ? 'admin123' : 'super123');
        try {
            const hash = await bcrypt.hash(defaultPassword, 10);
            db.run("UPDATE users SET password = ? WHERE id = ?", [hash, req.params.id], function(updateErr) {
                if (updateErr) return res.status(500).json({ success: false, message: updateErr.message });
                res.json({ success: true, message: `Password reset to ${defaultPassword}` });
            });
        } catch (hashErr) {
            res.status(500).json({ success: false, message: 'Error resetting password' });
        }
    });
});

});
// ──────────────────────────────────────────
// Analytics Endpoint
// ──────────────────────────────────────────

app.get('/api/analytics', (req, res) => {
    const results = {};
    const role = req.query.role || 'admin';
    const whereAdmin = role === 'admin' ? ' WHERE is_deleted_by_admin = 0 ' : ' ';
    const whereAdminJoin = role === 'admin' ? ' WHERE o.is_deleted_by_admin = 0 ' : ' ';

    db.get(`SELECT COUNT(*) as totalOrders, COALESCE(SUM(total),0) as totalRevenue, COALESCE(AVG(total),0) as avgOrder FROM orders ${whereAdmin}`, [], (err, summary) => {
        if (err) return res.status(500).json({ error: err.message });
        results.summary = summary;

        db.all(`
            SELECT i.name, i.category, SUM(oi.quantity) as totalQty, SUM(oi.quantity * oi.price_at_time) as totalRevenue
            FROM order_items oi
            JOIN items i ON oi.item_id = i.id
            JOIN orders o ON oi.order_id = o.id
            ${whereAdminJoin}
            GROUP BY oi.item_id
            ORDER BY totalQty DESC
            LIMIT 10
        `, [], (err, topItems) => {
            if (err) return res.status(500).json({ error: err.message });
            results.topItems = topItems;

            db.all(`
                SELECT i.category, SUM(oi.quantity) as totalQty, SUM(oi.quantity * oi.price_at_time) as totalRevenue
                FROM order_items oi
                JOIN items i ON oi.item_id = i.id
                JOIN orders o ON oi.order_id = o.id
                ${whereAdminJoin}
                GROUP BY i.category
                ORDER BY totalRevenue DESC
            `, [], (err, byCategory) => {
                if (err) return res.status(500).json({ error: err.message });
                results.byCategory = byCategory;

                db.all(`
                    SELECT DATE(timestamp) as date, COUNT(*) as orders, SUM(total) as revenue
                    FROM orders
                    ${whereAdmin}
                    GROUP BY DATE(timestamp)
                    ORDER BY date DESC
                    LIMIT 30
                `, [], (err, daily) => {
                    if (err) return res.status(500).json({ error: err.message });
                    results.daily = daily;
                    res.json(results);
                });
            });
        });
    });
});

// ──────────────────────────────────────────
// Audit Log Endpoints
// ──────────────────────────────────────────

app.get('/api/audit-logs', (req, res) => {
    const limit = parseInt(req.query.limit) || 200;
    db.all(
        "SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ?",
        [limit],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        }
    );
});

app.delete('/api/audit-logs', (req, res) => {
    db.run("DELETE FROM audit_logs", [], function(err) {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, message: 'Audit logs cleared.' });
    });
});

// ──────────────────────────────────────────
// Backup & Restore Endpoints
// ──────────────────────────────────────────

app.get('/api/backup', (req, res) => {
    const dbPath = path.join(__dirname, 'pos.db');
    if (fs.existsSync(dbPath)) {
        res.download(dbPath, `pos_backup_${new Date().toISOString().split('T')[0]}.db`);
    } else {
        res.status(404).json({ error: "Database file not found." });
    }
});

app.post('/api/restore', upload.single('database'), (req, res) => {
    const role = req.query.role;
    if (role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const tempPath = req.file.path;
    const targetPath = path.join(__dirname, 'pos.db');

    // Close current DB connection
    db.close((err) => {
        if (err) {
            console.error('Error closing DB for restore:', err.message);
            return res.status(500).json({ success: false, message: 'Could not close database' });
        }

        // Replace DB file
        fs.copyFile(tempPath, targetPath, (copyErr) => {
            // Re-open DB regardless of success to keep server alive
            initDb();
            
            // Delete temp file
            fs.unlink(tempPath, () => {});

            if (copyErr) {
                console.error('Error copying DB file:', copyErr.message);
                return res.status(500).json({ success: false, message: 'Restore failed' });
            }

            logAudit(req.query.actor || 'admin', 'DB_RESTORED', 'Database restored from backup');
            res.json({ success: true, message: 'Database restored successfully. The server is reconnecting...' });
        });
    });
});

initDb();

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
