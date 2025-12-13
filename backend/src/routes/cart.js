const express = require('express');
const router = express.Router();
const { upsertCart, upsertCartItem, getCart, createCartIfNotExists } = require('../db');
// const productService = require('../../productService');
const pgdb = require('../db');
const { PubSub } = require("@google-cloud/pubsub");

const IN_PRODUCTION = process.env.DB_ENV !== 'local';
const pubsub = IN_PRODUCTION ? new PubSub({ projectId: 'ds-2526-mips' }) : null;

async function publishCart(type, data) {
  if (IN_PRODUCTION) {
    try {
      const topic = pubsub.topic('shopping_carts');
      const messageId = await topic.publishMessage({ json: { type, data } });
      console.log(`[Pub-Sub] Published message to: ${messageId}`);
    } catch (error) {
      console.error(`[Pub-Sub] Error publishing message: ${error}`);
    }
  }
}

// GET /api/cart/:userId -> get specific cart by ID
router.get('/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const cart = await getCart(userId);

    if (!cart) {
      return res.status(404).json({ error: 'Cart not found' });
    }

    return res.status(200).json(cart);

  } catch (error) {
    console.error('Error fetching cart:', error);
    return res.status(500).json({ error: 'Failed to fetch cart' });
  }
});


// GET /api/cart/:userId/setup -> get cart by ID (and creates an empty one if not already created)
router.get('/:userId/setup', async (req, res) => {
  const { userId } = req.params;

  try {
    await createCartIfNotExists(userId);
    const cart = await getCart(userId);

    if (!cart) {
      return res.status(404).json({ error: 'Cart not found' });
    }

    await publishCart('cart', cart);
    return res.status(200).json(cart);

  } catch (error) {
    console.error('Error fetching cart setup:', error);
    return res.status(500).json({ error: 'Failed to fetch cart' });
  }
});


// POST /api/cart/ -> create or update cart
router.post('/', async (req, res) => {
  const { userId, items } = req.body;
  
  // Validation
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      error: 'items array is required and must not be empty'
    });
  }

  // Validate each item
  for (const item of items) {
    if (!item.itemId || !item.quantity || item.quantity < 1) {
      return res.status(400).json({
        error: 'Each item must have itemId and quantity >= 1'
      });
    }
  }

  try {
    // Upsert to database
    await upsertCart({
      userId,
      items,
      currency: req.body.currency || 'EUR'
    });

    // Fetch updated cart
    const cart = await getCart(userId);

    await publishCart('cart', cart);
    return res.status(200).json(cart);

  } catch (error) {
    console.error('Error upserting cart:', error);
    return res.status(500).json({ error: 'Failed to save cart' });
  }
});

// DELETE /api/cart/:userId -> delete a specific cart by ID
router.delete('/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const cart = await getCart(userId);

    if (!cart) {
      return res.status(404).json({ error: 'Cart not found' });
    }

    await pgdb.query('DELETE FROM CartItem WHERE userId = $1', [userId]);
    await pgdb.query('DELETE FROM Cart WHERE userId = $1', [userId]);
    await publishCart('delete', { userId });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error deleting cart:', error);
    return res.status(500).json({ error: 'Failed to delete cart' });
  }
});


// POST /api/cart/:userId -> upserts an item into cart with given ID with quantities added if already exists
router.post('/:userId', async (req, res) => {
  const { userId } = req.params;
  const itemData = req.body;
  try {
    await createCartIfNotExists(userId);
    await upsertCartItem(userId, itemData, true);
    
    await publishCart(await getCart(userId));
    return res.json({ success: true });
  } catch (err) {
    console.error('Error in cart POST:', err);
    return res.status(500).json({ error: 'Failed to update cart item' });
  }
});

// PUT /api/cart/:userId/:itemId -> update quantity
router.put('/:userId/:itemId', async (req, res) => {
  const { userId, itemId } = req.params;
  const { quantity } = req.body;
  if (!Number.isInteger(quantity) || quantity < 0) return res.status(400).json({ error: 'Invalid quantity for put' });
  if (quantity === 0) {
    const userId = itemId;
    await pgdb.query('DELETE FROM CartItem WHERE userId = $1 AND itemId = $2', [userId, itemId]);
    await publishCart(await getCart(userId));
    return res.json({ success: true });
  }

  try {
    await pgdb.query('UPDATE CartItem SET quantity = $1 WHERE userId = $2 AND itemId = $3', [quantity, userId, itemId]);
    await publishCart(await getCart(userId));
    return res.json({ success: true });
  } catch (err) {
    console.error('Error in cart PUT:', err);
    return res.status(500).json({ error: 'Failed to update cart item' });
  }
});

// DELETE /api/cart/:userId/:itemId -> Delete an item
router.delete('/:userId/:itemId', async (req, res) => {
  const { userId, itemId } = req.params;
  try {
    await pgdb.query('DELETE FROM CartItem WHERE userId = $1 AND itemId = $2', [userId, itemId]);
    await publishCart(await getCart(userId));
    return res.json({ success: true });
  } catch (err) {
    console.error('Error in cart DELETE:', err);
    return res.status(500).json({ error: 'Failed to remove cart item' });
  }
});

// POST /api/cart/checkout
router.post('/checkout/:userId', async (req, res) => {
  const { userId } = req.params;

  if (!userId) {
    return res.status(400).json({
      error: 'userId is required',
      actionable: 'Provide a userId to checkout'
    });
  }

  try {
    // Get the full cart details
    const cart = await getCart(userId);

    if (!cart) {
      return res.status(404).json({
        error: 'Cart not found',
        actionable: 'Provide a valid userId'
      });
    }

    if (!cart.items || cart.items.length === 0) {
      return res.status(400).json({
        error: 'Empty cart',
        actionable: 'Add items to cart before checkout'
      });
    }

    const paymentSuccess = 1;

    if (paymentSuccess) {
      return res.status(200).json({
        success: true,
        message: 'Order confirmed',
      });
    } else {
      return res.status(402).json({
        success: false,
        error: 'Payment failed',
        actionable: 'Please try again or use a different payment method'
      });
    }
  } catch (err) {
    console.error('Error in checkout:', err);
    return res.status(500).json({ error: 'Checkout failed' });
  }
});

module.exports = router;
