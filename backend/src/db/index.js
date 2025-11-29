const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = process.env.DATABASE_URL || null;

let pool = null;
if (connectionString) {
  pool = new Pool({ connectionString });
}

async function query(text, params) {
  if (!pool) throw new Error('No Postgres pool available; set DATABASE_URL to use Postgres');
  const res = await pool.query(text, params);
  return res;
}

async function migrate() {
  if (!pool) throw new Error('No Postgres pool available; set DATABASE_URL to use Postgres');
  const sql = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'migrate.sql'), 'utf8');
  await pool.query(sql);
}

async function upsertProductFromJumpseller(product) {
  // If DATABASE_URL not set, fall back to sqlite implementation in ../../db.js
  if (!connectionString) {
    const legacy = require('../../db');
    if (legacy && typeof legacy.upsertProductFromJumpseller === 'function') {
      return legacy.upsertProductFromJumpseller(product);
    }
    throw new Error('No database available for upsert');
  }
  const externalId = product.id != null ? String(product.id) : null;
  const name = product.title || product.name || null;
  const price = Number.isInteger(product.price) ? product.price : Math.round((product.price || 0) * 100);
  const stock = product.stock != null ? Number(product.stock) : 0;
  const metadata = product.metadata || null;

  if (!externalId) {
    throw new Error('product missing id');
  }

  const sql = `INSERT INTO items (id, name, price, stock, metadata, updated_at)
               VALUES ($1,$2,$3,$4,$5,now())
               ON CONFLICT (id) DO UPDATE SET
                 name = EXCLUDED.name,
                 price = EXCLUDED.price,
                 stock = EXCLUDED.stock,
                 metadata = EXCLUDED.metadata,
                 updated_at = now()`;

  await pool.query(sql, [externalId, name, price, stock, metadata]);
  return { id: externalId };
}
async function upsertCart(cartData) {
  const { cart_id, user_id, items, total_price_cents, currency } = cartData;

  if (!pool) {
    throw new Error('Postgres pool not available');
  }

  // Use transaction for atomicity
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Upsert cart
    const cartSql = `
      INSERT INTO carts (id, user_id, total_price_cents, currency, updated_at)
      VALUES ($1, $2, $3, $4, now())
      ON CONFLICT (id) DO UPDATE SET
        user_id = EXCLUDED.user_id,
        total_price_cents = EXCLUDED.total_price_cents,
        currency = EXCLUDED.currency,
        updated_at = now()
      RETURNING id
    `;
    const cartResult = await client.query(cartSql, [
      cart_id,
      user_id,
      total_price_cents || 0,
      currency || 'EUR'
    ]);

    const finalCartId = cartResult.rows[0].id;

    // Delete existing items
    await client.query('DELETE FROM cart_items WHERE cart_id = $1', [finalCartId]);

    // Insert new items
    if (items && items.length > 0) {
      for (const item of items) {
        const itemSql = `
          INSERT INTO cart_items (id, cart_id, product_id, sku, name, unit_price_cents, quantity, metadata)
          VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7)
        `;
        await client.query(itemSql, [
          finalCartId,
          String(item.product_id),
          item.sku || null,
          item.name || null,
          item.unit_price_cents || 0,
          item.quantity || 1,
          item.metadata ? JSON.stringify(item.metadata) : null
        ]);
      }
    }

    await client.query('COMMIT');
    return { cart_id: finalCartId };

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function getCart(cart_id) {
  if (!pool) {
    throw new Error('Postgres pool not available');
  }

  // Get cart metadata
  const cartRes = await query(
    'SELECT id, user_id, total_price_cents, currency, updated_at FROM carts WHERE id = $1',
    [cart_id]
  );

  if (!cartRes.rows || cartRes.rows.length === 0) {
    return null;
  }

  const cart = cartRes.rows[0];

  // Get cart items
  const itemsRes = await query(
    `SELECT id, product_id, sku, name, unit_price_cents, quantity, metadata
     FROM cart_items WHERE cart_id = $1`,
    [cart_id]
  );

  return {
    cart_id: cart.id,
    user_id: cart.user_id,
    total_price_cents: cart.total_price_cents,
    currency: cart.currency,
    updated_at: cart.updated_at,
    items: itemsRes.rows.map(item => ({
      product_id: item.product_id,
      sku: item.sku,
      name: item.name,
      unit_price_cents: item.unit_price_cents,
      quantity: item.quantity,
      metadata: item.metadata
    }))
  };
}

module.exports = { pool, query, migrate, upsertProductFromJumpseller, upsertCart, getCart };

