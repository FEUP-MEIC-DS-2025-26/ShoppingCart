import React from "react";
import "./App.css";
// Import the actual component you are building and exposing
import ShoppingCart from "./components/ShoppingCart";

// Simple styles for the standalone "harness"
const harnessStyles: React.CSSProperties = {
  padding: "1rem",
  backgroundColor: "#17181aff",
  border: "1px solid #ccc",
  borderRadius: "8px",
};

export interface Product {
  id: string; // The *product* ID (e.g., "p1")
  name: string;
  price: number;
}

// 2. Define the CartItem interface (the new state structure)
export interface CartItem {
  instanceId: string; // The *unique instance* ID (e.g., "uuid-123-abc")
  product: Product;
}

const App = () => {
  const GATEWAY = process.env.REACT_APP_GATEWAY_URL || 'http://localhost:4000';

  const [cartItems, setCartItems] = React.useState<CartItem[]>([]);
  const [productsLoaded, setProductsLoaded] = React.useState(false);

  // Small helper to call the gateway
  async function apiFetch(path: string, opts: RequestInit = {}) {
    const url = `${GATEWAY}${path.startsWith('/') ? '' : '/'}${path}`.replace(/([^:]\/\/)(\/+)/, '$1');
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error(`API ${res.status} ${res.statusText}`);
    return res.json();
  }

  // Load product catalog from the gateway and seed a local cart for the demo
  React.useEffect(() => {
    let mounted = true;

    async function fetchCart() {
      try {
        const cart = await apiFetch('/api/cart');
        if (!mounted) return;

        // `cart.items` may have different shapes depending on backend (product_id, unit_price_cents)
        const rows = (cart && cart.items) || [];
        const instances: CartItem[] = [];
        const now = Date.now();

        rows.forEach((r: any) => {
          const productId = r.product_id || r.id || r.item_id || String(r.productId || r.product_id);
          const name = r.name || r.title || (r.product && r.product.name) || 'Unknown';
          const unit = Number(r.unit_price_cents || r.unitPrice || r.price || (r.product && r.product.price) || 0);
          const quantity = Number(r.quantity || r.qty || 1);

          for (let i = 0; i < Math.max(1, quantity); i++) {
            const instanceId = `${productId}-${i}-${now}`;
            instances.push({ instanceId, product: { id: String(productId), name, price: unit } });
          }
        });

        setCartItems(instances);
      } catch (err) {
        console.error('Failed to load cart from gateway:', err);
      } finally {
        if (mounted) setProductsLoaded(true);
      }
    }

    fetchCart();

    return () => { mounted = false; };
  }, []);

  const handleRemoveFromCart = async (instanceId: string) => {
    // Optimistic UI: remove locally first
    setCartItems((prevItems) => prevItems.filter((item) => item.instanceId !== instanceId));

    // If the gateway is available, attempt to remove via backend using product id,
    // then re-fetch the persisted cart to keep UI in sync.
    try {
      const removed = cartItems.find(ci => ci.instanceId === instanceId);
      if (removed) {
        const productId = removed.product.id;
        const res = await fetch(`${GATEWAY}/api/cart/${encodeURIComponent(productId)}`, { method: 'DELETE' });
        if (res.ok) {
          // refresh cart
          try {
            const refreshed = await apiFetch('/api/cart');
            const rows = (refreshed && refreshed.items) || [];
            const instances: CartItem[] = [];
            const now = Date.now();
            rows.forEach((r: any) => {
              const pid = r.product_id || r.id || r.item_id || String(r.productId || r.product_id);
              const name = r.name || r.title || (r.product && r.product.name) || 'Unknown';
              const unit = Number(r.unit_price_cents || r.unitPrice || r.price || (r.product && r.product.price) || 0);
              const quantity = Number(r.quantity || r.qty || 1);
              for (let i = 0; i < Math.max(1, quantity); i++) {
                const instanceId2 = `${pid}-${i}-${now}`;
                instances.push({ instanceId: instanceId2, product: { id: String(pid), name, price: unit } });
              }
            });
            setCartItems(instances);
          } catch (err) {
            // ignore refresh errors
          }
        }
      }
    } catch (err) {
      console.warn('Failed to remove item from backend cart, UI updated locally:', err);
    }
  };

  return (
    <div className="content" style={harnessStyles}>
      <h1>Running 'mips_shopping_cart_page' in Standalone Mode</h1>
      <p>
        This container is the <strong>local App.tsx</strong>. The component
        below is the one we are actually exporting.
      </p>
      <hr style={{ margin: "1.5rem 0" }} />

      {/* This is the actual micro-frontend component */}
      <ShoppingCart items={cartItems} onRemoveFromCart={handleRemoveFromCart} />

      {!productsLoaded && (
        <p>Loading product catalogue from gateway...</p>
      )}
    </div>
  );
};

export default App;
