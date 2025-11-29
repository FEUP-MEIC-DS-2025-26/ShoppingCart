require('dotenv').config();
const request = require('supertest');
const app = require('../index');
const { pool } = require('../src/db');
const fs = require('fs');

const LOG_FILE = 'test_results.txt';

function log(message) {
    console.log(message);
    fs.appendFileSync(LOG_FILE, message + '\n');
}

async function runTests() {
    // Clear log file
    fs.writeFileSync(LOG_FILE, '');

    log('🚀 Starting Cart API Tests...\n');
    log('DATABASE_URL: ' + (process.env.DATABASE_URL ? 'Set (hidden)' : 'Not Set'));
    log('Connecting to DB...');

    try {
        // Cleanup before tests
        if (pool) {
            await pool.query("DELETE FROM cart_items WHERE cart_id LIKE 'api-test-%'");
            await pool.query("DELETE FROM carts WHERE id LIKE 'api-test-%'");
        }

        let testCartId;

        // Test 1: Create new cart
        log('Test 1: POST /api/cart (Create)');
        const res1 = await request(app)
            .post('/api/cart')
            .send({
                user_id: 'api-test-user-001',
                items: [
                    {
                        product_id: '1',
                        name: 'T-Shirt',
                        quantity: 2,
                        unit_price_cents: 1999,
                        sku: 'TSH-001'
                    }
                ]
            });

        if (res1.status !== 200) throw new Error(`Expected 200, got ${res1.status}: ${JSON.stringify(res1.body)}`);
        if (!res1.body.cart_id) throw new Error('Missing cart_id');
        testCartId = res1.body.cart_id;
        log('✅ Passed\n');

        // Test 2: Create specific cart ID
        log('Test 2: POST /api/cart (Specific ID)');
        const specificId = 'api-test-specific-cart';
        const res2 = await request(app)
            .post('/api/cart')
            .send({
                cart_id: specificId,
                user_id: 'api-test-user-002',
                items: [{ product_id: '2', quantity: 1, unit_price_cents: 1299 }]
            });

        if (res2.status !== 200) throw new Error(`Expected 200, got ${res2.status}`);
        if (res2.body.cart_id !== specificId) throw new Error('Cart ID mismatch');
        log('✅ Passed\n');

        // Test 3: Update cart
        log('Test 3: POST /api/cart (Update)');
        const res3 = await request(app)
            .post('/api/cart')
            .send({
                cart_id: testCartId,
                user_id: 'api-test-user-001',
                items: [
                    { product_id: '1', quantity: 5, unit_price_cents: 1999 },
                    { product_id: '2', quantity: 1, unit_price_cents: 1299 }
                ]
            });

        if (res3.status !== 200) throw new Error(`Expected 200, got ${res3.status}`);
        if (res3.body.items.length !== 2) throw new Error('Items count mismatch');
        log('✅ Passed\n');

        // Test 4: GET cart
        log('Test 4: GET /api/cart/:id');
        const res4 = await request(app)
            .get(`/api/cart/${testCartId}`);

        if (res4.status !== 200) throw new Error(`Expected 200, got ${res4.status}`);
        if (res4.body.cart_id !== testCartId) throw new Error('Cart ID mismatch');
        if (res4.body.items.length !== 2) throw new Error('Items count mismatch');
        log('✅ Passed\n');

        // Test 5: GET non-existent cart
        log('Test 5: GET /api/cart/:id (404)');
        const res5 = await request(app)
            .get('/api/cart/00000000-0000-0000-0000-000000000000');

        if (res5.status !== 404) throw new Error(`Expected 404, got ${res5.status}`);
        log('✅ Passed\n');

        log('🎉 All tests passed successfully!');

    } catch (error) {
        log('❌ Test Failed: ' + error.message);
        if (error.response) log('Response: ' + JSON.stringify(error.response.body));
        process.exit(1);
    } finally {
        if (pool) {
            await pool.query("DELETE FROM cart_items WHERE cart_id LIKE 'api-test-%'");
            await pool.query("DELETE FROM carts WHERE id LIKE 'api-test-%'");
            await pool.end();
        }
    }
}

runTests();