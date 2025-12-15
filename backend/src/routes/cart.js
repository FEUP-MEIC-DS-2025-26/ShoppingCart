const express = require('express');
const router = express.Router();
const { upsertCart, upsertCartItem, getCart, createCartIfNotExists } = require('../db');
const pgdb = require('../db');

// 1. IMPORT PUBSUB
const { PubSub } = require('@google-cloud/pubsub');

// --- PUBSUB CONFIGURATION ---
const TOPIC_NAME = 'add_to_cart';

const pubSubClient = new PubSub({
  projectId: 'ds-2526-mips',
  credentials: {
    client_email: 'pubsub-backend@ds-2526-mips.iam.gserviceaccount.com',
    private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC3JKm/7DVM/TX6\nJNKLa3hZ35XczckRmNXpEL5pIGohpsToqJHbNskfwoalsq/yM9evW05weTUMLcmX\n6/tSWsfpPQadBliPkt0sHU0Tp1hErDCDKv7CNUGVOi7Mc0Rjv0QbZyEtkYIhge75\ngvmtKkEEzgtZ+JwUkZOU2PUC8C0eWPAd9LB5S9DFNQmCHPQJXwkjjuM1/m358neD\nSW+7lC5l+HbrN97iE9eUKosZuQjzhwjHcWruojAJcwMFnCaZ/aPzekfOiLw1hP7r\nTqJEWCBgQDLlKUzTkCu6hkogFKYxZJUVTuk2zrIxqfiaDkWxHyGEcfSrd8hcI/bZ\nVusK7Fp9AgMBAAECggEADqyk31MVXZMHtqsppZsvBwB9GQvyGZ4F5x6ngHPk8nJS\n4mjTWwho6sm4O+Gf6x0P91CDw0uq86FdlEsyatcJn/IlrAJHU/sKtroC+YQAn2wD\n7RajrWWoA3Aoh3WQRsUbYhi21gML4BRxqf4TybYSL0jf1viDxRAkY5pTXhtmz2ti\nLhwlNBVoz2+cgUalWggstO5I3TtmBEiDS6WcMiq8B7OAb43yCUvF4WnJUaZxDLRC\nt3Md+jPCX17cKmGqsekmDUWeaR449IdQF1957KjafboUo2rnVx7gRuXznji19eyS\nPWf1zNz9hn7smFAzXyHbC51Z3IRDe+6EU6rDs7DRLwKBgQD6LecJFj2ui8W7jP+0\nlSD4/BUzBvR/X0vpi9XNY9K6BHB17KJnuD8nIJdH4+sn6tuem/73/6zOCuVElDRJ\nWNW67hujXxo1OU0BdLezAWvb0SJMOkmgjHKerAo5VDvsjcszeocOu/BS905FZegw\nC/it18MEcBFZSbQjSkUa/fG4xwKBgQC7Z3xYGTEcEJwNgYSicUzCDtcY3iPMcfM8\ndITgFKUlH3z+50+d9R2nI5lelkUXDRMWdkWV1O4flLhTgxHlaqJqVknEmXTxTqTJ\n2/r7UAPpsPZ54z6Bbrs7s7kuslVwES6PRwAV+yrTxKB3k+O7w7CWZRbeZUVt6rZ4\naOay4iy2mwKBgQDBgqfl+3IShMKZY2KWR5ONg07SfVq4+vk42JSznbbtc2mZjUPB\nfl464ZaiYMUPxzXA5WC+auE7LmpQNWKMKU6InIx8PZ+D86KAscs1hq/rA0TIOX2h\n1YEDAoeV+HWxb6vxUaEN4IjvY6MDQuPp5higPvf1gsmoir3vXg895ZcHGQKBgC0b\n4MtX7QFDYjzCA0oSmZZQeigLOHS6rQDNTzqc3Y+M/8pfpUNxP9z+bald5G2DASgz\n+dXx9gt2AdRgRUuCmmucL496HLME6heIsuYRQY/bv8hhEaeYHstlHFsIJBagnCNy\nxKuF1K46syF1YKjOls/sr0+C8u5dQ+TB414FoRunAoGAMA6f+rcjY9p6ORZL1L/0\nMQELVUWmxSwkoQVzTCQIZP9szyUSn5xt5TxB5CISFbTbMcL+4jLpxiDimhsBNdnf\ncwt/WxXRcHm9hX9JKc9aA4JRFsvHZ+2hDTCGohvIOJdgIiEVBuRMLn54/78/uvJh\nTYhUP+eT9vBYiorn4TY2q5w=\n-----END PRIVATE KEY-----\n".replace(/\\n/g, '\n'), 
  }
});

// --- HELPER: PUBLISH TO PUBSUB ---
async function publishAddToCart(cartData) {
  try {
    const dataBuffer = Buffer.from(JSON.stringify(cartData));
    
    // Publishes the message
    const messageId = await pubSubClient
      .topic(TOPIC_NAME)
      .publishMessage({ data: dataBuffer });
      
    console.log(`[PubSub] Message ${messageId} published to ${TOPIC_NAME}.`);
  } catch (error) {
    console.error(`[PubSub] Error publishing message: ${error.message}`);
    // We don't throw here to avoid crashing the HTTP response to the user
  }
}
// ---------------------------------


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

    return res.status(200).json(cart);

  } catch (error) {
    console.error('Error fetching cart setup:', error);
    return res.status(500).json({ error: 'Failed to fetch cart' });
  }
});


// POST /api/cart/ -> create or update cart (BULK ADD)
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

    // --- PUBLISH TO PUBSUB ---
    await publishAddToCart({
      userId,
      items,
      event: 'add_to_cart',
      timestamp: new Date()
    });
    // -----------------------

    // Fetch updated cart
    const cart = await getCart(userId);

    // Return cart snapshot
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

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error deleting cart:', error);
    return res.status(500).json({ error: 'Failed to delete cart' });
  }
});


// POST /api/cart/:userId -> upserts an item into cart (SINGLE ADD)
router.post('/:userId', async (req, res) => {
  const { userId } = req.params;
  const itemData = req.body; // Expects { itemId, quantity, ... }
  try {
    await createCartIfNotExists(userId);
    await upsertCartItem(userId, itemData, true);

    // --- PUBLISH TO PUBSUB ---
    await publishAddToCart({
      userId,
      items: [itemData], // Wrap single item in array to match schema
      event: 'add_to_cart',
      timestamp: new Date()
    });
    // -----------------------

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
  
  // CASE 1: Quantity is 0 (Delete Item)
  if (quantity === 0) {
    await pgdb.query('DELETE FROM CartItem WHERE userId = $1 AND itemId = $2', [userId, itemId]);
    
    // --- PUBLISH TO PUBSUB (Removal) ---
    await publishAddToCart({
      userId,
      items: [{ itemId, quantity: 0 }],
      event: 'update_cart',
      timestamp: new Date()
    });
    // ------------------------------------

    return res.json({ success: true });
  }

  // CASE 2: Quantity > 0 (Update Item)
  try {
    await pgdb.query('UPDATE CartItem SET quantity = $1 WHERE userId = $2 AND itemId = $3', [quantity, userId, itemId]);
    
    // --- PUBLISH TO PUBSUB (Update) ---
    await publishAddToCart({
      userId,
      items: [{ itemId, quantity }], // Send the new quantity
      event: 'update_cart',
      timestamp: new Date()
    });
    // ----------------------------------

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
    
    // Optional: You could publish a 'delete' event here too if desired, 
    // but the prompt strictly requested the PUT operation.
    
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