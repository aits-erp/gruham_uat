"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { FaHeart, FaShoppingCart, FaBolt } from "react-icons/fa";
import { useCart } from "../../context/CartContext";
import { useWishlist } from "../../context/WishlistContext";
import { useAuth } from "../../context/AuthContext";
import axios from "axios";
import { toast } from "react-toastify";

const PLACEHOLDER_IMAGE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300' viewBox='0 0 400 300'%3E%3Crect width='100%25' height='100%25' fill='%23f3e6d3'/%3E%3Ctext x='50%25' y='50%25' font-family='Arial' font-size='16' fill='%23999999' text-anchor='middle' dy='.3em'%3ENo Image%3C/text%3E%3C/svg%3E";

export default function ProductDetail({ productId, onClose }) {
  const router = useRouter();
  const { addToCart } = useCart();
  const { toggleWishlist, isInWishlist } = useWishlist();
  const { isAuthenticated } = useAuth();

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);

  useEffect(() => {
    if (productId) {
      fetchProduct();
    }
  }, [productId]);

  const fetchProduct = async () => {
    setLoading(true);
    try {
      const res = await axios.get("/api/items");
      if (res.data.success) {
        const items = res.data.data || [];
        const foundProduct = items.find(item => item._id === productId);
        if (foundProduct) {
          const productData = {
            id: foundProduct._id,
            name: foundProduct.itemName,
            price: foundProduct.unitPrice,
            img: foundProduct.imageUrl || PLACEHOLDER_IMAGE,
            variants: foundProduct.enableVariants ? (foundProduct.variants || []) : [],
            hasVariants: foundProduct.enableVariants && (foundProduct.variants?.length > 0),
            description: foundProduct.description,
            category: foundProduct.category,
            itemType: foundProduct.itemType,
            uom: foundProduct.uom
            
          };
          setProduct(productData);
          if (productData.hasVariants && productData.variants.length > 0) {
            setSelectedVariant(productData.variants[0]);
          }
        } else {
          toast.error("Product not found");
          onClose?.();
        }
      }
    } catch (error) {
      console.error("Error fetching product:", error);
      toast.error("Failed to load product");
    } finally {
      setLoading(false);
    }
  };

  const getPricePerUnit = (variant) => {
    if (!variant.quantity || variant.quantity === 0) return variant.price;
    return variant.price / variant.quantity;
  };

  const getVariantDisplayName = (variant, uom) => {
    if (variant.name) return variant.name;
    if (variant.quantity) {
      if (uom === "KG") {
        if (variant.quantity >= 1000) return `${variant.quantity/1000}kg`;
        return `${variant.quantity}gm`;
      }
      if (uom === "LTR") {
        if (variant.quantity >= 1000) return `${variant.quantity/1000}L`;
        return `${variant.quantity}ml`;
      }
      return `${variant.quantity} ${uom || ''}`;
    }
    return "Variant";
  };

  const handleAddToCart = (isBuyNow = false) => {
    if (!isAuthenticated) {
      setShowLoginPrompt(true);
      return;
    }

    let finalPrice, finalSize;
    if (product.hasVariants && selectedVariant) {
      const pricePerUnit = getPricePerUnit(selectedVariant);
      finalPrice = pricePerUnit * quantity;
      finalSize = getVariantDisplayName(selectedVariant, product.uom);
    } else {
      finalPrice = product.price;
      finalSize = product.uom || "unit";
    }

    addToCart({
      id: product.id,
      name: product.name,
      price: finalPrice,
      img: product.img,
      quantity: quantity,
      selectedSize: finalSize,
      variantId: selectedVariant?.id,
      variantName: selectedVariant?.name,
    });

    toast.success("Added to cart");
    
    if (isBuyNow) {
      router.push("/checkout");
    } else {
      router.push("/cart");
    }
  };

  const openLoginModal = () => {
    setShowLoginPrompt(false);
    const event = new CustomEvent("openAccountModal");
    window.dispatchEvent(event);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-lg min-h-[400px] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#5c5f2a]"></div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="bg-white rounded-2xl shadow-lg min-h-[400px] flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">🛒</div>
          <h2 className="text-2xl font-bold text-gray-800">Product not found</h2>
          <button onClick={onClose} className="mt-4 text-[#5c5f2a] hover:underline">
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const isFav = isInWishlist(product.id);
  const totalPrice = product.hasVariants && selectedVariant
    ? (getPricePerUnit(selectedVariant) * quantity).toFixed(2)
    : (product.price * quantity).toFixed(2);

  return (
    <>
      <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
        <div className="grid md:grid-cols-2 gap-8 p-6">
          {/* Product Image */}
          <div className="relative h-96 md:h-[500px] rounded-xl overflow-hidden bg-[#f3e6d3]">
            <Image
              src={product.img}
              alt={product.name}
              fill
              className="object-cover"
              onError={(e) => {
                e.target.src = PLACEHOLDER_IMAGE;
              }}
            />
            <button
              onClick={() => {
                if (!isAuthenticated) {
                  setShowLoginPrompt(true);
                  return;
                }
                toggleWishlist({
                  id: product.id,
                  name: product.name,
                  price: product.price,
                  img: product.img,
                });
                toast.success(isFav ? "Removed from wishlist" : "Added to wishlist");
              }}
              className={`absolute top-4 right-4 rounded-full p-3 shadow-lg transition ${
                isFav
                  ? "bg-red-500 text-white"
                  : "bg-white text-gray-500 hover:text-red-500"
              }`}
            >
              <FaHeart className="text-lg" />
            </button>
          </div>

          {/* Product Info */}
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{product.name}</h1>
            {product.category && (
              <p className="text-sm text-gray-500 mt-1">Category: {product.category}</p>
            )}
            {product.description && (
              <p className="text-gray-600 mt-4 leading-relaxed">{product.description}</p>
            )}

            {/* Variants Selection */}
            {product.hasVariants && product.variants.length > 0 ? (
              <div className="mt-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-3">Select Pack Size</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {product.variants.map((variant) => {
                    const isSelected = selectedVariant?.id === variant.id;
                    const variantName = getVariantDisplayName(variant, product.uom);
                    const pricePerUnit = getPricePerUnit(variant);
                    
                    return (
                      <button
                        key={variant.id}
                        onClick={() => {
                          setSelectedVariant(variant);
                          setQuantity(1);
                        }}
                        className={`p-4 rounded-xl border-2 text-center transition ${
                          isSelected
                            ? "border-[#5c5f2a] bg-[#5c5f2a]/5"
                            : "border-gray-200 hover:border-[#5c5f2a]"
                        }`}
                      >
                        <div className="font-semibold text-gray-800">{variantName}</div>
                        <div className="text-lg font-bold text-[#5c5f2a] mt-1">
                          ₹{variant.price}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          ₹{pricePerUnit.toFixed(2)} per {product.uom || 'unit'}
                        </div>
                        {variant.discount > 0 && (
                          <div className="text-xs text-green-600 mt-1">
                            {variant.discount}% off
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="mt-6">
                <div className="text-2xl font-bold text-[#5c5f2a]">₹{product.price}</div>
                <div className="text-sm text-gray-500 mt-1">per {product.uom || 'unit'}</div>
              </div>
            )}

            {/* Quantity Selector */}
            <div className="mt-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">Quantity</label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="w-10 h-10 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-100 transition"
                >
                  -
                </button>
                <span className="text-xl font-semibold w-12 text-center">{quantity}</span>
                <button
                  onClick={() => setQuantity(quantity + 1)}
                  className="w-10 h-10 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-100 transition"
                >
                  +
                </button>
              </div>
            </div>

            {/* Total Price */}
            <div className="mt-6 pt-4 border-t border-gray-200">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Total Amount</span>
                <span className="text-2xl font-bold text-[#5c5f2a]">₹{totalPrice}</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => handleAddToCart(false)}
                className="flex-1 bg-[#5c5f2a] text-white py-3 rounded-full font-semibold hover:bg-[#4a4d20] transition flex items-center justify-center gap-2"
              >
                <FaShoppingCart /> Add to Cart
              </button>
              <button
                onClick={() => handleAddToCart(true)}
                className="flex-1 border-2 border-[#5c5f2a] text-[#5c5f2a] py-3 rounded-full font-semibold hover:bg-[#5c5f2a] hover:text-white transition flex items-center justify-center gap-2"
              >
                <FaBolt /> Buy Now
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Login Prompt Modal */}
      {showLoginPrompt && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange-100">
                <svg className="w-8 h-8 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6-4h12a2 2 0 012 2v6a2 2 0 01-2 2H6a2 2 0 01-2-2v-6a2 2 0 012-2zm10-10V6a2 2 0 00-2-2H8a2 2 0 00-2 2v2h12z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Login Required</h3>
              <p className="text-gray-600 mb-6">
                Please login to add items to your cart and continue shopping.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={openLoginModal}
                  className="flex-1 rounded-xl bg-[#5c5f2a] px-4 py-2.5 text-white font-semibold hover:bg-[#4a4d20] transition"
                >
                  Login Now
                </button>
                <button
                  onClick={() => setShowLoginPrompt(false)}
                  className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-gray-700 font-semibold hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}