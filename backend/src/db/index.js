require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const {Connector} = require('@google-cloud/cloud-sql-connector');

// Create PostgreSQL connection pool
async function getPoolFromEnv() {
  const totalTries = 5;
  let tries = totalTries;
  let pool;
  while (tries > 0) {
    try {
      if (process.env.DB_ENV === 'local') {
        console.log('[db] Initializing Local Pool...');
        pool = new Pool({
          connectionString: process.env.DATABASE_URL_LOCAL,
          connectionTimeoutMillis: 5000,
        });
        console.log('[db] Local Pool Instanciated');
      } else {
        console.log('[db] Initializing Cloud Pool...');
        const connector = new Connector();
        const clientOpts = await connector.getOptions({
          instanceConnectionName: process.env.DATABASE_URL_CLOUD,
          authType: 'IAM'
        });
        console.log('[db] Cloud Pool: Got Connector');
        
        pool = new Pool({
          ...clientOpts,
          user: 'postgres',
          password: 'postgres'
        });
        console.log('[db] Cloud Pool Instanciated');
      }
      
      pool.on('connect', () => {
        console.log('[db] Connected to PostgreSQL');
      });

      pool.on('error', (err) => {
        console.error('[db] Unexpected error on idle client', err);
        process.exit(-1);
      });
      break;
    } catch (error) {
      if (tries-- === 0) {
        console.error(`[db] Couldn't connect to database after ${totalTries}, giving up:`, error) ;
        throw error;
      }
      console.error(`[db] Couldn't connect to database on try nº${totalTries - tries}:`,  error) ;
      // Sleep 3 seconds and try again
      await new Promise(r => setTimeout(r, 3000));
      console.warn(`[db] Trying to connect to database again...`)
    }
  }

  return pool;
}


// Initialize database when server starts
const poolPromise = initDb()
  .catch(err => {
    console.error("[db] Failed to initialize DB:", err);
    process.exit(1);
  });

/**
 * Query wrapper for easier use
 */
async function query(text, params) {
  const pool = await poolPromise;
  return await pool.query(text, params);
}

/**
 * Initialize Database
 */
async function initDb() {
  console.log('[db] Running initialization...');
  const pool = await getPoolFromEnv();

  const createDbPath = path.join(__dirname, '../scripts/create.sql');
  const sql = fs.readFileSync(createDbPath, 'utf8');

  try {
    await pool.query(sql);
    console.log('[db] Initialization completed successfully');
    return pool;
  } catch (error) {
    console.error('[db] Initialization failed:', error);
    throw error;
  }
}

/**
 * Run database migrations
 */
async function migrate() {
  const pool = await poolPromise;
  console.log('[db] Running migrations...');

  const migrationPath = path.join(__dirname, '../scripts/create.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  try {
    await pool.query(sql);
    console.log('[db] Migrations completed successfully');
  } catch (error) {
    console.error('[db] Migration failed:', error);
    throw error;
  }
}

async function __upsertCartItem(queryCaller, userId, itemData, addQuantity=false) {
  await queryCaller.query(
    `INSERT INTO CartItem (userId, itemId, name, quantity, priceCents, sku, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (userId, itemId)
      DO UPDATE SET
        name = COALESCE(EXCLUDED.name, CartItem.name),` +
      ( addQuantity
      ? `quantity = CartItem.quantity + COALESCE(EXCLUDED.quantity, 1),`
      : `quantity = COALESCE(EXCLUDED.quantity, CartItem.quantity),`) +
      ` priceCents = COALESCE(EXCLUDED.priceCents, CartItem.priceCents),
        sku = COALESCE(EXCLUDED.sku, CartItem.sku),
        metadata = COALESCE(EXCLUDED.metadata, CartItem.metadata)`,
    [
      userId,
      itemData.itemId,
      itemData.name || null,
      itemData.quantity,
      itemData.priceCents || 0,
      itemData.sku || null,
      itemData.metadata ? JSON.stringify(itemData.metadata) : null
    ]
  );
}

async function upsertCartItem(userId, itemData, addQuantity=false) {
  const pool = await poolPromise;
  try {
    await __upsertCartItem(pool, userId, itemData, addQuantity)
  } catch (error) {
    console.error('[db] Error upserting cart item:', error);
    throw error;
  } 
}

/**
 * Upsert a cart (create or update)
 * @param {Object} cartData - Cart data
 * @param {string} cartData.userId - User ID
 * @param {Array} cartData.items - Array of cart items
 * @param {number} cartData.totalPriceCents - Total price in cents
 * @param {string} cartData.currency - Currency code (default: EUR)
 * @returns {Promise<string>} - Returns the cartId
 */
async function upsertCart(cartData) {
  const pool = await poolPromise;
  const { userId, items, currency = 'EUR' } = cartData;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Upsert cart metadata
    await client.query(
      `INSERT INTO Cart (userId, currency, updatedAt)
       VALUES ($1, $2, NOW())
       ON CONFLICT (userId) 
       DO UPDATE SET 
         currency = EXCLUDED.currency,
         updatedAt = NOW()`,
      [userId, currency]
    );

    // Delete existing cart items
    await client.query('DELETE FROM CartItem WHERE userId = $1', [userId]);
    
    for (const item of items) {
      await __upsertCartItem(client, userId, item);
    }

    await client.query('COMMIT');
    console.log(`[db] Cart upserted: ${userId}`);
    return userId;

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[db] Error upserting cart:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get a cart by ID
 * @param {string} userId - Cart userId
 * @returns {Promise<Object|null>} - Cart object with items, or null if not found
 */
async function getCart(userId) {
  const pool = await poolPromise;
  try {
    // Get cart metadata
    const cartResult = await pool.query(
      'SELECT userId, totalPriceCents, currency, updatedAt FROM Cart WHERE userId = $1',
      [userId]
    );

    if (cartResult.rows.length === 0) {
      return null;
    }

    const cart = cartResult.rows[0];

    // Get cart items
    const itemsResult = await pool.query(
      'SELECT itemId, sku, name, priceCents, quantity, metadata FROM CartItem WHERE userId = $1 ORDER BY createdAt, itemId',
      [userId]
    );

    return {
      userId: cart.userid,
      totalPriceCents: cart.totalpricecents,
      currency: cart.currency,
      updatedAt: cart.updatedat,
      items: itemsResult.rows.map(item => ({
        itemId: item.itemid,
        sku: item.sku,
        name: item.name,
        priceCents: item.pricecents,
        quantity: item.quantity,
        metadata: item.metadata
      }))
    };

  } catch (error) {
    console.error('[db] Error getting cart:', error);
    throw error;
  }
}

async function createCartIfNotExists(userId) {
  const pool = await poolPromise;
  try {
    const cartResult = await pool.query('SELECT 1 FROM Cart WHERE userId = $1', [userId]);
    if (cartResult.rows.length === 0) {
      // Create if it doesn't exist
      await upsertCart({
        userId,
        items: [],
      });
    }
  } catch (error) {
    console.error('[db] Error creating cart:', error);
    throw error;
  }
}

module.exports = {
  query,
  initDb,
  migrate,
  upsertCart,
  upsertCartItem,
  getCart,
  createCartIfNotExists
};
