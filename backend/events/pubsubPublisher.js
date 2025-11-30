// Minimal console-only publisher
// This module intentionally avoids external dependencies and simply logs published messages.
function nowId() {
  return `fallback-${Date.now()}`;
}

async function publish(topicName, payload) {
  console.log('[pubsub-console] publish to', topicName, JSON.stringify(payload));
  return nowId();
}

async function publishShoppingCart(wrapper) {
  console.log('[pubsub-console] publish shopping_cart:', JSON.stringify(wrapper));
  return nowId();
}

module.exports = {
  publish,
  publishShoppingCart
};
