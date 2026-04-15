"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import { FaMapMarkerAlt, FaSpinner } from "react-icons/fa";
import { toast } from "react-toastify";
import axios from "axios";

export default function CheckoutPage() {
  const router = useRouter();
  const { cart, cartTotal, clearCart } = useCart();
  const { user, isAuthenticated, userLocation, updateUserLocation } = useAuth();
  const [loading, setLoading] = useState(false);
  const [checkingLocation, setCheckingLocation] = useState(false);
  const [nearestWarehouse, setNearestWarehouse] = useState(null);
  const [deliveryAvailable, setDeliveryAvailable] = useState(true);
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    phone: "",
    address: "",
    address2: "",
    city: "",
    state: "",
    pincode: "",
    notes: "",
  });

  useEffect(() => {
    if (!isAuthenticated) {
      toast.error("Please login to continue with checkout");
      router.push("/");
      return;
    }

    if (user) {
      setFormData(prev => ({
        ...prev,
        email: user.email || "",
        fullName: user.name || "",
        phone: user.phone || "",
      }));
    }

    if (cart.length === 0) {
      toast.error("Your cart is empty");
      router.push("/");
      return;
    }

    if (userLocation) {
      checkDeliveryAvailability();
    }
  }, [isAuthenticated, user, cart, router, userLocation]);

  const checkDeliveryAvailability = async () => {
    if (!userLocation?.lat || !userLocation?.lng) return;
    
    setCheckingLocation(true);
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get("/api/products/location-based", {
        params: { 
          city: userLocation.city, 
          lat: userLocation.lat, 
          lng: userLocation.lng 
        },
        headers: { Authorization: token ? `Bearer ${token}` : undefined }
      });
      
      if (res.data.success) {
        setNearestWarehouse(res.data.nearestWarehouse);
        
        const availableProducts = res.data.data || [];
        const cartProductIds = cart.map(item => item.id);
        const hasAvailableProducts = cartProductIds.some(id => 
          availableProducts.some(p => p._id === id)
        );
        
        if (!hasAvailableProducts && availableProducts.length > 0) {
          setDeliveryAvailable(false);
          toast.warning("Some items in your cart may not be available for delivery to your location");
        } else {
          setDeliveryAvailable(true);
        }
      }
    } catch (error) {
      console.error("Error checking delivery:", error);
    } finally {
      setCheckingLocation(false);
    }
  };

  const handleUpdateLocation = async () => {
    const newLocation = await updateUserLocation();
    if (newLocation) {
      checkDeliveryAvailability();
      if (newLocation.city && !formData.city) {
        setFormData(prev => ({ ...prev, city: newLocation.city }));
      }
    }
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

 // In checkout/page.js - Update the transformCartItems function
const transformCartItems = () => {
  // Validate cart exists
  if (!cart || cart.length === 0) {
    toast.error("Your cart is empty");
    return [];
  }
  
  // ✅ Get the REAL companyId from cart items (NOT warehouse ID)
  let companyId = null;
  let validItem = null;
  
  for (const item of cart) {
    if (item.companyId) {
      companyId = item.companyId;
      validItem = item;
      break;
    }
  }
  
  if (!companyId) {
    console.error("No companyId found in any cart item:", cart);
    toast.error("Invalid product configuration. Please remove items and try again.");
    return [];
  }
  
  console.log("✅ Using REAL companyId for order:", companyId);
  console.log("Warehouse ID (for reference):", cart[0]?.warehouseId);
  
  // Validate companyId format (should be MongoDB ObjectId)
  const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(companyId);
  if (!isValidObjectId) {
    console.error("Invalid companyId format:", companyId);
    toast.error("Invalid company configuration. Please contact support.");
    return [];
  }
  
  return cart.map(item => {
    const gstRate = 18;
    const unitPrice = item.price;
    const discount = item.discount || 0;
    const quantity = item.quantity;
    const priceAfterDiscount = unitPrice - discount;
    const totalAmount = quantity * priceAfterDiscount;
    
    const cgstAmount = totalAmount * (gstRate / 2 / 100);
    const sgstAmount = totalAmount * (gstRate / 2 / 100);
    const gstAmount = cgstAmount + sgstAmount;
    
    return {
      item: item.id,
      itemCode: item.code || `ITEM-${item.id}`,
      itemName: item.name,
      itemDescription: item.description || "",
      quantity: quantity,
      orderedQuantity: quantity,
      unitPrice: unitPrice,
      discount: discount,
      freight: 0,
      gstRate: gstRate,
      taxOption: "GST",
      priceAfterDiscount: priceAfterDiscount,
      totalAmount: totalAmount,
      gstAmount: gstAmount,
      cgstAmount: cgstAmount,
      sgstAmount: sgstAmount,
      igstAmount: 0,
      tdsAmount: 0,
      warehouse: item.warehouseId || null,
      warehouseName: item.warehouseName || "",
      warehouseCode: "",
      stockAdded: false,
      companyId: companyId, // ✅ Use the validated company ID
      selectedSize: item.selectedSize,
      selectedVariant: item.selectedVariant || null
    };
  });
};

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.fullName || !formData.phone || !formData.address || !formData.city || !formData.state || !formData.pincode) {
      toast.error("Please fill all required fields");
      return;
    }

    if (!deliveryAvailable) {
      toast.error("Delivery not available to your location for some items");
      return;
    }

    setLoading(true);

    try {
      const token = localStorage.getItem("token");
      const items = transformCartItems();
      
      if (items.length === 0) {
        toast.error("No valid items in cart");
        setLoading(false);
        return;
      }
      
      // Get companyId from first item
      const companyId = items[0]?.companyId;
      
      if (!companyId) {
        toast.error("Invalid product configuration. Please contact support.");
        setLoading(false);
        return;
      }
      
      // Calculate totals
      const totalBeforeDiscount = items.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
      const subtotal = items.reduce((sum, item) => sum + item.totalAmount, 0);
      const gstAmount = items.reduce((sum, item) => sum + item.gstAmount, 0);
      const cgstAmount = items.reduce((sum, item) => sum + item.cgstAmount, 0);
      const sgstAmount = items.reduce((sum, item) => sum + item.sgstAmount, 0);
      const grandTotal = subtotal + gstAmount;
      
      // Prepare order data with companyId
      const orderData = {
        customer: user?.id,
        customerCode: `CUST-${user?.phone}`,
        customerName: formData.fullName,
        contactPerson: formData.fullName,
        refNumber: `REF-${Date.now()}`,
        status: "Pending",
        orderDate: new Date(),
        expectedDeliveryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        documentDate: new Date(),
        companyId: companyId, // IMPORTANT: Set companyId from the item
        createdBy: user?.id,
        billingAddress: {
          address1: formData.address,
          address2: formData.address2,
          city: formData.city,
          state: formData.state,
          zip: formData.pincode,
          country: "India"
        },
        shippingAddress: {
          address1: formData.address,
          address2: formData.address2,
          city: formData.city,
          state: formData.state,
          zip: formData.pincode,
          country: "India"
        },
        items: items,
        salesEmployee: formData.fullName,
        remarks: formData.notes,
        freight: 0,
        rounding: 0,
        totalBeforeDiscount: totalBeforeDiscount,
        totalDownPayment: 0,
        appliedAmounts: 0,
        gstAmount: gstAmount,
        cgstAmount: cgstAmount,
        sgstAmount: sgstAmount,
        igstAmount: 0,
        grandTotal: grandTotal,
        openBalance: grandTotal,
        paymentMethod: "COD",
        paymentStatus: "Pending",
        orderSource: "ecommerce",
        customerPhone: user?.phone
      };

      console.log("Submitting order:", { companyId, itemCount: items.length });

      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(orderData),
      });

      const data = await response.json();

      if (data.success) {
        toast.success(`Order placed successfully! Order ID: ${data.order?.documentNumberOrder || data.order?.orderNumber}`);
        
        clearCart();
        
        router.push(`/order-success?order=${data.order?.documentNumberOrder || data.order?.orderNumber}`);
      } else {
        toast.error(data.message || "Failed to place order");
      }
    } catch (error) {
      console.error("Checkout error:", error);
      toast.error(error.response?.data?.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (cart.length === 0) {
    return null;
  }

  return (
    <section className="min-h-screen bg-[#f8f8f8] px-6 py-10 md:px-10">
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-8 text-3xl font-bold text-black md:text-4xl">Checkout</h1>

        {/* Location & Warehouse Info */}
        {isAuthenticated && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 bg-white rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <FaMapMarkerAlt className="text-[#6c6d2c]" />
              <span className="text-sm text-gray-600">Delivery Location:</span>
              {userLocation ? (
                <span className="text-sm font-semibold text-gray-800">
                  {userLocation.city}
                  {nearestWarehouse && ` (Serving from: ${nearestWarehouse.name} - ${nearestWarehouse.distance})`}
                </span>
              ) : (
                <span className="text-sm text-gray-500">Not detected</span>
              )}
            </div>
            <button
              onClick={handleUpdateLocation}
              disabled={checkingLocation}
              className="text-sm text-[#6c6d2c] hover:underline flex items-center gap-1"
            >
              {checkingLocation ? <FaSpinner className="animate-spin" /> : <FaMapMarkerAlt />}
              {checkingLocation ? "Checking..." : "Update Location"}
            </button>
          </div>
        )}

        {!deliveryAvailable && (
          <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-xl p-4">
            <p className="text-sm text-yellow-800">
              ⚠️ Some items in your cart may not be available for delivery to your location. 
              Please update your delivery address or remove unavailable items.
            </p>
          </div>
        )}

        <div className="grid gap-8 lg:grid-cols-2">
          {/* Shipping Details Form */}
          <div className="rounded-2xl bg-white p-6 shadow">
            <h2 className="mb-4 text-xl font-bold text-black">Shipping Details</h2>
            
            <form className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  name="fullName"
                  value={formData.fullName}
                  onChange={handleChange}
                  required
                  className="w-full rounded-lg border border-gray-200 px-4 py-2 outline-none focus:border-[#5c5f2a] focus:ring-1 focus:ring-[#5c5f2a]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email *
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  className="w-full rounded-lg border border-gray-200 px-4 py-2 outline-none focus:border-[#5c5f2a] focus:ring-1 focus:ring-[#5c5f2a]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone Number *
                </label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  required
                  className="w-full rounded-lg border border-gray-200 px-4 py-2 outline-none focus:border-[#5c5f2a] focus:ring-1 focus:ring-[#5c5f2a]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Address Line 1 *
                </label>
                <textarea
                  name="address"
                  value={formData.address}
                  onChange={handleChange}
                  required
                  rows="2"
                  className="w-full rounded-lg border border-gray-200 px-4 py-2 outline-none focus:border-[#5c5f2a] focus:ring-1 focus:ring-[#5c5f2a]"
                  placeholder="House number, street, etc."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Address Line 2 (Optional)
                </label>
                <textarea
                  name="address2"
                  value={formData.address2}
                  onChange={handleChange}
                  rows="2"
                  className="w-full rounded-lg border border-gray-200 px-4 py-2 outline-none focus:border-[#5c5f2a] focus:ring-1 focus:ring-[#5c5f2a]"
                  placeholder="Apartment, floor, landmark, etc."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    City *
                  </label>
                  <input
                    type="text"
                    name="city"
                    value={formData.city}
                    onChange={handleChange}
                    required
                    className="w-full rounded-lg border border-gray-200 px-4 py-2 outline-none focus:border-[#5c5f2a] focus:ring-1 focus:ring-[#5c5f2a]"
                    placeholder={userLocation?.city || "Enter city"}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    State *
                  </label>
                  <input
                    type="text"
                    name="state"
                    value={formData.state}
                    onChange={handleChange}
                    required
                    className="w-full rounded-lg border border-gray-200 px-4 py-2 outline-none focus:border-[#5c5f2a] focus:ring-1 focus:ring-[#5c5f2a]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  PIN Code *
                </label>
                <input
                  type="text"
                  name="pincode"
                  value={formData.pincode}
                  onChange={handleChange}
                  required
                  pattern="[0-9]{6}"
                  title="Please enter a valid 6-digit PIN code"
                  className="w-full rounded-lg border border-gray-200 px-4 py-2 outline-none focus:border-[#5c5f2a] focus:ring-1 focus:ring-[#5c5f2a]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Order Notes (Optional)
                </label>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleChange}
                  rows="2"
                  className="w-full rounded-lg border border-gray-200 px-4 py-2 outline-none focus:border-[#5c5f2a] focus:ring-1 focus:ring-[#5c5f2a]"
                  placeholder="Any special instructions?"
                />
              </div>
            </form>
          </div>

          {/* Order Summary */}
          <div className="rounded-2xl bg-white p-6 shadow h-fit">
            <h2 className="mb-4 text-xl font-bold text-black">Order Summary</h2>
            
            {/* Serving Warehouse Info */}
            {nearestWarehouse && (
              <div className="mb-4 p-3 bg-green-50 rounded-lg">
                <p className="text-xs text-green-700 font-semibold">✓ Serving from nearest warehouse</p>
                <p className="text-sm font-medium text-gray-800">{nearestWarehouse.name}</p>
                <p className="text-xs text-gray-500">{nearestWarehouse.distance} from your location</p>
              </div>
            )}
            
            <div className="max-h-80 overflow-y-auto space-y-3 mb-4">
              {cart.map((item, idx) => (
                <div key={idx} className="flex justify-between text-sm">
                  <span>
                    {item.name} ({item.selectedSize}) x {item.quantity}
                  </span>
                  <span className="font-semibold">₹{item.price * item.quantity}</span>
                </div>
              ))}
            </div>
            
            <div className="border-t pt-4 space-y-2">
              <div className="flex justify-between font-semibold">
                <span>Subtotal</span>
                <span>₹{cartTotal}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-600">
                <span>Shipping</span>
                <span>Free</span>
              </div>
              <div className="flex justify-between text-sm text-gray-600">
                <span>GST (18%)</span>
                <span>₹{(cartTotal * 0.18).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-lg font-bold text-[#5c5f2a] pt-2 border-t">
                <span>Total</span>
                <span>₹{(cartTotal * 1.18).toFixed(2)}</span>
              </div>
            </div>

            <div className="mt-6">
              <p className="text-sm text-gray-600 mb-3">
                Payment Method: <strong>Cash on Delivery</strong>
              </p>
              <button
                onClick={handleSubmit}
                disabled={loading || !deliveryAvailable}
                className="w-full rounded-full bg-[#5c5f2a] py-3 text-sm font-semibold text-white transition hover:bg-[#4a4d20] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? <><FaSpinner className="animate-spin inline mr-2" /> Placing Order...</> : "Place Order"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}