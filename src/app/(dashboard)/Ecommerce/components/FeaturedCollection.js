"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { FaHeart, FaStar, FaMapMarkerAlt } from "react-icons/fa";
import { useCart } from "../../context/CartContext";
import { useWishlist } from "../../context/WishlistContext";
import { useAuth } from "../../context/AuthContext";
import { useRouter } from "next/navigation";
import axios from "axios";
import { toast } from "react-toastify";

const PLACEHOLDER_IMAGE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300' viewBox='0 0 400 300'%3E%3Crect width='100%25' height='100%25' fill='%23f3e6d3'/%3E%3Ctext x='50%25' y='50%25' font-family='Arial' font-size='16' fill='%23999999' text-anchor='middle' dy='.3em'%3ENo Image%3C/text%3E%3C/svg%3E";

export default function FeaturedCollection({ layout = "left-image" }) {
  const { addToCart } = useCart();
  const { wishlistItems, toggleWishlist, isInWishlist } = useWishlist();
  const { isAuthenticated, user, userLocation, updateUserLocation } = useAuth();
  const router = useRouter();
  const [leftImage, setLeftImage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [allProducts, setAllProducts] = useState([]);
  const [favoriteProducts, setFavoriteProducts] = useState([]);
  const [bestsellerProducts, setBestsellerProducts] = useState([]);
  const [displayProducts, setDisplayProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [openVariantSelector, setOpenVariantSelector] = useState(null);
  const [selectedVariants, setSelectedVariants] = useState({});
  const [nearestWarehouse, setNearestWarehouse] = useState(null);
  const [usingLocation, setUsingLocation] = useState(false);
  const [locationError, setLocationError] = useState(false);
  
  // ✅ Add states for companyId and warehouse
  const [companyId, setCompanyId] = useState(null);
  const [warehouseId, setWarehouseId] = useState(null);
  const [warehouseName, setWarehouseName] = useState(null);

  useEffect(() => {
    const fetchLeftImage = async () => {
      try {
        const res = await fetch('/api/left-image');
        const data = await res.json();
        setLeftImage(data);
      } catch (error) {
        console.error('Error fetching left image:', error);
      }
    };
    fetchLeftImage();
  }, []);

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

  useEffect(() => {
    const loadProducts = async () => {
      if (isAuthenticated && userLocation) {
        await fetchProductsByLocation();
      } else {
        await fetchAllProducts();
      }
    };
    loadProducts();
  }, [isAuthenticated, userLocation]);

  // ✅ Fetch warehouse when authenticated
  useEffect(() => {
    if (isAuthenticated && userLocation?.lat) {
      fetchNearestWarehouse();
    }
  }, [isAuthenticated, userLocation]);

  const handleUpdateLocation = async () => {
    const newLocation = await updateUserLocation();
    if (newLocation) {
      await fetchNearestWarehouse();
      await fetchProductsByLocation(newLocation);
    }
  };

  // Helper function to get discounted price
  const getDiscountedPrice = (price, discount) => {
    if (discount && discount > 0) {
      return price * (1 - discount / 100);
    }
    return price;
  };

  // Get variant display name
  const getVariantDisplayName = (variant) => {
    if (variant.name) return variant.name;
    if (variant.quantity) {
      const uom = variant.uom || "unit";
      if (uom === "KG") {
        return variant.quantity >= 1000 
          ? `${variant.quantity/1000}kg` 
          : `${variant.quantity}gm`;
      }
      if (uom === "LTR") {
        return variant.quantity >= 1000 
          ? `${variant.quantity/1000}L` 
          : `${variant.quantity}ml`;
      }
      return `${variant.quantity} ${uom}`;
    }
    return "Variant";
  };

  // Get product display price (with variants)
  const getProductDisplayPrice = (product) => {
    if (product.hasVariants && product.variants.length > 0) {
      const prices = product.variants.map(v => getDiscountedPrice(v.price, v.discount));
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      
      if (minPrice === maxPrice) {
        return `₹${minPrice.toFixed(2)}`;
      }
      return `₹${minPrice.toFixed(2)} - ₹${maxPrice.toFixed(2)}`;
    }
    return `₹${product.price.toFixed(2)}`;
  };

  const fetchProductsByLocation = async (location = userLocation) => {
    setProductsLoading(true);
    setUsingLocation(true);
    setNearestWarehouse(null);
    setLocationError(false);
    
    try {
      const token = localStorage.getItem("token");
      const lat = location?.lat;
      const lng = location?.lng;
      const city = location?.city || "Unknown";
      
      if (!lat || !lng) {
        await fetchAllProducts();
        return;
      }
      
      const res = await axios.get("/api/products/location-based", {
        params: { city, lat, lng },
        headers: {
          Authorization: token ? `Bearer ${token}` : undefined
        }
      });
      
      if (res.data && res.data.success) {
        const items = res.data.data || [];
        setNearestWarehouse(res.data.nearestWarehouse);
        
        const mappedProducts = items.map(item => ({
          id: item._id,
          name: item.itemName,
          price: item.unitPrice,
          image: item.imageUrl || PLACEHOLDER_IMAGE,
          variants: item.enableVariants ? (item.variants || []) : [],
          hasVariants: item.enableVariants && (item.variants?.length > 0),
          description: item.description,
          category: item.category,
          itemType: item.itemType,
          orderCount: 0,
          uom: item.uom,
          totalStock: item.totalStock,
          warehouse: item.warehouse,
          nearestDistance: item.nearestDistance || item.warehouse?.distance
        }));
        
        setAllProducts(mappedProducts);
        
        const sortedProducts = [...mappedProducts].sort((a, b) => (b.orderCount || 0) - (a.orderCount || 0));
        const topProducts = sortedProducts.slice(0, 6);
        setBestsellerProducts(topProducts);
        
        if (isAuthenticated && wishlistItems) {
          const wishlistProductIds = wishlistItems.map(item => item.productId);
          const favoriteProds = mappedProducts.filter(product => wishlistProductIds.includes(product.id));
          setFavoriteProducts(favoriteProds.slice(0, 3));
        } else {
          setFavoriteProducts([]);
        }
        
        if (mappedProducts.length === 0) {
          toast.info(`No products available at your nearest warehouse`);
        } else if (res.data.nearestWarehouse) {
          toast.success(`Showing products from ${res.data.nearestWarehouse.name}`);
        }
      } else {
        await fetchAllProducts();
      }
    } catch (error) {
      console.error("Error fetching location-based products:", error);
      setLocationError(true);
      if (error.code !== 'ECONNABORTED') {
        toast.error("Could not fetch products for your location. Showing all products.");
      }
      await fetchAllProducts();
    } finally {
      setProductsLoading(false);
      setLoading(false);
    }
  };

  const fetchAllProducts = async () => {
    setProductsLoading(true);
    setUsingLocation(false);
    setNearestWarehouse(null);
    
    try {
      const token = localStorage.getItem("token");
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
      
      const productsRes = await axios.get("/api/items");
      
      if (productsRes.data.success) {
        const items = productsRes.data.data || [];
        
        const activeItems = items.filter(item => item.status === "active");
        
        const mappedProducts = activeItems.map(item => ({
          id: item._id,
          name: item.itemName,
          price: item.unitPrice,
          image: item.imageUrl || PLACEHOLDER_IMAGE,
          variants: item.enableVariants ? (item.variants || []) : [],
          hasVariants: item.enableVariants && (item.variants?.length > 0),
          description: item.description,
          category: item.category,
          itemType: item.itemType,
          orderCount: productOrderCount[item._id] || 0,
          uom: item.uom
        }));
        
        setAllProducts(mappedProducts);
        
        const sortedByOrders = [...mappedProducts].sort((a, b) => b.orderCount - a.orderCount);
        const topProducts = sortedByOrders.slice(0, 6);
        setBestsellerProducts(topProducts);
        
        if (isAuthenticated && wishlistItems) {
          const wishlistProductIds = wishlistItems.map(item => item.productId);
          const favoriteProds = mappedProducts.filter(product => wishlistProductIds.includes(product.id));
          setFavoriteProducts(favoriteProds.slice(0, 3));
        } else {
          setFavoriteProducts([]);
        }
      }
    } catch (error) {
      console.error("Error fetching products:", error);
      toast.error("Failed to load products");
    } finally {
      setProductsLoading(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (favoriteProducts.length > 0 || bestsellerProducts.length > 0) {
      combineProducts();
    }
  }, [favoriteProducts, bestsellerProducts]);

  const combineProducts = () => {
    const combined = [];
    
    combined.push(...favoriteProducts);
    
    if (combined.length < 3 && bestsellerProducts.length > 0) {
      const favoriteIds = new Set(favoriteProducts.map(p => p.id));
      const availableBestsellers = bestsellerProducts.filter(p => !favoriteIds.has(p.id));
      const needed = 3 - combined.length;
      combined.push(...availableBestsellers.slice(0, needed));
    }
    
    setDisplayProducts(combined);
  };

  useEffect(() => {
    if (allProducts.length > 0 && isAuthenticated && wishlistItems) {
      const wishlistProductIds = wishlistItems.map(item => item.productId);
      const favoriteProds = allProducts.filter(product => wishlistProductIds.includes(product.id));
      setFavoriteProducts(favoriteProds.slice(0, 3));
    }
  }, [wishlistItems, allProducts, isAuthenticated]);

  const handleProductClick = (productId) => {
    router.push(`/product/${productId}`);
  };

  const handleOpenVariants = (productId, e) => {
    e.stopPropagation();
    setOpenVariantSelector(productId);
    const product = allProducts.find((p) => p.id === productId);
    if (product && product.hasVariants && product.variants.length > 0) {
      if (!selectedVariants[productId]) {
        setSelectedVariants((prev) => ({
          ...prev,
          [productId]: product.variants[0],
        }));
      }
    }
  };

  const handleVariantSelect = (productId, variant, e) => {
    e.stopPropagation();
    setSelectedVariants((prev) => ({
      ...prev,
      [productId]: variant,
    }));
  };

  // ✅ Fixed: Handle add to cart with companyId
  const handleAddToCart = (product, e) => {
    e.stopPropagation();
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

    if (product.hasVariants) {
      if (!selectedVariants[product.id]) {
        toast.error("Please select a variant");
        return;
      }
      handleConfirmAddToCart(product, e);
    } else {
      // ✅ Add to cart with companyId for regular products
      addToCart({
        id: product.id,
        name: product.name,
        price: product.price,
        img: product.image,
        quantity: 1,
        companyId: companyId,
        warehouseId: warehouseId,
        warehouseName: warehouseName
      });
      toast.success(`${product.name} added to cart`);
      router.push("/cart");
    }
  };

  const handleConfirmAddToCart = (product, e) => {
    e.stopPropagation();
    const selectedVariant = selectedVariants[product.id];
    
    if (!selectedVariant) {
      toast.error("Please select a variant");
      return;
    }

    const finalPrice = getDiscountedPrice(selectedVariant.price, selectedVariant.discount);
    const finalName = `${product.name} - ${getVariantDisplayName(selectedVariant)}`;

    // ✅ Add to cart with companyId for variants
    addToCart({
      id: product.id,
      name: finalName,
      price: finalPrice,
      originalPrice: selectedVariant.price,
      img: product.image,
      quantity: 1,
      variantId: selectedVariant._id,
      variantName: getVariantDisplayName(selectedVariant),
      variantQuantity: selectedVariant.quantity,
      uom: product.uom,
      companyId: companyId,
      warehouseId: warehouseId,
      warehouseName: warehouseName
    });

    setOpenVariantSelector(null);
    toast.success(`${finalName} added to cart`);
    router.push("/cart");
  };

  const handleFavourite = async (product, e) => {
    e.stopPropagation();
    if (!isAuthenticated) {
      toast.error("Please login to add to wishlist");
      const event = new CustomEvent("openAccountModal");
      window.dispatchEvent(event);
      return;
    }
    
    await toggleWishlist({
      id: product.id,
      name: product.name,
      price: product.price,
      img: product.image,
    });
  };

  const wishlistProductIds = wishlistItems?.map(item => item.productId) || [];

  const ProductCard = ({ product, isBestseller = false, rank = null }) => {
    const isFav = isInWishlist(product.id);
    const isOpen = openVariantSelector === product.id;
    const selectedVariant = selectedVariants[product.id];
    const displayPrice = getProductDisplayPrice(product);
    const hasVariants = product.hasVariants && product.variants.length > 0;

    return (
      <div 
        onClick={() => handleProductClick(product.id)}
        className="flex min-h-[340px] cursor-pointer flex-col rounded-[24px] bg-[#f7f7f5] p-5 shadow-md transition hover:shadow-lg hover:scale-[1.02]"
      >
        <div className="relative mb-4">
          <button
            type="button"
            onClick={(e) => handleFavourite(product, e)}
            className={`absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white shadow transition ${
              isFav ? "text-red-500" : "text-gray-500 hover:text-red-500"
            }`}
          >
            <FaHeart className="text-sm" />
          </button>

          <div className="relative h-[170px] w-full overflow-hidden rounded-[16px] bg-[#ddd1af]">
            <Image
              src={product.image}
              alt={product.name}
              fill
              className="object-cover"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = PLACEHOLDER_IMAGE;
              }}
            />
          </div>
          
          {isFav ? (
            <div className="absolute top-2 left-2 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
              <FaHeart className="text-[8px]" /> Favorite
            </div>
          ) : isBestseller && rank && (
            <div className="absolute top-2 left-2 bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
              <FaStar className="text-yellow-300 text-[8px]" />
              #{rank} Bestseller
            </div>
          )}

          {isAuthenticated && usingLocation && product.nearestDistance && !isFav && (
            <div className="absolute bottom-2 left-2 bg-black/70 text-white text-[9px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1">
              <FaMapMarkerAlt className="text-[8px]" />
              {product.nearestDistance} away
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col text-center">
          <h3 className="text-[18px] font-semibold leading-snug text-black line-clamp-2">
            {product.name}
          </h3>
          
          <p className="mt-1 text-[17px] font-semibold text-[#6c6d2c]">{displayPrice}</p>
          
          {hasVariants && (
            <p className="text-xs text-gray-500 mt-0.5">
              {product.variants.length} variants available
            </p>
          )}

          <div className="mt-4">
            {!isOpen ? (
              <button
                type="button"
                onClick={(e) => hasVariants ? handleOpenVariants(product.id, e) : handleAddToCart(product, e)}
                className="flex h-[40px] w-full items-center justify-center rounded-full bg-[#6c6d2c] text-sm font-semibold text-white transition hover:bg-[#5c5d24]"
              >
                {hasVariants ? "Select Variant" : "Add to Cart"}
              </button>
            ) : (
              <div className="rounded-[16px] border border-[#ddd3c3] bg-[#faf7f2] p-3">
                <p className="mb-3 text-sm font-semibold text-[#333]">
                  Select {product.itemType === "Service" ? "Service" : "Variant"}
                </p>
                <div className="flex flex-wrap justify-center gap-2 max-h-32 overflow-y-auto">
                  {product.variants.map((variant, idx) => {
                    const isSelected = selectedVariant?._id === variant._id;
                    const variantPrice = getDiscountedPrice(variant.price, variant.discount);
                    const variantName = getVariantDisplayName(variant);
                    const hasDiscount = variant.discount > 0;

                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={(e) => handleVariantSelect(product.id, variant, e)}
                        className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                          isSelected 
                            ? "bg-[#6c6d2c] text-white" 
                            : "border border-[#d8d1c4] bg-white text-[#333] hover:border-[#6c6d2c]"
                        }`}
                      >
                        <div className="flex flex-col items-center">
                          <span>{variantName}</span>
                          <span className={`text-[10px] ${isSelected ? "text-white/80" : "text-gray-500"}`}>
                            ₹{variantPrice.toFixed(2)}
                            {hasDiscount && (
                              <span className="line-through ml-1">₹{variant.price}</span>
                            )}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenVariantSelector(null);
                    }}
                    className="w-1/2 rounded-full border border-[#d8d1c4] bg-white px-3 py-2 text-xs font-medium text-[#333] transition hover:bg-[#f3efe8]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleAddToCart(product, e)}
                    className="w-1/2 rounded-full bg-[#6c6d2c] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#5c5d24]"
                  >
                    Add to Cart
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  if (loading || productsLoading) {
    return (
      <section className="w-full bg-[#f5f1ea] px-4 py-4">
        <div className="overflow-hidden border-[3px] border-[#2f2f2f] bg-[#ddd1af] shadow-[0_0_0_2px_#5a5a5a]">
          <div className="grid min-h-[620px] grid-cols-1 lg:grid-cols-2">
            <div className="relative min-h-[360px] lg:min-h-[620px] bg-gray-300 animate-pulse" />
            <div className="flex flex-col justify-center bg-[#ddd1af] px-6 py-10 md:px-8">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#6c6d2c] mx-auto mb-4"></div>
                <p className="text-gray-600">
                  {isAuthenticated ? "Finding products near you..." : "Loading products..."}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="w-full bg-[#f5f1ea] px-4 py-4">
      <div className="overflow-hidden border-[3px] border-[#2f2f2f] bg-[#ddd1af] shadow-[0_0_0_2px_#5a5a5a]">
        <div className="grid min-h-[620px] grid-cols-1 lg:grid-cols-2">
          <div className="relative min-h-[360px] lg:min-h-[620px]">
            <Image
              src={leftImage?.imageUrl || "/maker15.jpg"}
              alt={leftImage?.alt || "Featured Collection"}
              fill
              priority
              className="object-cover"
            />
          </div>

          <div className="flex flex-col justify-center bg-[#ddd1af] px-6 py-10 md:px-8">
            <div className="mx-auto w-full max-w-[700px]">
              {isAuthenticated && usingLocation && nearestWarehouse && (
                <div className="mb-4 flex items-center justify-center gap-2 bg-white/80 rounded-full px-3 py-1.5 text-sm w-fit mx-auto">
                  <FaMapMarkerAlt className="text-[#6c6d2c] text-xs" />
                  <span className="text-gray-600">Serving from:</span>
                  <span className="font-semibold text-[#6c6d2c]">{nearestWarehouse.name}</span>
                  <span className="text-gray-400 text-xs">({nearestWarehouse.distance})</span>
                </div>
              )}

              <div className="mb-8 text-center">
                <h2 className="text-[30px] font-extrabold text-black md:text-[36px]">
                  {isAuthenticated && usingLocation && nearestWarehouse
                    ? `Products from ${nearestWarehouse.name.split(' ')[0]}`
                    : isAuthenticated 
                      ? "❤️ My Favorites" 
                      : "🏆 Bestsellers"}
                </h2>
                <p className="mt-2 text-sm text-[#333] md:text-[15px]">
                  {isAuthenticated && usingLocation && nearestWarehouse
                    ? `Available at your nearest warehouse (${nearestWarehouse.distance} away)`
                    : isAuthenticated 
                      ? `Showing ${favoriteProducts.length} favorite${favoriteProducts.length !== 1 ? 's' : ''} and ${displayProducts.length - favoriteProducts.length} bestseller${displayProducts.length - favoriteProducts.length !== 1 ? 's' : ''}`
                      : "Our most popular products loved by customers"}
                </p>
                
                {isAuthenticated && (
                  <div className="mt-3 flex justify-center gap-2">
                    <button
                      onClick={handleUpdateLocation}
                      className="px-4 py-1.5 rounded-full text-xs font-medium transition-all bg-[#6c6d2c] text-white hover:bg-[#5c5d24] flex items-center gap-1"
                    >
                      <FaMapMarkerAlt className="text-[10px]" />
                      {usingLocation ? "Refresh Location" : "Enable Location"}
                    </button>
                  </div>
                )}
              </div>

              {!isAuthenticated ? (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">🔒</div>
                  <p className="text-gray-600 mb-4">Login to see your favorites & view bestsellers</p>
                  <button
                    onClick={() => {
                      const event = new CustomEvent("openAccountModal");
                      window.dispatchEvent(event);
                    }}
                    className="px-6 py-2 rounded-full bg-[#6c6d2c] text-white hover:bg-[#5c5d24] transition"
                  >
                    Login Now
                  </button>
                </div>
              ) : displayProducts.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">🏪</div>
                  <p className="text-gray-600">
                    {usingLocation && locationError
                      ? "Unable to fetch products for your location. Showing all products."
                      : usingLocation 
                        ? `No products available at ${nearestWarehouse?.name || 'nearest warehouse'}.`
                        : "No products available at the moment."}
                  </p>
                  {usingLocation && (
                    <button
                      onClick={handleUpdateLocation}
                      className="mt-4 px-6 py-2 rounded-full bg-[#6c6d2c] text-white hover:bg-[#5c5d24] transition"
                    >
                      Try Again
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {displayProducts.map((product, index) => {
                      const isFavorite = favoriteProducts.some(fav => fav.id === product.id);
                      const bestsellerRank = !isFavorite ? bestsellerProducts.findIndex(b => b.id === product.id) + 1 : null;
                      
                      return (
                        <ProductCard 
                          key={product.id} 
                          product={product} 
                          isBestseller={!isFavorite}
                          rank={bestsellerRank}
                        />
                      );
                    })}
                  </div>
                  
                  {wishlistProductIds.length > 3 && (
                    <div className="mt-8">
                      <Link
                        href="/favourites"
                        className="block w-full rounded-full border-2 border-[#6c6d2c] py-4 text-center text-base font-semibold text-[#6c6d2c] transition hover:bg-[#6c6d2c] hover:text-white"
                      >
                        View All Favorites ({wishlistProductIds.length} items)
                      </Link>
                    </div>
                  )}
                  
                  <div className="mt-4">
                    <Link
                      href="/products"
                      className="block w-full rounded-full bg-[#6c6d2c] py-4 text-center text-base font-semibold text-white transition hover:bg-[#5c5d24]"
                    >
                      View All Products
                    </Link>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}