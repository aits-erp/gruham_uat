"use client";

import Image from "next/image";
import React, { useState, useEffect } from "react";
import { FaHeart } from "react-icons/fa";
import { useWishlist } from "../../context/WishlistContext";
import { useCart } from "../../context/CartContext";
import { useRouter, useParams } from "next/navigation";
import axios from "axios";
import { toast } from "react-toastify";

const CategoryPage = () => {
  const { toggleWishlist, isInWishlist } = useWishlist();
  const { addToCart } = useCart();
  const router = useRouter();
  const params = useParams();
  const categoryName = params.category;

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openVariantSelector, setOpenVariantSelector] = useState(null);
  const [selectedVariants, setSelectedVariants] = useState({});

  useEffect(() => {
    if (categoryName) {
      fetchCategoryItems();
    }
  }, [categoryName]);

  const fetchCategoryItems = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`/api/items?category=${encodeURIComponent(categoryName)}`);
      
      if (res.data.success) {
        const items = res.data.data || [];
        
        const mappedProducts = items.map(item => ({
          id: item._id,
          name: item.itemName,
          price: item.unitPrice,
          image: item.imageUrl || "/placeholder-image.jpg",
          variants: item.enableVariants ? (item.variants || []) : [],
          hasVariants: item.enableVariants && (item.variants?.length > 0),
          description: item.description,
          category: item.category,
          itemType: item.itemType,
          uom: item.uom,
          totalStock: item.totalStock,
          status: item.status
        }));
        
        // Filter only active products
        const activeProducts = mappedProducts.filter(p => p.status === "active");
        setProducts(activeProducts);
      } else {
        setProducts([]);
      }
    } catch (error) {
      console.error("Error fetching category items:", error);
      toast.error("Failed to load items");
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  const getDiscountedPrice = (price, discount) => {
    if (discount && discount > 0) {
      return price * (1 - discount / 100);
    }
    return price;
  };

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

  const getBestDiscount = (product) => {
    if (product.hasVariants && product.variants.length > 0) {
      const maxDiscount = Math.max(...product.variants.map(v => v.discount || 0));
      return maxDiscount > 0 ? maxDiscount : null;
    }
    return product.discount > 0 ? product.discount : null;
  };

  const handleOpenVariants = (productId) => {
    setOpenVariantSelector(productId);
    const product = products.find(p => p.id === productId);
    if (product && product.hasVariants && product.variants.length > 0) {
      if (!selectedVariants[productId]) {
        setSelectedVariants((prev) => ({
          ...prev,
          [productId]: product.variants[0],
        }));
      }
    }
  };

  const handleVariantSelect = (productId, variant) => {
    setSelectedVariants((prev) => ({
      ...prev,
      [productId]: variant,
    }));
  };

  const handleAddToCart = (product) => {
    if (product.hasVariants) {
      if (!selectedVariants[product.id]) {
        toast.error("Please select a variant");
        return;
      }
      handleConfirmAddToCart(product);
    } else {
      // No variants, add directly
      addToCart({
        id: product.id,
        name: product.name,
        price: product.price,
        img: product.image,
        quantity: 1,
      });
      toast.success(`${product.name} added to cart`);
      router.push("/cart");
    }
  };

  const handleConfirmAddToCart = (product) => {
    const selectedVariant = selectedVariants[product.id];
    
    if (!selectedVariant) {
      toast.error("Please select a variant");
      return;
    }

    const finalPrice = getDiscountedPrice(selectedVariant.price, selectedVariant.discount);
    const finalName = `${product.name} - ${getVariantDisplayName(selectedVariant)}`;

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
      uom: product.uom
    });

    setOpenVariantSelector(null);
    toast.success(`${finalName} added to cart`);
    router.push("/cart");
  };

  const handleBuyNow = (product) => {
    if (product.hasVariants && !selectedVariants[product.id]) {
      toast.error("Please select a variant first");
      return;
    }
    handleAddToCart(product);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f1ea] px-6 py-10">
        <div className="flex flex-col items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#5c5f2a] mb-4"></div>
          <p className="text-gray-600">Loading items...</p>
        </div>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="min-h-screen bg-[#f5f1ea] px-6 py-10">
        <h2 className="mb-10 text-left text-3xl font-bold text-[#1f1f1f]">
          {categoryName || "Category"} (0)
        </h2>
        <div className="text-center py-16">
          <div className="text-6xl mb-4">🛒</div>
          <p className="text-gray-600 text-lg">No items found in this category.</p>
          <button
            onClick={() => router.push("/")}
            className="mt-6 px-6 py-2 bg-[#5c5f2a] text-white rounded-full hover:bg-[#4a4d20] transition"
          >
            Continue Shopping
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f1ea] px-6 py-10">
      <h2 className="mb-10 text-left text-3xl font-bold text-[#1f1f1f]">
        {categoryName} ({products.length})
      </h2>

      <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {products.map((product) => {
          const isFav = isInWishlist(product.id);
          const isOpen = openVariantSelector === product.id;
          const selectedVariant = selectedVariants[product.id];
          const bestDiscount = getBestDiscount(product);
          const isOutOfStock = product.totalStock === 0;

          return (
            <div
              key={product.id}
              className={`rounded-2xl bg-white p-4 text-center shadow-sm transition hover:shadow-md relative group ${isOutOfStock ? 'opacity-60' : ''}`}
            >
              <div className="relative h-56 overflow-hidden rounded-xl bg-[#f3e6d3]">
                <button
                  type="button"
                  onClick={() => {
                    toggleWishlist({
                      id: product.id,
                      name: product.name,
                      price: product.price,
                      img: product.image,
                    });
                  }}
                  className={`absolute top-3 right-3 z-10 rounded-full p-2 shadow transition ${
                    isFav
                      ? "bg-red-500 text-white"
                      : "bg-white text-gray-500 hover:text-red-500"
                  }`}
                >
                  <FaHeart />
                </button>

                <Image
                  src={product.image}
                  alt={product.name}
                  fill
                  className="object-cover group-hover:scale-105 transition duration-300"
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = "/placeholder-image.jpg";
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
                  {product.name}
                </h3>

                <div className="mt-2">
                  <p className="text-lg font-bold text-[#6b7340]">
                    {getProductDisplayPrice(product)}
                  </p>
                  {product.hasVariants && product.variants.length > 0 && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      {product.variants.length} variants available
                    </p>
                  )}
                </div>

                {!isOpen ? (
                  <button
                    type="button"
                    onClick={() => product.hasVariants ? handleOpenVariants(product.id) : handleAddToCart(product)}
                    disabled={isOutOfStock}
                    className={`mt-4 flex w-full items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold text-white transition ${
                      isOutOfStock
                        ? "bg-gray-300 cursor-not-allowed"
                        : "bg-[#5c5f2a] hover:bg-[#4a4d20]"
                    }`}
                  >
                    {isOutOfStock ? "Out of Stock" : (product.hasVariants ? "Select Variant" : "Add to Cart")}
                  </button>
                ) : (
                  <div className="mt-4 rounded-2xl border border-[#e8dfd1] bg-[#faf7f2] p-4">
                    <p className="mb-3 text-sm font-semibold text-[#3d3d3d]">
                      Select {product.itemType === "Service" ? "Service" : "Variant"}
                    </p>

                    <div className="flex flex-wrap justify-center gap-2 max-h-40 overflow-y-auto">
                      {product.variants.map((variant, idx) => {
                        const isSelected = selectedVariant?._id === variant._id;
                        const variantPrice = getDiscountedPrice(variant.price, variant.discount);
                        const variantName = getVariantDisplayName(variant);
                        const hasDiscount = variant.discount > 0;

                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => handleVariantSelect(product.id, variant)}
                            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                              isSelected
                                ? "bg-[#5c5f2a] text-white"
                                : "border border-[#d8d1c4] bg-white text-[#333] hover:border-[#5c5f2a]"
                            }`}
                          >
                            <div className="flex flex-col items-center">
                              <span>{variantName}</span>
                              <span className={`text-xs ${isSelected ? "text-white/80" : "text-gray-500"}`}>
                                ₹{variantPrice.toFixed(2)}
                                {hasDiscount && (
                                  <span className="line-through ml-1 text-gray-400">
                                    ₹{variant.price}
                                  </span>
                                )}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-4 flex gap-3">
                      <button
                        type="button"
                        onClick={() => setOpenVariantSelector(null)}
                        className="w-1/2 rounded-full border border-[#d8d1c4] bg-white px-4 py-2 text-sm font-medium text-[#333] transition hover:bg-[#f3efe8]"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAddToCart(product)}
                        className="w-1/2 rounded-full bg-[#5c5f2a] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#4a4d20]"
                      >
                        Add to Cart
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CategoryPage;