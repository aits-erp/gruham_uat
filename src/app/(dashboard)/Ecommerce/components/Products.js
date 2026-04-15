// app/(dashboard)/products/page.js
"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { FaHeart, FaCheckCircle, FaMapMarkerAlt } from "react-icons/fa";
import { useCart } from "../../context/CartContext";
import { useWishlist } from "../../context/WishlistContext";
import { useRouter } from "next/navigation";
import axios from "axios";
import { toast } from "react-toastify";
import { useAuth } from "../../context/AuthContext";

const PLACEHOLDER_IMAGE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300' viewBox='0 0 400 300'%3E%3Crect width='100%25' height='100%25' fill='%23f3e6d3'/%3E%3Ctext x='50%25' y='50%25' font-family='Arial' font-size='16' fill='%23999999' text-anchor='middle' dy='.3em'%3ENo Image%3C/text%3E%3C/svg%3E";

export default function Products() {
  const { addToCart } = useCart();
  const { toggleWishlist, isInWishlist } = useWishlist();
  const { user, userLocation, isAuthenticated, updateUserLocation } = useAuth();
  const router = useRouter();

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [showCartMessage, setShowCartMessage] = useState(false);
  const [addedItemName, setAddedItemName] = useState("");
  const [locationInfo, setLocationInfo] = useState(null);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [nearestWarehouse, setNearestWarehouse] = useState(null);
  const [globalCompanyId, setGlobalCompanyId] = useState(null);
  
  const hasFetchedRef = useRef(false);
  const isFetchingRef = useRef(false);

  // Fetch all products from item master (for non-logged in users)
  const fetchAllProducts = async () => {
    try {
      const res = await axios.get("/api/items");
      if (res.data.success) {
        const items = res.data.data || [];
        const activeItems = items.filter(item => item.status === "active");
        const mappedProducts = activeItems.map(item => ({
          id: item._id,
          name: item.itemName,
          price: item.unitPrice,
          img: item.imageUrl || PLACEHOLDER_IMAGE,
          variants: item.enableVariants ? (item.variants || []) : [],
          hasVariants: item.enableVariants && (item.variants?.length > 0),
          description: item.description,
          category: item.category,
          itemType: item.itemType,
          uom: item.uom,
          totalStock: 999,
          companyId: null,
          warehouseId: null,
          warehouseName: null
        }));
        setProducts(mappedProducts);
      }
    } catch (error) {
      console.error("Error fetching all products:", error);
      toast.error("Failed to load products");
    }
  };

  // Fetch products based on location (for logged in users)
  const fetchProductsByLocation = async (location) => {
    if (isFetchingRef.current) {
      console.log("Already fetching, skipping...");
      return;
    }
    
    isFetchingRef.current = true;
    setLoading(true);
    
    try {
      const city = location?.city || userLocation?.city || "Unknown";
      const lat = location?.lat || userLocation?.lat;
      const lng = location?.lng || userLocation?.lng;
      
      const token = localStorage.getItem("token");
      
      const res = await axios.get("/api/products/location-based", {
        params: { city, lat, lng },
        headers: {
          Authorization: token ? `Bearer ${token}` : undefined
        }
      });
      
      if (res.data.success) {
        const items = res.data.data || [];
        const nearestWarehouseData = res.data.nearestWarehouse;
        
        // ✅ Get the REAL companyId from response
        const companyId = res.data.companyId || nearestWarehouseData?.companyId;
        
        console.log("✅ Real CompanyId from API:", companyId);
        console.log("Warehouse ID (different from company ID):", nearestWarehouseData?.id);
        
        setGlobalCompanyId(companyId);
        setNearestWarehouse(nearestWarehouseData);
        
        const mappedProducts = items.map(item => ({
          id: item._id,
          name: item.itemName,
          price: item.unitPrice,
          img: item.imageUrl || PLACEHOLDER_IMAGE,
          variants: item.enableVariants ? (item.variants || []) : [],
          hasVariants: item.enableVariants && (item.variants?.length > 0),
          description: item.description,
          category: item.category,
          itemType: item.itemType,
          uom: item.uom,
          totalStock: item.totalStock,
          companyId: companyId, // ✅ Use REAL company ID
          warehouseId: nearestWarehouseData?.id,
          warehouseName: nearestWarehouseData?.name
        }));
        
        console.log("First product companyId:", mappedProducts[0]?.companyId);
        console.log("First product warehouseId:", mappedProducts[0]?.warehouseId);
        
        setProducts(mappedProducts);
        setLocationInfo(res.data.userLocation);
        
        if (mappedProducts.length === 0) {
          toast.info("No products available in your location. Showing all products.");
          await fetchAllProducts();
        }
      } else {
        await fetchAllProducts();
      }
    } catch (error) {
      console.error("Error fetching location-based products:", error);
      await fetchAllProducts();
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  };
  
  // Initial load
  useEffect(() => {
    if (hasFetchedRef.current) return;
    
    const loadProducts = async () => {
      if (isAuthenticated) {
        if (userLocation) {
          await fetchProductsByLocation(userLocation);
        } else {
          setShowLocationModal(true);
          await fetchAllProducts();
          setLoading(false);
        }
      } else {
        await fetchAllProducts();
        setLoading(false);
      }
      hasFetchedRef.current = true;
    };
    
    loadProducts();
  }, [isAuthenticated]);

  // Handle manual location update
  const handleUpdateLocation = async () => {
    const newLocation = await updateUserLocation();
    if (newLocation) {
      hasFetchedRef.current = false;
      await fetchProductsByLocation(newLocation);
      setShowLocationModal(false);
    }
  };

  const getDiscountedPrice = (price, discount) => {
    if (discount && discount > 0) {
      return price * (1 - discount / 100);
    }
    return price;
  };

  const getDisplayPrice = (product) => {
    if (product.hasVariants && product.variants.length > 0) {
      const prices = product.variants.map(v => ({
        original: v.price,
        discounted: getDiscountedPrice(v.price, v.discount),
        discount: v.discount || 0
      }));
      
      const minDiscounted = Math.min(...prices.map(p => p.discounted));
      const maxDiscounted = Math.max(...prices.map(p => p.discounted));
      const hasAnyDiscount = prices.some(p => p.discount > 0);
      
      if (minDiscounted === maxDiscounted) {
        return {
          display: `₹${minDiscounted.toFixed(2)}`,
          hasDiscount: hasAnyDiscount,
          originalPrice: minDiscounted !== prices[0]?.original ? prices[0]?.original : null
        };
      }
      
      return {
        display: `₹${minDiscounted.toFixed(2)} - ₹${maxDiscounted.toFixed(2)}`,
        hasDiscount: hasAnyDiscount,
        originalPrice: null
      };
    }
    
    return {
      display: `₹${product.price}`,
      hasDiscount: false,
      originalPrice: null
    };
  };

  const getBestDiscount = (product) => {
    if (product.hasVariants && product.variants.length > 0) {
      const maxDiscount = Math.max(...product.variants.map(v => v.discount || 0));
      return maxDiscount > 0 ? maxDiscount : null;
    }
    return null;
  };

  const openLoginModal = () => {
    setShowLoginPrompt(false);
    const event = new CustomEvent("openAccountModal");
    window.dispatchEvent(event);
  };

  const handleProductClick = (product) => {
    router.push(`/product/${product.id}`);
  };

  // ✅ Fixed: Handle add to cart with correct IDs
  const handleAddToCart = (product, e) => {
    e.stopPropagation();
    
    if (!isAuthenticated) {
      setShowLoginPrompt(true);
      return;
    }
    
    if (product.totalStock <= 0) {
      toast.error("Out of stock!");
      return;
    }
    
    if (!product.hasVariants || product.variants.length === 0) {
      // Get companyId from product or global state
      let companyId = product.companyId || globalCompanyId;
      
      if (!companyId) {
        console.error("No companyId found for product:", product);
        toast.error("Unable to add to cart. Please refresh and try again.");
        return;
      }
      
      console.log("✅ Adding to cart with:");
      console.log("  - Company ID:", companyId);
      console.log("  - Warehouse ID:", product.warehouseId);
      console.log("  - Warehouse Name:", product.warehouseName);
      
      addToCart({
        id: product.id,
        name: product.name,
        price: product.price,
        img: product.img,
        quantity: 1,
        selectedSize: product.uom || "unit",
        companyId: companyId, // ✅ Real company ID
        warehouseId: product.warehouseId,
        warehouseName: product.warehouseName
      });
      
      setAddedItemName(product.name);
      setShowCartMessage(true);
      setTimeout(() => setShowCartMessage(false), 3000);
    } else {
      router.push(`/product/${product.id}?action=cart`);
    }
  };
  
  const handleBuyNow = (product, e) => {
    e.stopPropagation();
    if (!isAuthenticated) {
      setShowLoginPrompt(true);
      return;
    }
    
    if (product.totalStock <= 0) {
      toast.error("Out of stock!");
      return;
    }
    
    if (!product.hasVariants || product.variants.length === 0) {
      let companyId = product.companyId || globalCompanyId;
      
      if (!companyId) {
        toast.error("Unable to proceed. Please refresh and try again.");
        return;
      }
      
      addToCart({
        id: product.id,
        name: product.name,
        price: product.price,
        img: product.img,
        quantity: 1,
        selectedSize: product.uom || "unit",
        companyId: companyId,
        warehouseId: product.warehouseId,
        warehouseName: product.warehouseName
      });
      router.push("/checkout");
    } else {
      router.push(`/product/${product.id}?action=buy`);
    }
  };

  if (loading) {
    return (
      <section className="min-h-screen bg-[#f5f1ea] px-6 py-10 md:px-10">
        <div className="flex flex-col items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#5c5f2a] mb-4"></div>
          <p className="text-gray-600">
            {isAuthenticated ? "Finding products near you..." : "Loading products..."}
          </p>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="min-h-screen bg-[#f5f1ea] px-6 py-10 md:px-10">
        {/* Location Bar */}
        {isAuthenticated && userLocation && (
          <div className="mb-6 flex items-center justify-between bg-white rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 text-gray-600">
              <FaMapMarkerAlt className="text-[#5c5f2a]" />
              <span className="text-sm">Delivering to:</span>
              <span className="font-semibold text-gray-800">{userLocation.city}</span>
              {locationInfo && (
                <span className="text-xs text-green-600 ml-2">
                  ({products.length} products available)
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

        {/* Nearest Warehouse Section */}
        {isAuthenticated && nearestWarehouse && (
          <div className="mb-6 bg-white rounded-xl p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">
              📍 Serving from nearest warehouse:
            </h3>
            <div className="text-xs bg-gray-100 rounded-lg px-3 py-1.5 inline-block">
              <span className="font-medium">{nearestWarehouse.name}</span>
              {nearestWarehouse.distance && (
                <span className="text-green-600 ml-1">({nearestWarehouse.distance})</span>
              )}
            </div>
          </div>
        )}

        <h2 className="mb-10 text-center text-3xl font-bold text-[#1f1f1f] md:text-4xl">
          Our Delicious Collections ({products.length})
        </h2>

        {/* Success Message Toast */}
        {showCartMessage && (
          <div className="fixed top-20 right-4 z-50 animate-in slide-in-from-right duration-300">
            <div className="bg-green-500 text-white px-6 py-4 rounded-xl shadow-lg flex items-center gap-3">
              <FaCheckCircle className="text-xl" />
              <div>
                <p className="font-semibold">Added to Cart!</p>
                <p className="text-sm opacity-90">{addedItemName}</p>
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

        {products.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">🛒</div>
            <p className="text-gray-600 text-lg">No products available.</p>
            {isAuthenticated && (
              <button
                onClick={handleUpdateLocation}
                className="mt-4 px-6 py-2 bg-[#5c5f2a] text-white rounded-lg"
              >
                Try Different Location
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {products.map((p) => {
              const isFav = isInWishlist(p.id);
              const priceInfo = getDisplayPrice(p);
              const bestDiscount = getBestDiscount(p);
              const isOutOfStock = p.totalStock === 0;

              return (
                <div
                  key={p.id}
                  onClick={() => handleProductClick(p)}
                  className={`rounded-2xl bg-white p-4 text-center shadow-sm transition hover:shadow-md cursor-pointer relative group ${isOutOfStock ? 'opacity-60' : ''}`}
                >
                  <div className="relative h-56 overflow-hidden rounded-xl bg-[#f3e6d3]">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!isAuthenticated) {
                          setShowLoginPrompt(true);
                          return;
                        }
                        toggleWishlist({
                          id: p.id,
                          name: p.name,
                          price: p.price,
                          img: p.img,
                        });
                      }}
                      className={`absolute right-3 top-3 z-10 rounded-full p-2 shadow transition ${
                        isFav
                          ? "bg-red-500 text-white"
                          : "bg-white text-gray-500 hover:text-red-500"
                      }`}
                    >
                      <FaHeart />
                    </button>

                    <Image
                      src={p.img}
                      alt={p.name}
                      fill
                      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw"
                      className="object-cover group-hover:scale-105 transition duration-300"
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = PLACEHOLDER_IMAGE;
                      }}
                    />
                    
                    {bestDiscount && (
                      <div className="absolute left-3 top-3 z-10 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                        {bestDiscount}% OFF
                      </div>
                    )}
                    
                    {isOutOfStock && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10">
                        <span className="bg-red-500 text-white px-3 py-1 rounded-full text-sm font-bold">
                          Out of Stock
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="mt-4">
                    <h3 className="line-clamp-2 text-xl font-semibold text-[#1f1f1f]">
                      {p.name}
                    </h3>

                    <div className="mt-2">
                      {priceInfo.hasDiscount && priceInfo.originalPrice ? (
                        <div>
                          <div className="text-lg font-bold text-[#6b7340]">
                            {priceInfo.display}
                          </div>
                          <div className="text-xs text-gray-400 line-through">
                            ₹{priceInfo.originalPrice}
                          </div>
                        </div>
                      ) : (
                        <div className="text-lg font-bold text-[#6b7340]">
                          {priceInfo.display}
                        </div>
                      )}
                    </div>
                    
                    {isAuthenticated && !isOutOfStock && p.totalStock < 10 && p.totalStock > 0 && (
                      <p className="text-xs text-orange-500 mt-1">
                        Only {p.totalStock} left!
                      </p>
                    )}
                    
                    {p.hasVariants && p.variants[0] && (
                      <p className="text-xs text-gray-500 mt-1">
                        Starting from {p.variants[0].name}
                      </p>
                    )}

                    <div className="space-y-2 mt-4">
                      <button
                        type="button"
                        onClick={(e) => handleAddToCart(p, e)}
                        disabled={isOutOfStock}
                        className={`w-full rounded-full py-3 text-sm font-semibold transition ${
                          isOutOfStock
                            ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                            : "bg-[#5c5f2a] text-white hover:bg-[#4a4d20]"
                        }`}
                      >
                        {isOutOfStock ? "Out of Stock" : "Add to Cart"}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleBuyNow(p, e)}
                        disabled={isOutOfStock}
                        className={`w-full rounded-full border-2 py-3 text-sm font-semibold transition ${
                          isOutOfStock
                            ? "border-gray-300 text-gray-400 cursor-not-allowed"
                            : "border-[#5c5f2a] text-[#5c5f2a] hover:bg-[#5c5f2a] hover:text-white"
                        }`}
                      >
                        Buy Now
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Location Modal */}
      {isAuthenticated && showLocationModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#5c5f2a]/10">
                <FaMapMarkerAlt className="text-2xl text-[#5c5f2a]" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Enable Location</h3>
              <p className="text-gray-600 mb-6">
                Allow location access to see products available in your area for faster delivery.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleUpdateLocation}
                  className="flex-1 rounded-xl bg-[#5c5f2a] px-4 py-2.5 text-white font-semibold hover:bg-[#4a4d20] transition"
                >
                  Allow Location
                </button>
                <button
                  onClick={() => {
                    setShowLocationModal(false);
                  }}
                  className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-gray-700 font-semibold hover:bg-gray-50 transition"
                >
                  Skip
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Login Prompt Modal */}
      {showLoginPrompt && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl animate-in fade-in zoom-in duration-200">
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