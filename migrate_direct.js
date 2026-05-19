const sqlite3 = require('sqlite3');
const { createClient } = require('@libsql/client');

const localDb = new sqlite3.Database('/Users/saichandan/Downloads/POS-main/pos.db');

const turso = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

localDb.all("SELECT name, price, price_half, category FROM items", async (err, rows) => {
    if (err) throw err;
    console.log(`Exporting ${rows.length} items to Turso directly...`);
    
    let inserted = 0;
    for (const row of rows) {
        await turso.execute({
            sql: 'INSERT INTO items (name, price, price_half, category, image) VALUES (?, ?, ?, ?, ?)',
            args: [row.name, row.price, row.price_half, row.category, '']
        });
        inserted++;
    }
    console.log(`Successfully migrated ${inserted} items to Vercel/Turso!`);
});
