const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { upsertCart, getCart } = require('../db');
const productService = require('../../productService');
const pgdb = require('../db');
const { publish, publishShoppingCart } = require('../../events/pubsubPublisher');
// Helper: simple user scoping for demo (single user)
const DEFAULT_USER = 'user1';

function cents(n) {
  return Number(n) || 0;
}

// GET /api/cart -> summary
router.get('/', async (req, res) => {
  try {
    if (pgdb && pgdb.pool) {
      // Postgres path
      const userId = DEFAULT_USER;
      const cartRes = await pgdb.query('SELECT id, user_id, total_price_cents, currency FROM carts WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1', [userId]);
      if (!cartRes.rows || cartRes.rows.length === 0) {
        return res.json({ items: [], subtotal: 0, shipping: 0, discount: 0, total: 0 });
      }
      const cart = cartRes.rows[0];
      const itemsRes = await pgdb.query('SELECT product_id, sku, name, unit_price_cents, quantity FROM cart_items WHERE cart_id = $1', [cart.id]);
      const cartRows = itemsRes.rows || [];

      // Fetch live product info for validation
      let products = null;
      try { products = await productService.getProducts(); } catch (e) { products = null; }
      if (!products) return res.status(503).json({ error: 'Product service unavailable', actionable: 'Try again later' });

      const missing = cartRows.map(r => r.product_id).filter(id => !products.some(p => String(p.id) === String(id)));
      if (missing.length > 0) return res.status(400).json({ error: 'Some cart items are not available in product service', missing });

      const items = cartRows.map(ci => {
        const product = products.find(p => String(p.id) === String(ci.product_id));
        const unit = ci.unit_price_cents || (product ? product.price : 0);
        return {
          id: ci.product_id,
          name: ci.name || (product && product.name) || 'Unknown',
          unitPrice: cents(unit),
          quantity: ci.quantity,
          lineTotal: cents(unit) * ci.quantity
        };
      });

      const subtotal = items.reduce((s, it) => s + it.lineTotal, 0);
      const shipping = subtotal > 5000 || subtotal === 0 ? 0 : 500;
      const discount = subtotal >= 10000 ? Math.round(subtotal * 0.1) : 0;
      const total = subtotal + shipping - discount;
      return res.json({ items, subtotal, shipping, discount, total });
    }

    // Fallback: sqlite implementation (legacy db)
    const legacy = require('../../db');
    legacy.db.all('SELECT item_id, quantity FROM cart_items', async (err, cartRows) => {
      if (err) return res.status(500).json({ error: 'DB error' });
      if (!cartRows || cartRows.length === 0) return res.json({ items: [], subtotal: 0, shipping: 0, discount: 0, total: 0 });
      let products = null;
      try { products = await productService.getProducts(); } catch (e) { products = null; }
      if (!products) return res.status(503).json({ error: 'Product service unavailable', actionable: 'Try again later' });
      const missing = cartRows.map(r => r.item_id).filter(id => !products.some(p => p.id === id));
      if (missing.length > 0) return res.status(400).json({ error: 'Some cart items are not available in product service', missing });
      const items = cartRows.map(cartItem => {
        const product = products.find(p => p.id === cartItem.item_id);
        const unit = product ? product.price : 0;
        return { id: product.id, name: product.name, unitPrice: unit, quantity: cartItem.quantity, lineTotal: unit * cartItem.quantity };
      });
      const subtotal = items.reduce((s, it) => s + it.lineTotal, 0);
      const shipping = subtotal > 5000 || subtotal === 0 ? 0 : 500;
      const discount = subtotal >= 10000 ? Math.round(subtotal * 0.1) : 0;
      const total = subtotal + shipping - discount;
      return res.json({ items, subtotal, shipping, discount, total });
    });
  } catch (err) {
    console.error('Error in cart GET:', err);
    return res.status(500).json({ error: 'Failed to fetch cart' });
  }
});

// GET /api/cart/:cart_id -> get specific cart by ID
router.get('/:cart_id', async (req, res) => {
  const { cart_id } = req.params;

  try {
    const cart = await getCart(cart_id);

    if (!cart) {
      return res.status(404).json({ error: 'Cart not found' });
    }

    return res.status(200).json(cart);

  } catch (error) {
    console.error('Error fetching cart:', error);
    return res.status(500).json({ error: 'Failed to fetch cart' });
  }
});

// POST /api/cart -> create or update cart
router.post('/', async (req, res) => {
  const { cart_id, user_id, items } = req.body;

  // Validation
  if (!user_id) {
    return res.status(400).json({ error: 'user_id is required' });
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      error: 'items array is required and must not be empty'
    });
  }

  // Validate each item
  for (const item of items) {
    if (!item.product_id || !item.quantity || item.quantity < 1) {
      return res.status(400).json({
        error: 'Each item must have product_id and quantity >= 1'
      });
    }
  }

  // Validate products exist in product service
  let products;
  try {
    products = await productService.getProducts();
  } catch (e) {
    console.error('Error fetching products:', e);
    products = null;
  }

  if (!products) {
    return res.status(503).json({
      error: 'Product service unavailable',
      actionable: 'Try again later'
    });
  }

  // Check if all products exist
  const productIds = items.map(item => item.product_id);
  const missing = productIds.filter(id =>
    !products.some(p => String(p.id) === String(id))
  );

  if (missing.length > 0) {
    return res.status(400).json({
      error: 'Invalid products',
      missing: missing,
      actionable: 'Remove invalid products from cart'
    });
  }

  // Validate stock availability
  /*
  const stockIssues = [];
  for (const item of items) {
    const product = products.find(p => String(p.id) === String(item.product_id));
    if (product && item.quantity > product.stock) {
      stockIssues.push({
        product_id: item.product_id,
        name: product.name,
        requested: item.quantity,
        available: product.stock,
        actionable: `Reduce quantity to ${product.stock} or less`
      });
    }
  }

  if (stockIssues.length > 0) {
    return res.status(409).json({
      error: 'Insufficient stock',
      details: stockIssues
    });
  }
*/
  try {
    // Generate cart_id if not provided
    const finalCartId = cart_id || crypto.randomUUID();

    // Calculate total
    const total_price_cents = items.reduce((sum, item) =>
      sum + (item.unit_price_cents || 0) * item.quantity, 0
    );

    // Upsert to database
    await upsertCart({
      cart_id: finalCartId,
      user_id,
      items,
      total_price_cents,
      currency: req.body.currency || 'EUR'
    });

    // Fetch updated cart
    const cart = await getCart(finalCartId);

    // Publish cart snapshot to PubSub (non-blocking)
    publishShoppingCartWrapper(cart).catch(err =>
      console.error('Failed to publish cart event:', err)
    );

    // Return cart snapshot
    return res.status(200).json(cart);

  } catch (error) {
    console.error('Error upserting cart:', error);
    return res.status(500).json({ error: 'Failed to save cart' });
  }
});

// Helper function to publish cart events to PubSub using ShoppingCartWrapper
async function publishShoppingCartWrapper(cart) {
  try {
    // Format cart data to match ShoppingCartWrapper protobuf schema
    const wrapper = {
      cart_id: cart.cart_id,
      user_id: cart.user_id,
      items: cart.items.map(item => ({
        product_id: item.product_id,
        sku: item.sku || '',
        name: item.name || '',
        unit_price_cents: parseInt(item.unit_price_cents) || 0,
        quantity: item.quantity || 0
      })),
      total_price_cents: parseInt(cart.total_price_cents) || 0,
      currency: cart.currency || 'EUR',
      updated_at: cart.updated_at || new Date().toISOString()
    };

    const messageId = await publishShoppingCart(wrapper);
    console.log(`[cart] Published ShoppingCartWrapper: ${messageId}`);
    return messageId;

  } catch (error) {
    console.error('[cart] Failed to publish ShoppingCartWrapper:', error);
    throw error;
  }
}

// PUT /api/cart/:itemId -> update quantity
router.put('/:itemId', async (req, res) => {
  const itemId = req.params.itemId;
  const { quantity } = req.body;
  if (!Number.isInteger(quantity) || quantity < 0) return res.status(400).json({ error: 'Invalid quantity' });
  if (quantity === 0) {
    if (pgdb && pgdb.pool) {
      const userId = DEFAULT_USER;
      const cartRes = await pgdb.query('SELECT id FROM carts WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1', [userId]);
      if (!cartRes.rows || cartRes.rows.length === 0) return res.json({ success: true });
      const cartId = cartRes.rows[0].id;
      await pgdb.query('DELETE FROM cart_items WHERE cart_id = $1 AND product_id = $2', [cartId, String(itemId)]);
      return res.json({ success: true });
    }
    const legacy = require('../../db');
    return legacy.db.run('DELETE FROM cart_items WHERE item_id = ?', [itemId], function (dErr) {
      if (dErr) return res.status(500).json({ error: 'DB error' });
      return res.json({ success: true });
    });
  }

  try {
    let products;
    try { products = await productService.getProducts(); } catch (e) { products = null; }
    if (!products) return res.status(503).json({ error: 'Product service unavailable', actionable: 'Try again later' });
    const product = products.find(p => String(p.id) === String(itemId));
    if (!product) return res.status(404).json({ error: 'Item not found' });
    if (quantity > product.stock) return res.status(409).json({ error: 'Insufficient stock', actionable: `Only ${product.stock} left in stock` });

    if (pgdb && pgdb.pool) {
      const userId = DEFAULT_USER;
      const cartRes = await pgdb.query('SELECT id FROM carts WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1', [userId]);
      if (!cartRes.rows || cartRes.rows.length === 0) return res.status(404).json({ error: 'Cart not found' });
      const cartId = cartRes.rows[0].id;
      await pgdb.query('UPDATE cart_items SET quantity = $1 WHERE cart_id = $2 AND product_id = $3', [quantity, cartId, String(itemId)]);
      return res.json({ success: true });
    }

    const legacy = require('../../db');
    legacy.db.run('UPDATE cart_items SET quantity = ? WHERE item_id = ?', [quantity, itemId], function (uerr) {
      if (uerr) return res.status(500).json({ error: 'DB error' });
      return res.json({ success: true });
    });
  } catch (err) {
    console.error('Error in cart PUT:', err);
    return res.status(500).json({ error: 'Failed to update cart item' });
  }
});

// DELETE /api/cart/:itemId
router.delete('/:itemId', async (req, res) => {
  const itemId = req.params.itemId;
  try {
    if (pgdb && pgdb.pool) {
      const userId = DEFAULT_USER;
      const cartRes = await pgdb.query('SELECT id FROM carts WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1', [userId]);
      if (!cartRes.rows || cartRes.rows.length === 0) return res.json({ success: true });
      const cartId = cartRes.rows[0].id;
      await pgdb.query('DELETE FROM cart_items WHERE cart_id = $1 AND product_id = $2', [cartId, String(itemId)]);
      return res.json({ success: true });
    }
    const legacy = require('../../db');
    legacy.db.run('DELETE FROM cart_items WHERE item_id = ?', [itemId], function (err) {
      if (err) return res.status(500).json({ error: 'DB error' });
      return res.json({ success: true });
    });
  } catch (err) {
    console.error('Error in cart DELETE:', err);
    return res.status(500).json({ error: 'Failed to remove cart item' });
  }
});

// POST /api/cart/checkout
router.post('/checkout', async (req, res) => {
  const { address, cart_id } = req.body;

  if (!address || !address.line1) {
    return res.status(400).json({
      error: 'Invalid address',
      actionable: 'Provide a valid shipping address'
    });
  }

  if (!cart_id) {
    return res.status(400).json({
      error: 'cart_id is required',
      actionable: 'Provide a cart_id to checkout'
    });
  }

  try {
    // Get the full cart details
    const cart = await getCart(cart_id);

    if (!cart) {
      return res.status(404).json({
        error: 'Cart not found',
        actionable: 'Provide a valid cart_id'
      });
    }

    if (!cart.items || cart.items.length === 0) {
      return res.status(400).json({
        error: 'Empty cart',
        actionable: 'Add items to cart before checkout'
      });
    }

    // Validate products exist and stock is available
    let products;
    try {
      products = await productService.getProducts();
    } catch (e) {
      products = null;
    }

    if (!products) {
      return res.status(503).json({
        error: 'Product service unavailable',
        actionable: 'Try again later'
      });
    }

    const missing = cart.items.map(item => item.product_id)
      .filter(id => !products.some(p => String(p.id) === String(id)));

    if (missing.length > 0) {
      return res.status(400).json({
        error: 'Some cart items are not available in product service',
        missing
      });
    }

    const cartWithProducts = cart.items.map(cartItem => {
      const product = products.find(p => String(p.id) === String(cartItem.product_id));
      return {
        id: cartItem.product_id,
        quantity: cartItem.quantity,
        name: cartItem.name || (product ? product.name : 'Unknown Product'),
        stock: product ? product.stock : 0
      };
    });
    /*
     const problems = cartWithProducts
       .filter(r => r.quantity > r.stock)
       .map(r => ({
         itemId: r.id,
         name: r.name,
         requested: r.quantity,
         available: r.stock,
         actionable: `Reduce quantity to ${r.stock} or remove item`
       }));
 
     if (problems.length > 0) {
       return res.status(409).json({
         error: 'Stock issues',
         details: problems
       });
     }
  */
    // Publish CHECKOUT_ATTEMPT event
    const checkoutAttemptEvent = {
      event_id: crypto.randomUUID(),
      event_type: 'CHECKOUT_ATTEMPT',
      timestamp: new Date().toISOString(),
      cart_id: cart.cart_id,
      user_id: cart.user_id,
      address: address,
      total_price_cents: cart.total_price_cents,
      currency: cart.currency
    };

    await publish('checkout-events', checkoutAttemptEvent).catch(err =>
      console.error('[checkout] Failed to publish CHECKOUT_ATTEMPT:', err)
    );

    console.log(`[checkout] Published CHECKOUT_ATTEMPT for cart ${cart.cart_id}`);

    const paymentSuccess = 1;

    if (paymentSuccess) {
      // Publish CHECKOUT_SUCCESS event
      const checkoutSuccessEvent = {
        event_id: crypto.randomUUID(),
        event_type: 'CHECKOUT_SUCCESS',
        timestamp: new Date().toISOString(),
        cart_id: cart.cart_id,
        user_id: cart.user_id,
        order_id: crypto.randomUUID(),
        total_price_cents: cart.total_price_cents,
        currency: cart.currency,
        address: address
      };

      await publish('checkout-events', checkoutSuccessEvent).catch(err =>
        console.error('[checkout] Failed to publish CHECKOUT_SUCCESS:', err)
      );

      console.log(`[checkout] Published CHECKOUT_SUCCESS for cart ${cart.cart_id}`);

      // Clear cart from database
      if (pgdb && pgdb.pool) {
        await pgdb.query('DELETE FROM cart_items WHERE cart_id = $1', [cart_id]);
        await pgdb.query('DELETE FROM carts WHERE id = $1', [cart_id]);
        console.log(`[checkout] Cleared cart ${cart_id} from database`);
      }

      return res.json({
        success: true,
        message: 'Order confirmed',
        order_id: checkoutSuccessEvent.order_id
      });

    } else {
      // Publish CHECKOUT_FAILED event
      const checkoutFailedEvent = {
        event_id: crypto.randomUUID(),
        event_type: 'CHECKOUT_FAILED',
        timestamp: new Date().toISOString(),
        cart_id: cart.cart_id,
        user_id: cart.user_id,
        reason: 'Payment gateway error',
        total_price_cents: cart.total_price_cents,
        currency: cart.currency
      };

      await publish('checkout-events', checkoutFailedEvent).catch(err =>
        console.error('[checkout] Failed to publish CHECKOUT_FAILED:', err)
      );

      console.log(`[checkout] Published CHECKOUT_FAILED for cart ${cart.cart_id}`);

      return res.status(402).json({
        success: false,
        error: 'Payment failed',
        actionable: 'Please try again or use a different payment method'
      });
    }

  } catch (err) {
    console.error('Error in checkout:', err);

    // Publish CHECKOUT_FAILED event for unexpected errors
    try {
      const checkoutFailedEvent = {
        event_id: crypto.randomUUID(),
        event_type: 'CHECKOUT_FAILED',
        timestamp: new Date().toISOString(),
        cart_id: cart_id,
        reason: 'Internal server error',
        error: err.message
      };

      await publish('checkout-events', checkoutFailedEvent).catch(e =>
        console.error('[checkout] Failed to publish CHECKOUT_FAILED:', e)
      );
    } catch (publishErr) {
      console.error('[checkout] Failed to publish error event:', publishErr);
    }

    return res.status(500).json({ error: 'Checkout failed' });
  }
});

module.exports = router;
