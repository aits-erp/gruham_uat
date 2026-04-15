import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import OTP from "./send-otp/OTP";
import EcommerceUser from "../register/EcommerceUser";
import jwt from "jsonwebtoken";

export async function POST(req) {
  await dbConnect();

  try {
    const { phone, otp, location, userType = "customer" } = await req.json();

    if (!phone || !otp) {
      return NextResponse.json(
        { success: false, message: "Phone number and OTP are required" },
        { status: 400 }
      );
    }

    // Find valid OTP
    const otpRecord = await OTP.findOne({
      phone: phone,
      otp: otp,
      expiresAt: { $gt: new Date() },
      verified: false,
    });

    if (!otpRecord) {
      return NextResponse.json(
        { success: false, message: "Invalid or expired OTP" },
        { status: 400 }
      );
    }

    // Mark OTP as verified
    otpRecord.verified = true;
    await otpRecord.save();

    // Find or create user
    let user = await EcommerceUser.findOne({ phone: phone });
    
    if (!user) {
      // Generate customer code
      const lastUser = await EcommerceUser.findOne({ customerCode: { $exists: true, $ne: null } })
        .sort({ customerCode: -1 })
        .limit(1);
      
      let nextNumber = 1;
      if (lastUser && lastUser.customerCode) {
        const match = lastUser.customerCode.match(/\d+/);
        if (match) {
          nextNumber = parseInt(match[0]) + 1;
        }
      }
      const customerCode = `CUST${String(nextNumber).padStart(6, '0')}`;
      
      // Create new user with specified type
      const userData = {
        phone: phone,
        name: `User ${phone.slice(-4)}`,
        roles: [userType],
        type: userType,
        status: "active",
        customerCode: userType === "customer" ? customerCode : undefined,
        isVerified: true,
      };
      
      // Add location to user if provided
      if (location) {
        userData.location = {
          lat: location.lat,
          lng: location.lng,
          city: location.city,
          area: location.area,
          pincode: location.pincode,
          country: location.country
        };
      }
      
      user = await EcommerceUser.create(userData);
    } else if (location && !user.location) {
      // Update existing user with location if they don't have one
      user.location = {
        lat: location.lat,
        lng: location.lng,
        city: location.city,
        area: location.area,
        pincode: location.pincode,
        country: location.country
      };
      await user.save();
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        id: user._id,
        phone: user.phone,
        email: user.email,
        name: user.name,
        roles: user.roles,
        type: user.type,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Remove OTP record
    await OTP.deleteOne({ _id: otpRecord._id });

    // Prepare user response
    const userResponse = {
      id: user._id,
      phone: user.phone,
      email: user.email,
      name: user.name,
      roles: user.roles,
      type: user.type,
      location: user.location || null,
      customerCode: user.customerCode,
    };

    return NextResponse.json({
      success: true,
      message: "Login successful",
      token,
      user: userResponse,
    });
  } catch (error) {
    console.error("Verify OTP error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to verify OTP" },
      { status: 500 }
    );
  }
}