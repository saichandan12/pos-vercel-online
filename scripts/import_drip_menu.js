const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = path.join(__dirname, '..', 'pos.db');

const MENU_TEXT = `
# DRIP KITCHEN — COMPLETE PREMIUM MENU LAYOUT

## 🍗 NON-VEG

---

# Crispy Tenders

4 pcs — ₹149
6 pcs — ₹199
8 pcs — ₹249

🌶 Drip Sauce Tossed +₹30

---

# Wings 🔥

4 pcs — ₹149
6 pcs — ₹179
8 pcs — ₹219

🌶 Drip Sauce Tossed +₹30

---

# Fried Chicken Bucket

2 pcs — ₹119
4 pcs — ₹219
6 pcs — ₹319
8 pcs — ₹449

🌶 Drip Sauce Tossed +₹30

---

# 🌯 WRAPS

## Non-Veg Wraps

Loaded Chicken Wrap — ₹199
Double Chicken Wrap — ₹249

### EXTRAS

🧀 Extra Cheese +₹30

---

# 🌮 TACOS

## Non-Veg Tacos

Naked Chicken Taco (2 pcs) — ₹199
Naked Chicken Paneer Taco (2 pcs) — ₹199

---

# 🍔 BURGERS

Mini Burger — ₹169
Smash Cheese Burger — ₹189
Steak Chicken Burger — ₹189
Cluck Burger ⭐ — ₹189
Korean Honey Burger — ₹189
Double Cheese Burger — ₹209
Double Smash Burger — ₹249

### EXTRAS

🍗 Extra Patty +₹99
🧀 Extra Cheese +₹30

---

### Signature Burger Description

> Seared crispy edges, juicy centers, layered with JD’s sauces & melted cheese.

---

# 🍟 NON-VEG FRIES

Chicken Loaded Fries — ₹149
Chicken Cheese Fries — ₹169
Chicken Paneer Fries — ₹179

🌶 Drip Sauce Tossed +₹30

---

# 🥬 VEG

---

# Veg Burgers

Veg Patty Burger — ₹139
Mushroom Delight Burger — ₹159
Paneer Burger — ₹179

### EXTRA

🍔 Extra Patty +₹50

---

# Veg Wraps

Mushroom Wrap — ₹119
Paneer Wrap — ₹139

---

# Veg Tacos

Veg Taco (2 pcs) — ₹129
Paneer Taco (2 pcs) — ₹149

---

# 🍟 VEG FRIES

Normal Fries — ₹99
Peri Peri Fries — ₹109
Paneer Loaded Fries — ₹149
Cheese Loaded Fries — ₹169

🌶 Drip Sauce Tossed +₹30

---

# 🥫 SIGNATURE SAUCES

Garlic Mayo
Honey Mustard
Korean Honey
Cajun Mayo
Cheese Sauce 🔥

---

# 🍹 MOCKTAILS

Blue Lagoon — ₹119
Mint Mojito — ₹119
Watermelon Cooler — ₹119

---

# 🥤 MILKSHAKES

Oreo Milkshake — ₹149
KitKat Milkshake — ₹159
Nutella Milkshake — ₹169
Biscoff Milkshake — ₹179

---

# 🍰 DESSERTS

Cheesecake — ₹109
Churro Bowl — ₹169
Brownie Bowl — ₹189
Death by Chocolate (DBC) — ₹229
Matilda Cup — ₹169

---

# 🎉 COMBO DEALS

## Combo 1 — ₹329

🍔 Cluck Burger
🍟 Fries
🥤 Mocktail

---

## Combo 2 (Best Value) — ₹349

🍗 4 Wings
🍟 Loaded Fries
🥤 Mocktail

---

## Combo 3 — ₹379

🌮 2 Naked Chicken Tacos
🍟 Fries
🥤 Mocktail
`.trim();

function slugForMenuHeading(heading) {
  const h = String(heading || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const map = new Map([
    ['crispy tenders', 'tenders'],
    ['wings', 'wings'],
    ['fried chicken bucket', 'buckets'],
    ['non veg wraps', 'wraps-nonveg'],
    ['veg wraps', 'wraps-veg'],
    ['non veg tacos', 'tacos-nonveg'],
    ['veg tacos', 'tacos-veg'],
    ['burgers', 'burgers-nonveg'],
    ['veg burgers', 'burgers-veg'],
    ['non veg fries', 'fries-nonveg'],
    ['veg fries', 'fries-veg'],
    ['signature sauces', 'sauces'],
    ['mocktails', 'mocktails'],
    ['milkshakes', 'milkshakes'],
    ['desserts', 'desserts'],
    ['combo deals', 'combos'],
    ['extras', 'extras'],
    ['extra', 'extras'],
  ]);
  return map.get(h) || null;
}

function parseMenuTextToItems(rawText, defaultCategory) {
  const lines = String(rawText || '').split(/\r?\n/);
  const out = [];

  let currentCategory = defaultCategory;
  let currentGroupName = null;
  let inExtras = false;
  let combo = null; // { name, price, parts: [] }

  const pushComboIfAny = () => {
    if (!combo) return;
    const details = combo.parts.length ? ` (${combo.parts.join(' + ')})` : '';
    out.push({ name: `${combo.name}${details}`, price: combo.price, price_half: null, category: 'combos' });
    combo = null;
  };

  for (const rawLine of lines) {
    const line = String(rawLine || '').trim();
    if (!line) continue;

    if (/^---+$/.test(line)) {
      inExtras = false;
      pushComboIfAny();
      continue;
    }

    if (/^#{1,6}\s+/.test(line)) {
      const heading = line.replace(/^#{1,6}\s+/, '').trim();
      pushComboIfAny();

      if (/\bextras?\b/i.test(heading)) {
        inExtras = true;
        currentCategory = 'extras';
        currentGroupName = heading;
        continue;
      }

      inExtras = false;

      if (/^combo\s*\d+/i.test(heading)) {
        const nums = heading.replace(/[₹]/g, ' ').match(/(\d+(?:\.\d{1,2})?)/g) || [];
        const price = nums.length ? Number(nums[nums.length - 1]) : null;
        combo = { name: heading.replace(/—.*$/, '').trim(), price: Number.isFinite(price) ? price : 0, parts: [] };
        currentCategory = 'combos';
        currentGroupName = combo.name;
        continue;
      }

      const slug = slugForMenuHeading(heading);
      if (slug) currentCategory = slug;
      currentGroupName = heading;
      continue;
    }

    if (combo) {
      if (!/^>/.test(line) && !/^warning:/i.test(line) && !/^you name it/i.test(line)) {
        const part = line.replace(/^[^a-zA-Z0-9]+/, '').trim();
        if (part) combo.parts.push(part);
      }
      continue;
    }

    // Ignore taglines / descriptions that have no price
    if (/^>/.test(line)) continue;

    const cleaned = line.replace(/[₹]/g, ' ').replace(/\s{2,}/g, ' ').trim();

    // Add-ons like "+₹30"
    if (/\+\s*\d/.test(line)) {
      const m = cleaned.match(/^(.*?)(?:\s+)?\+?\s*(\d+(?:\.\d{1,2})?)\s*$/);
      if (m) {
        const addonName = m[1].replace(/^[^a-zA-Z0-9]+/, '').replace(/\+$/, '').trim();
        const addonPrice = Number(m[2]);
        if (addonName && Number.isFinite(addonPrice) && addonPrice > 0) {
          out.push({ name: addonName, price: addonPrice, price_half: null, category: 'extras' });
        }
      }
      continue;
    }

    const nums = cleaned.match(/(\d+(?:\.\d{1,2})?)/g) || [];
    if (nums.length === 0) continue;

    const priceFull = Number(nums[nums.length - 1]);
    if (!Number.isFinite(priceFull) || priceFull <= 0) continue;

    const namePart = cleaned.replace(/(\d+(?:\.\d{1,2})?)/g, '').replace(/\s{2,}/g, ' ').trim();
    let name = namePart.length >= 2 ? namePart : cleaned;

    const looksLikeVariant = /\bpcs\b/i.test(cleaned) || /\bpc\b/i.test(cleaned);
    const qty = nums.length >= 2 ? Number(nums[0]) : null;
    const canUseQty = Number.isFinite(qty) && qty > 0 && qty <= 50;
    if (currentGroupName && looksLikeVariant && canUseQty && nums.length === 2) {
      name = `${currentGroupName} (${qty} pcs)`;
    }

    let priceHalf = null;
    if (nums.length >= 2 && !looksLikeVariant) {
      const maybeHalf = Number(nums[nums.length - 2]);
      if (Number.isFinite(maybeHalf) && maybeHalf > 0 && maybeHalf < priceFull) priceHalf = maybeHalf;
    }

    const finalCategory = inExtras ? 'extras' : (currentCategory || defaultCategory);
    out.push({ name, price: priceFull, price_half: priceHalf, category: finalCategory });
  }

  pushComboIfAny();

  // De-dup by (name, category)
  const seen = new Map();
  for (const row of out) seen.set(`${row.category}::${row.name}`.toLowerCase(), row);
  return Array.from(seen.values());
}

function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`Database not found at: ${DB_PATH}`);
    process.exit(1);
  }

  const items = parseMenuTextToItems(MENU_TEXT, 'specials');
  if (!items.length) {
    console.error('Parsed 0 items. Aborting.');
    process.exit(1);
  }

  const db = new sqlite3.Database(DB_PATH);

  db.serialize(() => {
    db.run('BEGIN TRANSACTION');

    let inserted = 0;
    let updated = 0;

    const done = (err) => {
      if (err) {
        db.run('ROLLBACK', () => {
          console.error(err.message || err);
          db.close(() => process.exit(1));
        });
        return;
      }
      db.run('COMMIT', () => {
        console.log(`Imported ${items.length} items (inserted ${inserted}, updated ${updated}).`);
        db.close();
      });
    };

    let remaining = items.length;
    const doneOne = (err) => {
      remaining -= 1;
      if (err) return done(err);
      if (remaining === 0) done(null);
    };

    items.forEach((it) => {
      db.get(
        'SELECT id FROM items WHERE name = ? AND category = ? LIMIT 1',
        [it.name, it.category],
        (err, row) => {
          if (err) return doneOne(err);
          if (!row) {
            db.run(
              'INSERT INTO items (name, price, price_half, category, image) VALUES (?, ?, ?, ?, ?)',
              [it.name, it.price, it.price_half, it.category, ''],
              function (e2) {
                if (!e2) inserted += 1;
                doneOne(e2);
              }
            );
            return;
          }
          db.run(
            'UPDATE items SET price = ?, price_half = ? WHERE id = ?',
            [it.price, it.price_half, row.id],
            function (e3) {
              if (!e3) updated += 1;
              doneOne(e3);
            }
          );
        }
      );
    });
  });
}

main();
