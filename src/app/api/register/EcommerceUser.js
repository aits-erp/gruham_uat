import mongoose from "mongoose";

const addressSchema = new mongoose.Schema({
  type: { type: String, enum: ["home", "work", "other"], default: "home" },
  label: { type: String, default: "Home" },
  address1: { type: String, default: "" },
  address2: { type: String, default: "" },
  city: { type: String, default: "" },
  state: { type: String, default: "" },
  pincode: { type: String, default: "" },
  country: { type: String, default: "India" },
  isDefault: { type: Boolean, default: false },
  location: {
    lat: Number,
    lng: Number,
    city: String,
    area: String,
  },
}, { _id: true });

const EcommerceUserSchema = new mongoose.Schema(
  {
    email: { type: String, lowercase: true,  },
    phone: { type: String,  },
    name: { type: String, default: "" },
    roles: { type: [String], default: ["customer"] },
    type: { 
      type: String, 
      enum: ["customer", "company", "admin"], 
      default: "customer" 
    },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company" },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    customerCode: { type: String, },
    // Location field
    location: {
      lat: Number,
      lng: Number,
      city: String,
      area: String,
      pincode: String,
      country: String,
    },
    // Addresses array for multiple addresses
    addresses: [addressSchema],
    defaultAddress: addressSchema,
    isVerified: { type: Boolean, default: true },
    profileImage: { type: String },
  },
  { timestamps: true }
);

// Indexes
EcommerceUserSchema.index({ phone: 1 }, { unique: true, sparse: true });
EcommerceUserSchema.index({ email: 1 }, { unique: true, sparse: true });
EcommerceUserSchema.index({ customerCode: 1 }, { unique: true, sparse: true });

export default mongoose.models.EcommerceUser || mongoose.model("EcommerceUser", EcommerceUserSchema);