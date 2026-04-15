// context/CartContext.js
"use client";

import { createContext, useContext, useState, useEffect } from "react";
import { toast } from "react-toastify";

const CartContext = createContext();

export function CartProvider({ children }) {
  const [cartItems, setCartItems] = useState([]);
  const [cartTotal, setCartTotal] = useState(0);

  // Load cart from localStorage on mount
  useEffect(() => {
    const savedCart = localStorage.getItem("cart");
    if (savedCart) {
      try {
        const parsedCart = JSON.parse(savedCart);
        setCartItems(parsedCart);
        console.log("Loaded cart from storage:", parsedCart);
      } catch (e) {
        console.error("Failed to load cart:", e);
      }
    }
  }, []);

  // Save cart to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem("cart", JSON.stringify(cartItems));
    calculateTotal();
  }, [cartItems]);

  const calculateTotal = () => {
    const total = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    setCartTotal(total);
  };

  const addToCart = (product) => {
    console.log("Adding to cart - product received:", product);
    
    // ✅ Validate companyId
    if (!product.companyId) {
      console.error("Missing companyId for product:", product);
      toast.error("Product configuration error. Please try again.");
      return;
    }
    
    const existing = cartItems.find(item => 
      item.id === product.id && item.selectedSize === product.selectedSize
    );
    
    if (existing) {
      setCartItems(prev =>
        prev.map(item =>
          item.id === product.id && item.selectedSize === product.selectedSize
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      );
      toast.info(`Increased ${product.name} quantity`);
    } else {
      const newItem = { 
        ...product, 
        quantity: 1,
        companyId: product.companyId,
        warehouseId: product.warehouseId || null,
        warehouseName: product.warehouseName || null
      };
      console.log("Adding new item to cart:", newItem);
      setCartItems(prev => [...prev, newItem]);
      toast.success(`Added ${product.name} to cart`);
    }
  };

  const removeFromCart = (id, selectedSize) => {
    setCartItems(prev => prev.filter(item => 
      !(item.id === id && item.selectedSize === selectedSize)
    ));
    toast.info("Removed from cart");
  };

  const updateQuantity = (id, selectedSize, newQuantity) => {
    if (newQuantity < 1) {
      removeFromCart(id, selectedSize);
      return;
    }
    
    setCartItems(prev => prev.map(item =>
      item.id === id && item.selectedSize === selectedSize
        ? { ...item, quantity: newQuantity }
        : item
    ));
  };

  const clearCart = () => {
    setCartItems([]);
    localStorage.removeItem("cart");
    toast.info("Cart cleared");
  };

  return (
    <CartContext.Provider value={{
      cart: cartItems,
      cartTotal,
      addToCart,
      removeFromCart,
      updateQuantity,
      clearCart,
      cartCount: cartItems.length
    }}>
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => useContext(CartContext);