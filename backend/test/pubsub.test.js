const { publishShoppingCart } = require('../events/pubsubPublisher.js');

publishShoppingCart({
  cartId: "123",
  items: [{ productId: "A", quantity: 2 }],
})
  .then(id => console.log("Message sent:", id))
  .catch(err => console.error("Error:", err));

  