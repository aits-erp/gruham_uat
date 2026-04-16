// components/AccountModal.js
"use client";

import { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { FaPhone, FaTimes, FaUser, FaSpinner, FaMapMarkerAlt, FaExclamationTriangle, FaUserPlus, FaCheckCircle } from "react-icons/fa";
import { toast } from "react-toastify";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function AccountModal({ isOpen, onClose }) {
  const router = useRouter();
  const { user, sendOTP, verifyOTP, logout, updateUserLocation } = useAuth();
  const [step, setStep] = useState("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [capturingLocation, setCapturingLocation] = useState(false);
  const [locationPermissionDenied, setLocationPermissionDenied] = useState(false);
  const [showRegistrationSuccess, setShowRegistrationSuccess] = useState(false);



  // Check if user just registered
  useEffect(() => {
    const justRegistered = localStorage.getItem("justRegistered");
    if (justRegistered === "true" && !user) {
      setShowRegistrationSuccess(true);
      localStorage.removeItem("justRegistered");
      
      // Auto hide success message after 3 seconds
      setTimeout(() => {
        setShowRegistrationSuccess(false);
      }, 3000);
    }
  }, [user]);

  if (!isOpen) return null;

 const captureLocation = () => {
  return new Promise((resolve, reject) => {

    // ✅ 1. Check cache first
    const cached = localStorage.getItem("user_location");
    if (cached) {
      return resolve(JSON.parse(cached));
    }

    if (!navigator.geolocation) {
      return reject(new Error("Geolocation not supported"));
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;

        let location = {
          lat: latitude,
          lng: longitude,
          city: "Your Location",
          area: "Unknown",
          pincode: null,
          country: "India"
        };

        // ✅ Optional: Remove API call for speed
        try {
          const response = await fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`
          );
          const data = await response.json();

          location.city = data.city || data.locality || "Unknown";
          location.area = data.principalSubdivision || data.city;
          location.pincode = data.postcode;
        } catch {}

        // ✅ Save to cache
        localStorage.setItem("user_location", JSON.stringify(location));

        resolve(location);
      },
      reject,
      {
        enableHighAccuracy: false,
        timeout: 5000,      // ⬅️ reduce timeout
        maximumAge: 300000 // ⬅️ allow cached GPS (5 min)
      }
    );
  });
};

  useEffect(() => {
  captureLocation().catch(() => {});
}, []);

  const handleSendOTP = async () => {
    if (!phone.trim() || phone.length !== 10 || !/^\d+$/.test(phone)) {
      toast.error("Please enter a valid 10-digit mobile number");
      return;
    }
    
    setLoading(true);
    const success = await sendOTP(phone);
    setLoading(false);
    
    if (success) {
      setStep("otp");
      toast.info("OTP sent! Please check your mobile");
    }
  };

  const handleVerify = async () => {
    if (!otp.trim()) {
      toast.error("Please enter OTP");
      return;
    }
    
    if (otp.length !== 6) {
      toast.error("OTP should be 6 digits");
      return;
    }
    
    setLoading(true);
    
    let locationData = null;
    
    try {
      setCapturingLocation(true);
      locationData = await captureLocation();
      if (locationData && locationData.city !== "Unknown") {
        toast.success(`Location detected: ${locationData.city}`);
      }
    } catch (error) {
      console.error("Location capture error:", error.message);
      if (!error.message.includes("denied")) {
        toast.info("Could not detect location. You can still shop with us!");
      }
    } finally {
      setCapturingLocation(false);
    }
    
    const success = await verifyOTP(phone, otp, locationData);
    setLoading(false);
    
    if (success) {
      setStep("phone");
      setPhone("");
      setOtp("");
      setLocationPermissionDenied(false);
      onClose();
    }
  };

  const handleClose = () => {
    setStep("phone");
    setPhone("");
    setOtp("");
    setLocationPermissionDenied(false);
    setShowRegistrationSuccess(false);
    onClose();
  };

  const handleKeyPress = (e, action) => {
    if (e.key === "Enter") {
      action();
    }
  };

  const requestLocationAgain = () => {
    setLocationPermissionDenied(false);
    toast.info("Please allow location access when prompted");
  };

  const handleRegisterClick = () => {
    onClose();
    router.push("/register");
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4">
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl animate-in fade-in zoom-in duration-200">
        <button
          onClick={handleClose}
          className="absolute right-4 top-4 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <FaTimes />
        </button>

        {/* Registration Success Message */}
        {showRegistrationSuccess && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl animate-in slide-in-from-top duration-300">
            <div className="flex items-center gap-2">
              <FaCheckCircle className="text-green-500 text-lg" />
              <div>
                <p className="text-sm font-semibold text-green-800">Registration Successful!</p>
                <p className="text-xs text-green-600">Please login with your mobile number</p>
              </div>
            </div>
          </div>
        )}

        {user ? (
          // Logged in view
          <>
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#6c6d2c]/10">
                <FaUser className="text-2xl text-[#6c6d2c]" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">Welcome back!</h2>
              <p className="mt-2 text-gray-600">Signed in as</p>
              <p className="mt-1 font-semibold text-[#6c6d2c] break-all">
                {user.phone || user.email}
              </p>
              {user.location && (
                <div className="mt-2 flex items-center justify-center gap-1 text-sm text-gray-500">
                  <FaMapMarkerAlt className="text-[#6c6d2c]" />
                  <span>{user.location.city}</span>
                </div>
              )}
            </div>
            
            <div className="mt-6">
              <Link
                href="/orders"
                onClick={handleClose}
                className="block w-full text-center rounded-xl border border-gray-200 px-4 py-2.5 text-gray-700 font-semibold transition hover:bg-gray-50 mb-3"
              >
                My Orders
              </Link>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={logout}
                className="flex-1 rounded-xl bg-[#6c6d2c] px-4 py-2.5 text-white font-semibold transition hover:bg-[#5a5b25]"
              >
                Logout
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-gray-700 font-semibold transition hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </>
        ) : (
          // Login view
          <>
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#6c6d2c]/10">
                <FaPhone className="text-2xl text-[#6c6d2c]" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900">Sign In</h2>
              <p className="mt-2 text-sm text-gray-500">
                Enter your mobile number to receive a login OTP
              </p>
            </div>

            {step === "phone" && (
              <>
                <div className="mt-6">
                  <label className="block text-sm font-medium text-gray-700">
                    Mobile Number
                  </label>
                  <div className="mt-2">
                    <div className="flex items-center rounded-xl border border-gray-200 focus-within:border-[#6c6d2c] focus-within:ring-2 focus-within:ring-[#6c6d2c]/20">
                      <span className="px-3 text-gray-500">+91</span>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                        onKeyPress={(e) => handleKeyPress(e, handleSendOTP)}
                        className="flex-1 rounded-r-xl px-3 py-3 outline-none"
                        placeholder="9876543210"
                        autoFocus
                        disabled={loading}
                        maxLength={10}
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSendOTP}
                  disabled={loading}
                  className="mt-6 w-full rounded-xl bg-[#6c6d2c] px-4 py-3 font-semibold text-white transition hover:bg-[#5a5b25] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading && <FaSpinner className="animate-spin" />}
                  {loading ? "Sending OTP..." : "Send OTP"}
                </button>
              </>
            )}

            {step === "otp" && (
              <>
                <div className="mt-6">
                  <label className="block text-sm font-medium text-gray-700">
                    Enter OTP
                  </label>
                  <div className="mt-2">
                    <input
                      type="text"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      onKeyPress={(e) => handleKeyPress(e, handleVerify)}
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 text-center text-2xl font-mono tracking-wider outline-none transition focus:border-[#6c6d2c] focus:ring-2 focus:ring-[#6c6d2c]/20"
                      placeholder="000000"
                      maxLength={6}
                      autoFocus
                      disabled={loading}
                    />
                  </div>
                  <p className="mt-2 text-xs text-gray-500 text-center">
                    OTP sent to <span className="font-medium">+91 {phone}</span>
                  </p>
                  <button
                    type="button"
                    onClick={handleSendOTP}
                    disabled={loading}
                    className="mt-2 text-xs text-[#6c6d2c] hover:underline w-full text-center"
                  >
                    Resend OTP
                  </button>
                </div>

                {capturingLocation && (
                  <div className="mt-3 text-center text-sm text-gray-500 flex items-center justify-center gap-2">
                    <FaSpinner className="animate-spin" />
                    Detecting your location (optional)...
                  </div>
                )}

                {locationPermissionDenied && (
                  <div className="mt-3 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                    <div className="flex items-start gap-2">
                      <FaExclamationTriangle className="text-yellow-600 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-xs text-yellow-800">
                          Location access is disabled. You can still login, but products will be shown from all warehouses.
                        </p>
                        <button
                          onClick={requestLocationAgain}
                          className="mt-2 text-xs text-[#6c6d2c] font-medium hover:underline"
                        >
                          Allow Location
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleVerify}
                  disabled={loading}
                  className="mt-6 w-full rounded-xl bg-[#6c6d2c] px-4 py-3 font-semibold text-white transition hover:bg-[#5a5b25] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading && <FaSpinner className="animate-spin" />}
                  {loading ? "Verifying..." : "Verify & Login"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setStep("phone");
                    setOtp("");
                  }}
                  className="mt-3 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
                >
                  ← Back to Mobile Number
                </button>
              </>
            )}

            {/* Register Button */}
            <div className="mt-4 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={handleRegisterClick}
                className="w-full rounded-xl bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200 px-4 py-3 text-sm font-semibold text-green-700 transition hover:bg-green-100 hover:border-green-300 flex items-center justify-center gap-2"
              >
                <FaUserPlus className="text-green-600" />
                New User? Create Account
              </button>
            </div>

            <button
              type="button"
              onClick={handleClose}
              className="mt-3 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-500 transition hover:bg-gray-50"
            >
              Close
            </button>
          </>
        )}
      </div>
    </div>
  );
}