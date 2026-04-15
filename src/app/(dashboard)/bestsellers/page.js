"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import { useRouter } from "next/navigation";
import { IoCartOutline } from "react-icons/io5";
import { FaMapMarkerAlt } from "react-icons/fa";
import axios from "axios";
import { toast } from "react-toastify";

// Inline SVG placeholder
const PLACEHOLDER_IMAGE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300' viewBox='0 0 400 300'%3E%3Crect width='100%25' height='100%25' fill='%23f3e6d3'/%3E%3Ctext x='50%25' y='50%25' font-family='Arial' font-size='16' fill='%23999999' text-anchor='middle' dy='.3em'%3ENo Image%3C/text%3E%3C/svg%3E";

export default function BestsellersPage() {
  const { addToCart } = useCart();
  const { isAuthenticated, user, userLocation, updateUserLocation } = useAuth();
  const router = useRouter();
  const [bestsellers, setBestsellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nearestWarehouse, setNearestWarehouse] = useState(null);
  const [usingLocation, setUsingLocation] = useState(false);
  
  // ✅ Add states for companyId and warehouse
  const [companyId, setCompanyId] = useState(null);
  const [warehouseId, setWarehouseId] = useState(null);
  const [warehouseName, setWarehouseName] = useState(null);

  useEffect(() => {
    if (isAuthenticated && userLocation) {
      fetchBestsellersByLocation();
    } else if (isAuthenticated && !userLocation) {
      handleUpdateLocation();
    } else {
      fetchAllBestsellers();
    }
  }, [isAuthenticated, userLocation]);

  // ✅ Fetch nearest warehouse to get companyId
  const fetchNearestWarehouse = async () => {
    if (!isAuthenticated || !userLocation?.lat) return null;
    
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
        
        setCompanyId(whCompanyId);
        setWarehouseId(warehouse?.id);
        setWarehouseName(warehouse?.name);
        
        return whCompanyId;
      }
    } catch (error) {
      console.error("Error fetching warehouse:", error);
    }
    return null;
  };

  const handleUpdateLocation = async () => {
    const newLocation = await updateUserLocation();
    if (newLocation) {
      await fetchNearestWarehouse();
      fetchBestsellersByLocation(newLocation);
    } else {
      fetchAllBestsellers();
    }
  };

  // Fetch bestsellers from nearest warehouse (for logged in users)
  const fetchBestsellersByLocation = async (location = userLocation) => {
    setLoading(true);
    setUsingLocation(true);
    setNearestWarehouse(null);
    
    try {
      const token = localStorage.getItem("token");
      const lat = location?.lat;
      const lng = location?.lng;
      const city = location?.city || "Unknown";
      
      if (!lat || !lng) {
        await fetchAllBestsellers();
        return;
      }
      
      // ✅ Fetch warehouse info first
      await fetchNearestWarehouse();
      
      // Fetch products from nearest warehouse
      const productsRes = await axios.get("/api/products/location-based", {
        params: { city, lat, lng },
        headers: {
          Authorization: token ? `Bearer ${token}` : undefined
        },
        timeout: 10000
      });
      
      if (productsRes.data && productsRes.data.success) {
        const items = productsRes.data.data || [];
        setNearestWarehouse(productsRes.data.nearestWarehouse);
        
        // Fetch orders to get order counts (only if authenticated)
        let productOrderCount = {};
        if (isAuthenticated) {
          try {
            const ordersRes = await axios.get("/api/orders", {
              headers: { Authorization: `Bearer ${token}` }
            });

            if (ordersRes.data.success) {
              const orders = ordersRes.data.data || [];
              
              orders.forEach(order => {
                order.items.forEach(item => {
                  const productId = item.productId?._id || item.productId;
                  if (productId) {
                    productOrderCount[productId] = (productOrderCount[productId] || 0) + item.quantity;
                  }
                });
              });
            }
          } catch (orderError) {
            console.log("Could not fetch orders:", orderError);
          }
        }
        
        // Map products with their order counts
        const productsWithCounts = items.map(product => {
          let bestPrice = product.unitPrice;
          let hasDiscount = false;
          let discountPercent = 0;
          let originalPrice = product.unitPrice;
          
          if (product.enableVariants && product.variants && product.variants.length > 0) {
            const variantPrices = product.variants.map(variant => {
              const discountedPrice = variant.discount && variant.discount > 0 
                ? variant.price * (1 - variant.discount / 100)
                : variant.price;
              return {
                price: variant.price,
                discounted: discountedPrice,
                discount: variant.discount || 0
              };
            });
            
            const bestVariant = variantPrices.reduce((min, curr) => 
              curr.discounted < min.discounted ? curr : min, variantPrices[0]);
            
            bestPrice = bestVariant.discounted;
            hasDiscount = bestVariant.discount > 0;
            discountPercent = bestVariant.discount;
            originalPrice = bestVariant.price;
          } else {
            if (product.discount && product.discount > 0) {
              bestPrice = product.unitPrice * (1 - product.discount / 100);
              hasDiscount = true;
              discountPercent = product.discount;
            }
          }
          
          return {
            id: product._id,
            name: product.itemName,
            price: bestPrice,
            originalPrice: originalPrice,
            hasDiscount: hasDiscount,
            discountPercent: discountPercent,
            image: product.imageUrl || PLACEHOLDER_IMAGE,
            orderCount: productOrderCount[product._id] || 0,
            hasVariants: product.enableVariants && product.variants?.length > 0,
            variants: product.variants || [],
            warehouse: product.warehouse,
            nearestDistance: product.nearestDistance || product.warehouse?.distance
          };
        });
        
        // Sort by order count (highest first) and get top 8
        const topBestsellers = productsWithCounts
          .sort((a, b) => b.orderCount - a.orderCount)
          .slice(0, 8);
        
        setBestsellers(topBestsellers);
        
        if (topBestsellers.length === 0) {
          toast.info(`No bestsellers available at your nearest warehouse`);
        } else if (productsRes.data.nearestWarehouse) {
          toast.success(`Showing bestsellers from ${productsRes.data.nearestWarehouse.name} (${productsRes.data.nearestWarehouse.distance})`);
        }
      } else {
        await fetchAllBestsellers();
      }
    } catch (error) {
      console.error("Error fetching bestsellers by location:", error);
      toast.error("Could not fetch bestsellers for your location. Showing all bestsellers.");
      await fetchAllBestsellers();
    } finally {
      setLoading(false);
    }
  };

  // Fetch all bestsellers from item master (for non-logged in users)
  const fetchAllBestsellers = async () => {
    setLoading(true);
    setUsingLocation(false);
    setNearestWarehouse(null);
    
    try {
      const token = localStorage.getItem("token");
      let productOrderCount = {};
      
      // Only fetch orders if authenticated
      if (isAuthenticated) {
        try {
          const ordersRes = await axios.get("/api/orders", {
            headers: { Authorization: `Bearer ${token}` }
          });

          if (ordersRes.data.success) {
            const orders = ordersRes.data.data || [];
            
            orders.forEach(order => {
              order.items.forEach(item => {
                const productId = item.productId?._id || item.productId;
                if (productId) {
                  productOrderCount[productId] = (productOrderCount[productId] || 0) + item.quantity;
                }
              });
            });
          }
        } catch (orderError) {
          console.log("Could not fetch orders:", orderError);
        }
      }

      const productsRes = await axios.get("/api/items");
      
      if (productsRes.data.success) {
        const allProducts = productsRes.data.data || [];
        const activeProducts = allProducts.filter(item => item.status === "active");
        
        const productsWithCounts = activeProducts.map(product => {
          let bestPrice = product.unitPrice;
          let hasDiscount = false;
          let discountPercent = 0;
          let originalPrice = product.unitPrice;
          
          if (product.enableVariants && product.variants && product.variants.length > 0) {
            const variantPrices = product.variants.map(variant => {
              const discountedPrice = variant.discount && variant.discount > 0 
                ? variant.price * (1 - variant.discount / 100)
                : variant.price;
              return {
                price: variant.price,
                discounted: discountedPrice,
                discount: variant.discount || 0
              };
            });
            
            const bestVariant = variantPrices.reduce((min, curr) => 
              curr.discounted < min.discounted ? curr : min, variantPrices[0]);
            
            bestPrice = bestVariant.discounted;
            hasDiscount = bestVariant.discount > 0;
            discountPercent = bestVariant.discount;
            originalPrice = bestVariant.price;
          } else {
            if (product.discount && product.discount > 0) {
              bestPrice = product.unitPrice * (1 - product.discount / 100);
              hasDiscount = true;
              discountPercent = product.discount;
            }
          }
          
          return {
            id: product._id,
            name: product.itemName,
            price: bestPrice,
            originalPrice: originalPrice,
            hasDiscount: hasDiscount,
            discountPercent: discountPercent,
            image: product.imageUrl || PLACEHOLDER_IMAGE,
            orderCount: productOrderCount[product._id] || 0,
            hasVariants: product.enableVariants && product.variants?.length > 0,
            variants: product.variants || []
          };
        });
        
        const topBestsellers = productsWithCounts
          .sort((a, b) => b.orderCount - a.orderCount)
          .slice(0, 8);
        
        setBestsellers(topBestsellers);
      }
    } catch (error) {
      console.error("Error fetching bestsellers:", error);
      toast.error("Failed to load bestsellers");
      setBestsellers([]);
    } finally {
      setLoading(false);
    }
  };

  // ✅ Fixed: Handle add to cart with companyId
  const handleAddToCart = (item) => {
    if (!isAuthenticated) {
      toast.error("Please login to add to cart");
      const event = new CustomEvent("openAccountModal");
      window.dispatchEvent(event);
      return;
    }

    // ✅ Check if user is customer
    if (user?.type !== "customer") {
      toast.error("Please login with a customer account to add items to cart");
      const event = new CustomEvent("openAccountModal");
      window.dispatchEvent(event);
      return;
    }

    // ✅ Check for companyId
    if (!companyId) {
      toast.error("Location not detected. Please allow location access and try again.");
      return;
    }

    if (item.hasVariants) {
      router.push(`/product/${item.id}?action=cart`);
      return;
    }

    // ✅ Add to cart with companyId (same as Products page)
    addToCart({
      id: item.id,
      name: item.name,
      price: item.price,
      img: item.image,
      quantity: 1,
      selectedSize: "unit",
      originalPrice: item.originalPrice,
      discount: item.discountPercent,
      companyId: companyId,        // ✅ CRITICAL: Add companyId
      warehouseId: warehouseId,
      warehouseName: warehouseName
    });
    
    toast.success("Added to cart");
    router.push("/cart");
  };

  const getVariantDisplayInfo = (item) => {
    if (item.hasVariants && item.variants.length > 0) {
      const firstVariant = item.variants[0];
      let variantName = firstVariant.name;
      
      if (!variantName && firstVariant.quantity) {
        const uom = firstVariant.uom || "unit";
        if (uom === "KG") {
          variantName = firstVariant.quantity >= 1000 
            ? `${firstVariant.quantity/1000}kg` 
            : `${firstVariant.quantity}gm`;
        } else if (uom === "LTR") {
          variantName = firstVariant.quantity >= 1000 
            ? `${firstVariant.quantity/1000}L` 
            : `${firstVariant.quantity}ml`;
        } else {
          variantName = `${firstVariant.quantity} ${uom}`;
        }
      }
      
      return variantName || `${item.variants.length} variants`;
    }
    return null;
  };

  // Loading state
  if (loading) {
    return (
      <main className="min-h-screen bg-[#f5f1ea] px-6 py-12 md:px-10">
        <div className="mx-auto max-w-7xl">
          <h1 className="mb-10 text-center text-3xl font-bold text-[#1f1f1f] md:text-4xl">
            Bestsellers
          </h1>
          <div className="flex flex-col items-center justify-center min-h-[400px]">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#5c5f2a] mb-4"></div>
            <p className="text-gray-600">
              {isAuthenticated && usingLocation ? "Finding bestsellers near you..." : "Loading bestsellers..."}
            </p>
          </div>
        </div>
      </main>
    );
  }

  // No products state
  if (bestsellers.length === 0) {
    return (
      <main className="min-h-screen bg-[#f5f1ea] px-6 py-12 md:px-10">
        <div className="mx-auto max-w-7xl">
          <h1 className="mb-10 text-center text-3xl font-bold text-[#1f1f1f] md:text-4xl">
            Bestsellers
          </h1>
          
          {/* Location Indicator */}
          {isAuthenticated && usingLocation && nearestWarehouse && (
            <div className="mb-6 flex items-center justify-center gap-2 bg-white/80 rounded-full px-3 py-1.5 text-sm w-fit mx-auto">
              <FaMapMarkerAlt className="text-[#6c6d2c] text-xs" />
              <span className="text-gray-600">Serving from:</span>
              <span className="font-semibold text-[#6c6d2c]">{nearestWarehouse.name}</span>
              <span className="text-gray-400 text-xs">({nearestWarehouse.distance})</span>
            </div>
          )}
          
          <div className="text-center py-16">
            <div className="text-6xl mb-4">🏆</div>
            <p className="text-gray-600 text-lg">
              {isAuthenticated && usingLocation 
                ? `No bestsellers available at ${nearestWarehouse?.name || 'nearest warehouse'}.`
                : "No bestsellers available yet."}
            </p>
            <p className="text-gray-500 mt-2">
              {isAuthenticated && usingLocation 
                ? "Please try changing your location or check back later!"
                : "Login to see personalized bestsellers or check back later!"}
            </p>
            {isAuthenticated && usingLocation && (
              <button
                onClick={handleUpdateLocation}
                className="mt-6 px-6 py-2 rounded-full bg-[#5c5f2a] text-white hover:bg-[#4a4d20] transition flex items-center gap-2 mx-auto"
              >
                <FaMapMarkerAlt className="text-sm" />
                Try Different Location
              </button>
            )}
            {!isAuthenticated && (
              <button
                onClick={() => {
                  const event = new CustomEvent("openAccountModal");
                  window.dispatchEvent(event);
                }}
                className="mt-6 px-6 py-2 rounded-full bg-[#5c5f2a] text-white hover:bg-[#4a4d20] transition"
              >
                Login to See Bestsellers
              </button>
            )}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f5f1ea] px-6 py-12 md:px-10">
      <div className="mx-auto max-w-7xl">
        
        {/* Heading */}
        <h1 className="mb-10 text-center text-3xl font-bold text-[#1f1f1f] md:text-4xl">
          Bestsellers
        </h1>

        {/* Location Indicator */}
        {isAuthenticated && usingLocation && nearestWarehouse && (
          <div className="mb-6 flex items-center justify-center gap-2 bg-white/80 rounded-full px-3 py-1.5 text-sm w-fit mx-auto">
            <FaMapMarkerAlt className="text-[#6c6d2c] text-xs" />
            <span className="text-gray-600">Serving from:</span>
            <span className="font-semibold text-[#6c6d2c]">{nearestWarehouse.name}</span>
            <span className="text-gray-400 text-xs">({nearestWarehouse.distance})</span>
          </div>
        )}

        {/* Grid */}
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {bestsellers.map((item) => {
            const variantInfo = getVariantDisplayInfo(item);
            
            return (
              <div
                key={item.id}
                className="rounded-2xl bg-white p-4 text-center shadow-sm transition hover:shadow-md group cursor-pointer relative"
                onClick={() => router.push(`/product/${item.id}`)}
              >
                {/* Image */}
                <div className="relative h-56 overflow-hidden rounded-xl bg-[#f3e6d3]">
                  <Image
                    src={item.image}
                    alt={item.name}
                    fill
                    className="object-cover group-hover:scale-105 transition duration-300"
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = PLACEHOLDER_IMAGE;
                    }}
                  />
                  
                  {/* Order Count Badge */}
                  {item.orderCount > 0 && (
                    <div className="absolute top-2 right-2 bg-[#6c6d2c] text-white text-xs font-bold px-2 py-1 rounded-full">
                      🔥 {item.orderCount} orders
                    </div>
                  )}
                  
                  {/* Discount Badge */}
                  {item.hasDiscount && (
                    <div className="absolute bottom-2 right-2 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                      {item.discountPercent}% OFF
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="mt-4">
                  <h2 className="text-[16px] font-semibold text-[#1f1f1f] line-clamp-2">
                    {item.name}
                  </h2>

                  {/* Price with Discount */}
                  <div className="mt-2">
                    {item.hasDiscount ? (
                      <>
                        <p className="text-lg font-bold text-[#6b7340]">
                          ₹{item.price.toFixed(2)}
                        </p>
                        <p className="text-xs text-gray-400 line-through">
                          ₹{item.originalPrice.toFixed(2)}
                        </p>
                        <p className="text-xs text-green-600 font-semibold mt-0.5">
                          Save ₹{(item.originalPrice - item.price).toFixed(2)}
                        </p>
                      </>
                    ) : (
                      <p className="text-lg font-bold text-[#6b7340]">
                        ₹{item.price.toFixed(2)}
                      </p>
                    )}
                  </div>
                  
                  {/* Variant Info */}
                  {variantInfo && (
                    <p className="text-xs text-gray-500 mt-1">
                      Starting from {variantInfo}
                    </p>
                  )}

                  {/* Add to Cart Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAddToCart(item);
                    }}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-[#5c5f2a] py-3 text-sm font-semibold text-white transition hover:bg-[#4a4d20]"
                  >
                    <IoCartOutline className="text-lg" />
                    Add to Cart
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Refresh Location Button */}
        {isAuthenticated && usingLocation && bestsellers.length > 0 && (
          <div className="mt-10 text-center">
            <button
              onClick={handleUpdateLocation}
              className="px-6 py-2 rounded-full border-2 border-[#5c5f2a] text-[#5c5f2a] hover:bg-[#5c5f2a] hover:text-white transition flex items-center gap-2 mx-auto"
            >
              <FaMapMarkerAlt className="text-sm" />
              Refresh Location
            </button>
          </div>
        )}
      </div>
    </main>
  );
}