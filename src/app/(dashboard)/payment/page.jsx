"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/app/(dashboard)/context/CartContext";

export default function PaymentPage() {
  const router = useRouter();
  const { cart, cartTotal, clearCart } = useCart();
  const [paymentMethod, setPaymentMethod] = useState("cod");

  const handlePlaceOrder = () => {
    const customerDetails = JSON.parse(
      localStorage.getItem("checkout-details") || "{}"
    );

    const orderData = {
      customer: customerDetails,
      items: cart,
      total: cartTotal,
      paymentMethod,
      orderDate: new Date().toISOString(),
    };

    localStorage.setItem("last-order", JSON.stringify(orderData));
    clearCart();
    router.push("/order-success");
  };

  if (cart.length === 0) {
    return <div className="p-10">No items available for payment.</div>;
  }

  return (
    <div className="mx-auto max-w-4xl p-10">
      <h1 className="mb-6 text-3xl font-bold">Payment</h1>

      <div className="rounded-2xl bg-white p-6 shadow">
        <h2 className="mb-4 text-xl font-bold">Select Payment Method</h2>

        <label className="mb-3 flex items-center gap-3">
          <input
            type="radio"
            name="payment"
            checked={paymentMethod === "cod"}
            onChange={() => setPaymentMethod("cod")}
          />
          Cash on Delivery
        </label>

        <label className="mb-3 flex items-center gap-3">
          <input
            type="radio"
            name="payment"
            checked={paymentMethod === "online"}
            onChange={() => setPaymentMethod("online")}
          />
          Online Payment
        </label>

        <div className="mt-6 flex justify-between text-lg font-bold">
          <span>Total</span>
          <span>₹{cartTotal}</span>
        </div>

        <button
          onClick={handlePlaceOrder}
          className="mt-6 w-full rounded-full bg-[#5c5f2a] px-5 py-3 font-semibold text-white"
        >
          Place Order
        </button>
      </div>
    </div>
  );
}