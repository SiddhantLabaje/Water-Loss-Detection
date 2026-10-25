import mongoose from "mongoose";

const plumberProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    phone: { type: String, trim: true, default: "" },
    businessName: { type: String, trim: true, default: "" },
    address: { type: String, trim: true, default: "" },
    city: { type: String, trim: true, default: "" },
    state: { type: String, trim: true, default: "" },
    serviceArea: { type: String, trim: true, default: "" },
    serviceRadiusKm: { type: Number, default: 25, min: 0 },
    skills: [{ type: String, trim: true }],
    experienceYears: { type: Number, default: 0, min: 0 },
    availability: {
      type: String,
      enum: ["available", "busy", "unavailable"],
      default: "available",
    },
    workingHours: { type: String, trim: true, default: "" },
    verificationStatus: {
      type: String,
      enum: ["unverified", "pending", "verified"],
      default: "unverified",
    },
    approvalStatus: {
      type: String,
      enum: ["pending", "approved", "rejected", "suspended"],
      default: "pending",
    },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    approvedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: "" },
    // Invite token for admin-registered plumbers
    inviteToken: { type: String, default: null },
    inviteExpires: { type: Date, default: null },
    isAdminRegistered: { type: Boolean, default: false },
  },
  { collection: "plumber_profiles", timestamps: true }
);

plumberProfileSchema.index({ approvalStatus: 1 });
plumberProfileSchema.index({ availability: 1 });

const PlumberProfile = mongoose.model("PlumberProfile", plumberProfileSchema);
export default PlumberProfile;
