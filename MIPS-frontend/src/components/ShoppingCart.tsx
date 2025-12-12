import React, { useMemo } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import DeleteIcon from "@mui/icons-material/Delete"; 

export interface CartItem {
  itemId: number;
  sku: string;
  name: string;
  priceCents: number;
  quantity: number;
  metadata: unknown;
}

export interface Cart {
  userId: number;
  totalPriceCents: number;
  currency: string;
  items: CartItem[];
}

const BACKEND_URL = (window.location.hostname == 'localhost' || window.location.hostname == '127.0.0.1')
                  ? 'http://localhost:4000' : 'https://api.madeinportugal.store/';

const ShoppingCartPage = () => {
  let userId = 1; // TODO: get from auth params
  let [loading, setLoading] = React.useState<boolean>(true);
  let [cart, setCart] = React.useState<Cart | null>(null);
  const [checkoutLoading, setCheckoutLoading] = React.useState(false);

  function updateCart() {
    fetch(`${BACKEND_URL}/api/cart/${userId}`)
      .then(async (res) => {
        setLoading(false);
        if (!res.ok) {
          // Test data for now
          setCart({
            userId: 1,
            totalPriceCents: 0,
            currency: 'USD',
            items: []
          })
          return;
        }
        const data = await res.json();
        setCart(data);
      });
  }

  React.useEffect(() => {
    setLoading(true);
    updateCart();
  }, []);

  return (
    <Box
      sx={{
        p: "1.5rem",
        border: "2px dashed",
        borderColor: "error.main",
        borderRadius: "8px",
        bgcolor: "background.paper",
        maxWidth: "800px",
        my: "1rem",
        textAlign: "left",
        color: "text.primary"
      }}
    >
      <Typography
        variant="h4"
        component="h2"
        sx={{
          color: "error.main",
          mt: 0,
          fontWeight: "bold",
        }}
      >
        🛒 Shopping Cart
      </Typography>

      {cart === null ? (
        loading ? <Typography> Loading... </Typography>
          : <Typography> Error occured. No cart available. </Typography>
      ) : (
        <>
          <Box>
            {cart.items.length === 0 ? (
              <Typography variant="body1" sx={{ mt: 2 }}>Your cart is empty.</Typography>
            ) : (
              <List sx={{ padding: 0 }}>
                {cart.items.map((cartItem) => {
                  const lineTotal = cartItem.priceCents * cartItem.quantity;
                  const canDecreaseQty = cartItem.quantity > 1;
                  return (
                    <ListItem
                      key={cartItem.itemId}
                      sx={{
                        p: "1rem",
                        bgcolor: "background.default",
                        borderRadius: "5px",
                        mb: "1rem",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 2,
                      }}
                    >
                      <Box sx={{ flexGrow: 1 }}>
                        <Typography variant="h6" component="h4" sx={{ fontWeight: "bold" }}>
                        {cartItem.name}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                        ${(cartItem.priceCents / 100).toFixed(2)} each
                        </Typography>
                      </Box>
                      
                      <Button
                        variant="outlined"
                        sx={{
                          bgcolor: canDecreaseQty ? "primary.main" : "primary.contrastText",
                          color: "primary.contrastText",
                          minWidth: '2.2em',
                          px: 0,
                          py: 0.2,
                          borderRadius: 4,
                          fontWeight: "bold"
                        }}
                        disabled={!canDecreaseQty}
                        onClick={() => {
                          // Subtract Quantity Button
                          fetch(`${BACKEND_URL}/api/cart/${cart.userId}/${cartItem.itemId}`, {
                            method: 'PUT',
                            headers: {
                              'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ quantity: cartItem.quantity - 1})
                          }).then(async (res) => {
                              if (!res.ok) return;
                              updateCart();
                            });
                        }}
                      >
                        -
                      </Button>
                      <Box 
                        sx={{
                          border: 1,
                          bgcolor: "", 
                          color: "text.primary",
                          px: 2,
                          py: 0.5,
                          borderRadius: 4,
                          fontWeight: "bold"
                        }}
                      >
                        {cartItem.quantity}
                      </Box>
                      <Button
                        variant="outlined"
                        sx={{
                          bgcolor: "primary.main", 
                          color: "primary.contrastText",
                          minWidth: '2.2em',
                          px: 0,
                          py: 0.2,
                          borderRadius: 4,
                          fontWeight: "bold"
                        }}
                        onClick={() => {
                          // Add Quantity Button
                          fetch(`${BACKEND_URL}/api/cart/${cart.userId}/${cartItem.itemId}`, {
                            method: 'PUT',
                            headers: {
                              'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ quantity: cartItem.quantity + 1})
                          }).then(async (res) => {
                              if (!res.ok) return;
                              updateCart();
                            });
                        }}
                      >
                        +
                      </Button>
                          
                      <Typography variant="h6" sx={{ fontWeight: "bold", minWidth: "80px", textAlign: "right" }}>
                        ${(lineTotal / 100).toFixed(2)}
                      </Typography>

                      <Button
                        variant="text"
                        sx={{
                          minWidth: 0,
                          p: 0.5
                        }}
                        onClick={() => {
                          // Edit Metadata button (for demo purposes, we just set a static value)
                          fetch(`${BACKEND_URL}/api/cart/checkout/${cart.userId}`, {
                            method: 'POST',
                            headers: {
                              'Content-Type': 'application/json',
                            },
                          });
                        }}
                      >
                        Edit
                      </Button>
                      
                      <Button
                        variant="outlined"
                        sx={{
                          minWidth: 0,
                          p: 0.5
                        }}
                        color="error"
                        onClick={() => {
                          // Remove button
                          fetch(`${BACKEND_URL}/api/cart/${cart.userId}/${cartItem.itemId}`, {
                            method: 'DELETE',
                          }).then(async (res) => {
                              if (!res.ok) return;
                              updateCart();
                            });
                        }}
                      >
                        <DeleteIcon></DeleteIcon>
                      </Button>
                    </ListItem>
                  );
                })}
              </List>
            )}
          </Box>
          {cart.items.length > 0 && (
            <>
              <Divider sx={{ my: 2 }} />
              <Typography
                variant="h5"
                component="h3"
                color="text.primary"
                sx={{ textAlign: "right", fontWeight: "bold" }}
              >
                Total: ${(cart.totalPriceCents / 100).toFixed(2)}
              </Typography>
              <Divider sx={{ my: 2 }} />
              <Typography variant="h6">Checkout</Typography>
              <Button
                variant="contained"
                color="primary"
                disabled={checkoutLoading || !cart?.items?.length}
                onClick={async () => {
                  setCheckoutLoading(true);
                  try {
                    const res = await fetch(`${BACKEND_URL}/api/cart/checkout/${cart.userId}`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        userId: cart.userId
                      }),
                    });
                    const data = await res.json();
                    if (res.ok) {
                      alert(`Checkout successful!`);
                      updateCart();
                    } else {
                      alert(`Checkout failed: ${data.error}`);
                    }
                  } catch (error) {
                    alert('Network error during checkout');
                  }
                  setCheckoutLoading(false);
                }}
              >
                {checkoutLoading ? 'Processing...' : 'Checkout'}
              </Button>
            </>
          )}
        </>
      )}
    </Box>
  );
};

export default ShoppingCartPage;