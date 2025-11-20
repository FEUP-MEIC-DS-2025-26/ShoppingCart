const { startOrdersSubscriber } = require('./ordersSubscriber');

(async () => {
  try {
    await startOrdersSubscriber();
    console.log('Orders subscriber started (runOrdersSubscriber)');
  } catch (err) {
    console.error('Failed to start orders subscriber:', err.message || err);
    process.exit(1);
  }
})();
