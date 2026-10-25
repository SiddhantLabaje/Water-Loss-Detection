import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import User from "../models/user.model.js";
import { signToken } from "../middleware/auth.middleware.js";

test("password hashes can be verified without storing the plain password", async () => {
  const password = "correct horse battery staple";
  const passwordHash = await User.hashPassword(password);
  const user = new User({ name: "Test", email: "test@example.org", passwordHash, role: "plumber" });

  assert.notEqual(passwordHash, password);
  assert.equal(await user.verifyPassword(password), true);
  assert.equal(await user.verifyPassword("wrong password"), false);
});

test("JWT sessions include user role and revocation version", () => {
  process.env.JWT_SECRET = "unit-test-only-secret-that-is-longer-than-32-characters";
  const token = signToken("507f1f77bcf86cd799439011", "admin", 4);
  const payload = jwt.verify(token, process.env.JWT_SECRET);

  assert.equal(payload.id, "507f1f77bcf86cd799439011");
  assert.equal(payload.role, "admin");
  assert.equal(payload.tokenVersion, 4);
});

test("JWT signing refuses a missing or weak secret", () => {
  const previousSecret = process.env.JWT_SECRET;
  delete process.env.JWT_SECRET;
  assert.throws(() => signToken("507f1f77bcf86cd799439011", "admin"), /JWT_SECRET/);
  if (previousSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = previousSecret;
});
