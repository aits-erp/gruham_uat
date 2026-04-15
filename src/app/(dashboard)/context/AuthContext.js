// context/AuthContext.js
"use client";

import { createContext, useContext, useState, useEffect } from "react";
import axios from "axios";
import { toast } from "react-toastify";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userLocation, setUserLocation] = useState(null);
  const [locationCaptured, setLocationCaptured] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const storedUser = localStorage.getItem("user");
    
    if (token && storedUser) {
      const userData = JSON.parse(storedUser);
      setUser(userData);
      axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
      
      // Load stored location
      const storedLocation = localStorage.getItem("userLocation");
      if (storedLocation) {
        const location = JSON.parse(storedLocation);
        setUserLocation(location);
        setLocationCaptured(true);
      }
    }
    
    setLoading(false);
  }, []);

  // Function to capture user location
  const captureLocation = () => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation not supported"));
        return;
      }
      
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          
          // Reverse geocode to get city/area
          try {
            const response = await fetch(
              `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`
            );
            const data = await response.json();
            
            const location = {
              lat: latitude,
              lng: longitude,
              city: data.city || data.locality || "Unknown",
              area: data.principalSubdivision || data.city,
              pincode: data.postcode,
              country: data.countryName
            };
            
            resolve(location);
          } catch (error) {
            resolve({
              lat: latitude,
              lng: longitude,
              city: "Unknown",
              area: "Unknown",
            });
          }
        },
        (error) => {
          reject(error);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  };

  const sendOTP = async (phone) => {
    try {
      const res = await axios.post("/api/verify-otp/send-otp", { phone });
      if (res.data.success) {
        toast.success(res.data.message);
        if (process.env.NODE_ENV === "development" && res.data.otp) {
          toast.info(`Your OTP is: ${res.data.otp}`, {
            position: "top-center",
            autoClose: 10000,
          });
        }
        return true;
      }
      return false;
    } catch (error) {
      console.error("Send OTP error:", error);
      toast.error(error.response?.data?.message || "Failed to send OTP");
      return false;
    }
  };

  // ✅ FIXED: Added userType parameter to create customer/company accounts
  const verifyOTP = async (phone, otp, locationData = null, userType = "customer") => {
    try {
      const res = await axios.post("/api/verify-otp", { 
        phone, 
        otp, 
        location: locationData,
        userType: userType  // Pass userType to API
      });
      
      if (res.data.success) {
        const { token, user: userData } = res.data;
        
        localStorage.setItem("token", token);
        localStorage.setItem("user", JSON.stringify(userData));
        
        if (locationData) {
          localStorage.setItem("userLocation", JSON.stringify(locationData));
        }
        
        axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
        
        setUser(userData);
        if (locationData) setUserLocation(locationData);
        
        toast.success(`Welcome ${userData.name || userData.phone}!`);
        return true;
      }
      return false;
    } catch (error) {
      toast.error(error.response?.data?.message || "Invalid OTP");
      return false;
    }
  };

  const updateUserLocation = async () => {
    try {
      const location = await captureLocation();
      setUserLocation(location);
      localStorage.setItem("userLocation", JSON.stringify(location));
      setLocationCaptured(true);
      
      if (user) {
        const updatedUser = { ...user, location };
        setUser(updatedUser);
        localStorage.setItem("user", JSON.stringify(updatedUser));
      }
      
      toast.success(`Location updated: ${location.city}`);
      return location;
    } catch (error) {
      console.error("Location error:", error);
      toast.error("Could not detect location");
      return null;
    }
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    
    delete axios.defaults.headers.common["Authorization"];
    setUser(null);
    
    localStorage.removeItem("cart");
    const event = new CustomEvent("cartCleared");
    window.dispatchEvent(event);
    
    toast.success("Logged out successfully");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        userLocation,
        loading,
        sendOTP,
        verifyOTP,
        logout,
        updateUserLocation,
        isAuthenticated: !!user,
        locationCaptured,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);