const { PubSub } = require('@google-cloud/pubsub');

const projectId = process.env.PUBSUB_PROJECT || 'test-project';
const subscriptionName = process.env.INVENTORY_SUBSCRIPTION || 'orders-sub';

const pubsub = new PubSub({ projectId });

async function startInventorySubscriber() {
  if (!process.env.PUBSUB_EMULATOR_HOST) {
    console.error('PUBSUB_EMULATOR_HOST is not set. Export PUBSUB_EMULATOR_HOST=localhost:8085 before starting subscribers.');
    throw new Error('PUBSUB_EMULATOR_HOST not set');
  }

  const subscription = pubsub.subscription(subscriptionName);
  const [exists] = await subscription.exists();
  if (!exists) {
    console.error(`Subscription does not exist: ${subscriptionName}. Run initPubsub.js to create subscriptions.`);
    throw new Error(`Subscription not found: ${subscriptionName}`);
  }

  console.log(`Inventory subscriber starting, listening on subscription: ${subscriptionName}`);
  subscription.on('message', (message) => {
    try {
      const payload = JSON.parse(message.data.toString());
      // For demo: react to order.created events to sync inventory (simulated)
      if (payload && payload.event === 'order.created') {
        console.log('inventory-sub processing order.created:', payload.orderId || '(no id)');
        // TODO: call inventory service or update local cache
      } else {
        console.log('inventory-sub received:', payload);
      }
      message.ack();
    } catch (err) {
      console.error('Inventory subscriber processing error:', err);
      try { message.nack(); } catch (e) { console.error('nack failed', e); }
    }
  });

  subscription.on('error', (err) => {
    console.error('Inventory subscription error:', err);
  });
}

module.exports = { startInventorySubscriber };
