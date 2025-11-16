const { startNotificationsSubscriber } = require('./notificationsSubscriber');

(async () => {
  try {
    await startNotificationsSubscriber();
    console.log('Notifications subscriber started (runNotificationsSubscriber)');
  } catch (err) {
    console.error('Failed to start notifications subscriber:', err.message || err);
    process.exit(1);
  }
})();
