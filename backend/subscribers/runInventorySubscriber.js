const { startInventorySubscriber } = require('./inventorySubscriber');

(async () => {
  try {
    startInventorySubscriber();
    console.log('Inventory subscriber started (runInventorySubscriber)');
  } catch (err) {
    console.error('Failed to start inventory subscriber:', err);
    process.exit(1);
  }
})();
