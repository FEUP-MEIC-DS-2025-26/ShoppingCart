const { PubSub } = require('@google-cloud/pubsub');

const projectId = process.env.PUBSUB_PROJECT || 'test-project';
const subscriptionName = process.env.ORDERS_SUBSCRIPTION || 'orders-sub';

const pubsub = new PubSub({ projectId });

async function startOrdersSubscriber() {
  if (!process.env.PUBSUB_EMULATOR_HOST) {
    console.error('PUBSUB_EMULATOR_HOST is not set. Export PUBSUB_EMULATOR_HOST=localhost:8085 before starting subscribers.');
    throw new Error('PUBSUB_EMULATOR_HOST not set');
  }

  const subscription = pubsub.subscription(subscriptionName);
  // Check subscription exists before attaching streaming handlers so we fail fast with a helpful message
  const [exists] = await subscription.exists();
  if (!exists) {
    console.error(`Subscription does not exist: ${subscriptionName}. Run initPubsub.js to create subscriptions.`);
    throw new Error(`Subscription not found: ${subscriptionName}`);
  }

  console.log(`Orders subscriber starting, listening on subscription: ${subscriptionName}`);
  subscription.on('message', (message) => {
    try {
      const payload = JSON.parse(message.data.toString());
      console.log('orders-sub received:', payload);
      // TODO: implement real handling (notify user, update inventory, etc.)
      message.ack(); // acknowledge on success
    } catch (err) {
      console.error('Subscriber processing error:', err);
      try { message.nack(); } catch (e) { console.error('nack failed', e); }
    }
  });

  subscription.on('error', (err) => {
    console.error('Subscription error:', err);
  });
}

module.exports = { startOrdersSubscriber };
