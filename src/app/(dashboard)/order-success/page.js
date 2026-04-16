"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useCart } from "@/app/(dashboard)/context/CartContext";

export const dynamic = "force-dynamic";

// 🔹 Inner component (uses useSearchParams)
function OrderSuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderNumber = searchParams.get("order");

  const { clearCart } = useCart();
  const [order, setOrder] = useState(null);
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    clearCart();

    const lastOrder = localStorage.getItem("lastOrder");
    if (lastOrder) {
      setOrder(JSON.parse(lastOrder));
      localStorage.removeItem("lastOrder");
    }

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          router.push("/");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [clearCart, router]);

  return (
    <section className="min-h-screen bg-[#f8f8f8] px-6 py-20 md:px-10">
      <div className="mx-auto max-w-2xl text-center">
        <div className="rounded-2xl bg-white p-8 shadow">
          <div className="mb-6 flex justify-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
              <svg className="h-10 w-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>

          <h1 className="mb-2 text-3xl font-bold text-black">Order Placed Successfully!</h1>
          <p className="mb-6 text-gray-600">
            Thank you for your order. We'll notify you once it's shipped.
          </p>

          <div className="rounded-lg bg-gray-50 p-4 mb-6">
            <p className="text-sm text-gray-500">Order Number</p>
            <p className="text-xl font-bold text-[#5c5f2a]">
              {orderNumber || "Loading..."}
            </p>
          </div>

          <div className="mb-4">
            <p className="text-sm text-gray-500">
              Redirecting to home page in{" "}
              <span className="font-bold text-[#5c5f2a]">{countdown}</span> seconds...
            </p>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => router.push("/")}
              className="block w-full rounded-full bg-[#5c5f2a] py-3 text-sm font-semibold text-white transition hover:bg-[#4a4d20]"
            >
              Go to Home Now
            </button>

            <Link
              href="/orders"
              className="block w-full rounded-full border-2 border-[#5c5f2a] py-3 text-sm font-semibold text-[#5c5f2a] transition hover:bg-[#5c5f2a] hover:text-white"
            >
              View My Orders
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

// 🔹 Main export with Suspense
export default function OrderSuccessPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <OrderSuccessContent />
    </Suspense>
  );
}