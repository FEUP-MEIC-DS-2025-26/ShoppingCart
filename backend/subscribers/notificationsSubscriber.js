const { PubSub } = require('@google-cloud/pubsub');

const projectId = process.env.PUBSUB_PROJECT || 'test-project';
const subscriptionName = process.env.NOTIFICATIONS_SUBSCRIPTION || 'notifications-sub';

const pubsub = new PubSub({ projectId });

async function startNotificationsSubscriber() {
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

  console.log(`Notifications subscriber starting, listening on subscription: ${subscriptionName}`);
  subscription.on('message', (message) => {
    try {
      const payload = JSON.parse(message.data.toString());
      console.log('notifications-sub received:', payload);
      // TODO: implement real notification handling (email, webhook, etc.)
      message.ack();
    } catch (err) {
      console.error('Notifications subscriber processing error:', err);
      try { message.nack(); } catch (e) { console.error('nack failed', e); }
    }
  });

  subscription.on('error', (err) => {
    console.error('Notifications subscription error:', err);
  });
}

module.exports = { startNotificationsSubscriber };
