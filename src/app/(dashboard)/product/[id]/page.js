"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { FaHeart, FaArrowLeft, FaShoppingCart, FaBolt, FaCheckCircle, FaMapMarkerAlt } from "react-icons/fa";
import { useCart } from "../../context/CartContext";
import { useWishlist } from "../../context/WishlistContext";
import { useAuth } from "../../context/AuthContext";
import axios from "axios";
import { toast } from "react-toastify";

const PLACEHOLDER_IMAGE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300' viewBox='0 0 400 300'%3E%3Crect width='100%25' height='100%25' fill='%23f3e6d3'/%3E%3Ctext x='50%25' y='50%25' font-family='Arial' font-size='16' fill='%23999999' text-anchor='middle' dy='.3em'%3ENo Image%3C/text%3E%3C/svg%3E";

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { addToCart } = useCart();
  const { toggleWishlist, isInWishlist } = useWishlist();
  const { isAuthenticated, user, userLocation, updateUserLocation } = useAuth();

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [showCartMessage, setShowCartMessage] = useState(false);
  const [addedItemName, setAddedItemName] = useState("");
  
  // ✅ Add states for companyId and warehouse (same as Products page)
  const [companyId, setCompanyId] = useState(null);
  const [warehouseId, setWarehouseId] = useState(null);
  const [warehouseName, setWarehouseName] = useState(null);
  const [nearestWarehouse, setNearestWarehouse] = useState(null);
  const [fetchingWarehouse, setFetchingWarehouse] = useState(false);

  // ✅ Fetch nearest warehouse (same as Products page)
  const fetchNearestWarehouse = async () => {
    if (!isAuthenticated || !userLocation?.lat) {
      console.log("Cannot fetch warehouse: not authenticated or no location");
      return null;
    }
    
    setFetchingWarehouse(true);
    
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get("/api/products/location-based", {
        params: { 
          city: userLocation.city || "Unknown", 
          lat: userLocation.lat, 
          lng: userLocation.lng 
        },
        headers: { Authorization: token ? `Bearer ${token}` : undefined }
      });
      
      if (res.data.success && res.data.nearestWarehouse) {
        const warehouse = res.data.nearestWarehouse;
        const whCompanyId = res.data.companyId || warehouse?.companyId;
        const whId = warehouse?.id;
        const whName = warehouse?.name;
        
        if (whCompanyId) {
          setCompanyId(whCompanyId);
          setWarehouseId(whId);
          setWarehouseName(whName);
          setNearestWarehouse(warehouse);
          console.log("✅ CompanyId from warehouse API:", whCompanyId);
          console.log("✅ Warehouse ID:", whId);
          return whCompanyId;
        }
      }
    } catch (error) {
      console.error("Error fetching warehouse:", error);
    } finally {
      setFetchingWarehouse(false);
    }
    return null;
  };

  // ✅ Fetch product details
  useEffect(() => {
    if (params.id) {
      fetchProduct();
    }
  }, [params.id]);

  // ✅ Fetch warehouse when authenticated and location available (same as Products page)
  useEffect(() => {
    if (isAuthenticated && userLocation?.lat) {
      fetchNearestWarehouse();
    }
  }, [isAuthenticated, userLocation]);

  const fetchProduct = async () => {
    setLoading(true);
    try {
      const res = await axios.get("/api/items");
      if (res.data.success) {
        const items = res.data.data || [];
        const foundProduct = items.find(item => item._id === params.id);
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
          router.push("/");
        }
      }
    } catch (error) {
      console.error("Error fetching product:", error);
      toast.error("Failed to load product");
    } finally {
      setLoading(false);
    }
  };

  // Get price after discount
  const getDiscountedPrice = (price, discount) => {
    if (discount && discount > 0) {
      return price * (1 - discount / 100);
    }
    return price;
  };

  // Get price per unit after discount
  const getPricePerUnit = (variant) => {
    let price = getDiscountedPrice(variant.price, variant.discount);
    
    if (!variant.quantity || variant.quantity === 0) return price;
    return price / variant.quantity;
  };

  // Get display price info for variant
  const getVariantPriceInfo = (variant) => {
    const originalPrice = variant.price;
    const discountedPrice = getDiscountedPrice(originalPrice, variant.discount);
    const hasDiscount = variant.discount && variant.discount > 0;
    
    return {
      original: originalPrice,
      discounted: discountedPrice,
      hasDiscount: hasDiscount,
      discountPercent: variant.discount || 0,
      savings: originalPrice - discountedPrice
    };
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

  // ✅ Fixed: Handle add to cart with companyId (same pattern as Products page)
  const handleAddToCart = () => {
    if (!isAuthenticated) {
      setShowLoginPrompt(true);
      return;
    }

    // ✅ Check if user is customer
    if (user?.type !== "customer") {
      toast.error("Please login with a customer account to add items to cart");
      setShowLoginPrompt(true);
      return;
    }

    // ✅ Check for companyId (same as Products page)
    if (!companyId) {
      console.error("Missing companyId. Cannot add to cart.");
      toast.error("Location not detected. Please allow location access and try again.");
      return;
    }

    let finalPrice, finalSize, itemName;
    if (product.hasVariants && selectedVariant) {
      const pricePerUnit = getPricePerUnit(selectedVariant);
      finalPrice = pricePerUnit * quantity;
      finalSize = getVariantDisplayName(selectedVariant, product.uom);
      itemName = `${product.name} (${finalSize})`;
    } else {
      finalPrice = product.price * quantity;
      finalSize = product.uom || "unit";
      itemName = product.name;
    }

    console.log("✅ Adding to cart with:");
    console.log("  - Company ID:", companyId);
    console.log("  - Warehouse ID:", warehouseId);
    console.log("  - Product:", itemName);
    console.log("  - Price:", finalPrice);
    console.log("  - Quantity:", quantity);

    // ✅ Add to cart with all required fields (same as Products page)
    addToCart({
      id: product.id,
      name: product.name,
      price: finalPrice,
      img: product.img,
      quantity: quantity,
      selectedSize: finalSize,
      variantId: selectedVariant?.id,
      variantName: selectedVariant?.name,
      discount: selectedVariant?.discount || 0,
      originalPrice: selectedVariant?.price || product.price,
      quantityPerUnit: selectedVariant?.quantity,
      companyId: companyId,        // ✅ CRITICAL: Same as Products page
      warehouseId: warehouseId,    // ✅ CRITICAL: Same as Products page
      warehouseName: warehouseName  // ✅ CRITICAL: Same as Products page
    });

    // Show success message
    setAddedItemName(itemName);
    setShowCartMessage(true);
    
    // Auto hide message after 3 seconds
    setTimeout(() => {
      setShowCartMessage(false);
    }, 3000);
  };

  const handleBuyNow = () => {
    if (!isAuthenticated) {
      setShowLoginPrompt(true);
      return;
    }

    // ✅ Check if user is customer
    if (user?.type !== "customer") {
      toast.error("Please login with a customer account to place orders");
      setShowLoginPrompt(true);
      return;
    }

    // ✅ Check for companyId
    if (!companyId) {
      toast.error("Location not detected. Please allow location access and try again.");
      return;
    }

    handleAddToCart();
    setTimeout(() => {
      router.push("/checkout");
    }, 500);
  };

  const handleUpdateLocation = async () => {
    const newLocation = await updateUserLocation();
    if (newLocation) {
      await fetchNearestWarehouse();
      toast.success("Location updated!");
    }
  };

  const openLoginModal = () => {
    setShowLoginPrompt(false);
    const event = new CustomEvent("openAccountModal");
    window.dispatchEvent(event);
  };

  // Calculate current total price with discount
  const getCurrentTotalPrice = () => {
    if (product.hasVariants && selectedVariant) {
      const pricePerUnit = getPricePerUnit(selectedVariant);
      return pricePerUnit * quantity;
    } else {
      return product.price * quantity;
    }
  };

  // Get current price info for display
  const getCurrentPriceInfo = () => {
    if (product.hasVariants && selectedVariant) {
      const priceInfo = getVariantPriceInfo(selectedVariant);
      return {
        ...priceInfo,
        perUnit: getPricePerUnit(selectedVariant)
      };
    } else {
      return {
        original: product.price,
        discounted: product.price,
        hasDiscount: false,
        discountPercent: 0,
        perUnit: product.price
      };
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f1ea] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#5c5f2a]"></div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-[#f5f1ea] flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">🛒</div>
          <h2 className="text-2xl font-bold text-gray-800">Product not found</h2>
          <Link href="/" className="mt-4 inline-block text-[#5c5f2a] hover:underline">
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  const isFav = isInWishlist(product.id);
  const totalPrice = getCurrentTotalPrice();
  const currentPriceInfo = getCurrentPriceInfo();

  return (
    <>
      <div className="min-h-screen bg-[#f5f1ea] py-10">
        <div className="max-w-6xl mx-auto px-4">
          {/* Back Button */}
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-gray-600 hover:text-[#5c5f2a] mb-6 transition"
          >
            <FaArrowLeft /> Back
          </button>

          {/* Location Bar - Same as Products page */}
          {isAuthenticated && (
            <div className="mb-6 flex items-center justify-between bg-white rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2 text-gray-600">
                <FaMapMarkerAlt className="text-[#5c5f2a]" />
                <span className="text-sm">Delivering to:</span>
                {userLocation ? (
                  <span className="font-semibold text-gray-800">{userLocation.city}</span>
                ) : (
                  <span className="text-sm text-gray-500">Location not detected</span>
                )}
                {warehouseName && (
                  <span className="text-xs text-green-600 ml-2">
                    (From: {warehouseName})
                  </span>
                )}
              </div>
              <button
                onClick={handleUpdateLocation}
                className="text-sm text-[#5c5f2a] hover:underline"
              >
                Change Location
              </button>
            </div>
          )}

          {/* Success Message Toast - Same as Products page */}
          {showCartMessage && (
            <div className="fixed top-20 right-4 z-50 animate-in slide-in-from-right duration-300">
              <div className="bg-green-500 text-white px-6 py-4 rounded-xl shadow-lg flex items-center gap-3">
                <FaCheckCircle className="text-xl" />
                <div>
                  <p className="font-semibold">Added to Cart!</p>
                  <p className="text-sm opacity-90">{addedItemName} x {quantity}</p>
                </div>
                <button
                  onClick={() => router.push("/cart")}
                  className="ml-4 bg-white text-green-600 px-3 py-1 rounded-lg text-sm font-semibold hover:bg-gray-100 transition"
                >
                  View Cart
                </button>
              </div>
            </div>
          )}

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
                        const priceInfo = getVariantPriceInfo(variant);
                        const pricePerUnit = getPricePerUnit(variant);
                        
                        return (
                          <button
                            key={variant.id}
                            onClick={() => {
                              setSelectedVariant(variant);
                              setQuantity(1);
                            }}
                            className={`p-4 rounded-xl border-2 text-center transition relative ${
                              isSelected
                                ? "border-[#5c5f2a] bg-[#5c5f2a]/5"
                                : "border-gray-200 hover:border-[#5c5f2a]"
                            }`}
                          >
                            <div className="font-semibold text-gray-800">{variantName}</div>
                            
                            {priceInfo.hasDiscount ? (
                              <>
                                <div className="text-lg font-bold text-[#5c5f2a] mt-1">
                                  ₹{priceInfo.discounted.toFixed(2)}
                                </div>
                                <div className="text-xs text-gray-400 line-through">
                                  ₹{priceInfo.original}
                                </div>
                                <div className="text-xs text-green-600 font-semibold mt-0.5">
                                  {priceInfo.discountPercent}% OFF
                                </div>
                              </>
                            ) : (
                              <div className="text-lg font-bold text-[#5c5f2a] mt-1">
                                ₹{priceInfo.original}
                              </div>
                            )}
                            
                            <div className="text-xs text-gray-500 mt-1">
                              ₹{pricePerUnit.toFixed(2)} per {product.uom || 'unit'}
                            </div>
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

                {/* Total Price with Discount */}
                <div className="mt-6 pt-4 border-t border-gray-200">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Total Amount</span>
                    <div className="text-right">
                      {currentPriceInfo.hasDiscount && (
                        <div className="text-sm text-gray-400 line-through">
                          ₹{(currentPriceInfo.original * quantity).toFixed(2)}
                        </div>
                      )}
                      <div className="text-2xl font-bold text-[#5c5f2a]">
                        ₹{totalPrice.toFixed(2)}
                      </div>
                      {currentPriceInfo.hasDiscount && (
                        <div className="text-xs text-green-600">
                          You save ₹{(currentPriceInfo.savings * quantity).toFixed(2)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="mt-6 flex gap-3">
                  <button
                    onClick={handleAddToCart}
                    disabled={fetchingWarehouse || !companyId}
                    className="flex-1 bg-[#5c5f2a] text-white py-3 rounded-full font-semibold hover:bg-[#4a4d20] transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {fetchingWarehouse ? "Detecting location..." : <><FaShoppingCart /> Add to Cart</>}
                  </button>
                  <button
                    onClick={handleBuyNow}
                    disabled={fetchingWarehouse || !companyId}
                    className="flex-1 border-2 border-[#5c5f2a] text-[#5c5f2a] py-3 rounded-full font-semibold hover:bg-[#5c5f2a] hover:text-white transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {fetchingWarehouse ? "Loading..." : <><FaBolt /> Buy Now</>}
                  </button>
                </div>

                {/* Warning if location not detected - Same as Products page */}
                {isAuthenticated && !companyId && !fetchingWarehouse && (
                  <div className="mt-4 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                    <p className="text-xs text-yellow-800 text-center">
                      ⚠️ Location not detected. Please allow location access to add items to cart.
                    </p>
                    <button
                      onClick={handleUpdateLocation}
                      className="mt-2 text-xs text-[#5c5f2a] font-medium hover:underline w-full text-center"
                    >
                      Enable Location
                    </button>
                  </div>
                )}
              </div>
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
                Please login with a customer account to add items to cart.
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