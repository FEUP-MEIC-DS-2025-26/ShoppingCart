const assert = require('assert');
const request = require('supertest');

// This integration test exercises cart endpoints against Postgres.
// It will be skipped when DATABASE_URL is not provided (local dev without Postgres).

describe('Cart integration (Postgres)', function () {
  this.timeout(10000);

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.log('Skipping cart integration tests because DATABASE_URL is not set');
    return;
  }

  let app;
  let pgdb;

  before(async () => {
    // require DB and apply migrations
    pgdb = require('../src/db');
    if (!pgdb.pool) throw new Error('Postgres pool not initialized; ensure DATABASE_URL is set');
    await pgdb.migrate();

    // stub product service to avoid external network calls
    const productService = require('../productService');
    productService.getProducts = async () => {
      return [
        { id: 'prod-1', name: 'Integration Product', price: 2000, stock: 10, sku: 'SKU1' }
      ];
    };

    app = require('../index');
  });

  after(async () => {
    // cleanup test data
    try {
      await pgdb.query('DELETE FROM cart_items');
      await pgdb.query('DELETE FROM carts');
    } catch (e) {
      // ignore
    }
    if (pgdb.pool) await pgdb.pool.end();
  });

  it('adds an item, returns cart summary, and checks out', async () => {
    // Add item to cart
    await request(app)
      .post('/api/cart')
      .send({ itemId: 'prod-1', quantity: 2 })
      .expect(200)
      .expect(res => {
        if (!res.body || !res.body.success) throw new Error('expected success true');
      });

    // Get cart
    const getRes = await request(app)
      .get('/api/cart')
      .expect(200);

    assert.ok(getRes.body.items && getRes.body.items.length === 1, 'expected 1 cart item');
    const item = getRes.body.items[0];
    assert.strictEqual(item.id, 'prod-1');
    assert.strictEqual(item.quantity, 2);
    assert.strictEqual(getRes.body.subtotal, 4000);

    // Checkout
    await request(app)
      .post('/api/cart/checkout')
      .send({ address: { line1: '1 Test St' } })
      .expect(200)
      .expect(res => {
        if (!res.body || !res.body.success) throw new Error('expected checkout success');
      });

    // Cart should be empty
    const after = await request(app).get('/api/cart').expect(200);
    assert.ok(Array.isArray(after.body.items) && after.body.items.length === 0, 'expected cart empty after checkout');
  });
});
