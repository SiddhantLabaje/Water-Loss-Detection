import test from "node:test";
import assert from "node:assert/strict";
import { isCriticalLeakAlert } from "../services/broadcaster.service.js";

test("a new critical leak transition creates an alert incident", () => {
  assert.equal(isCriticalLeakAlert({
    overallSystemStatus: "CRITICAL",
    mlPredictionData: 1,
  }, "WARNING"), true);
});

test("a sustained critical leak does not create duplicate alert incidents", () => {
  assert.equal(isCriticalLeakAlert({
    overallSystemStatus: "CRITICAL",
    mlPredictionData: 1,
  }, "CRITICAL"), false);
});

test("critical alerts without a leak do not create plumber repair requests", () => {
  assert.equal(isCriticalLeakAlert({
    overallSystemStatus: "CRITICAL",
    mlPredictionData: 0,
  }, "NORMAL"), false);
});
