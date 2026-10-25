import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: {
      type: String, required: true, trim: true, lowercase: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Invalid email format"],
    },
    passwordHash: { type: String, required: true },
    role: {
      type: String, required: true,
      enum: ["admin", "plumber"],
      default: "plumber",
    },
    emailVerified: { type: Boolean, default: false },
    emailVerifyToken: { type: String, default: null },
    emailVerifyExpires: { type: Date, default: null },
    passwordResetToken: { type: String, default: null },
    passwordResetExpires: { type: Date, default: null },
    accountStatus: {
      type: String,
      enum: ["active", "pending", "suspended", "rejected"],
      default: "pending",
    },
    lastLoginAt: { type: Date, default: null },
    tokenVersion: { type: Number, default: 0 },
  },
  { collection: "users", timestamps: true }
);

// Unique index on normalized email
userSchema.index({ email: 1 }, { unique: true });

// Instance method — verify password
userSchema.methods.verifyPassword = async function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

// Static — hash password
userSchema.statics.hashPassword = async function (plain) {
  return bcrypt.hash(plain, 12);
};

const User = mongoose.model("User", userSchema);
export default User;
