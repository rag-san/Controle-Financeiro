import assert from "node:assert/strict";
import test from "node:test";
import {
  getRedesignRollout,
  isSurfaceRedesignEnabled,
  parseBooleanFlag
} from "@/lib/migration/rollout";

test("parseBooleanFlag supports common boolean literals", () => {
  assert.equal(parseBooleanFlag(undefined), null);
  assert.equal(parseBooleanFlag(""), null);
  assert.equal(parseBooleanFlag("1"), true);
  assert.equal(parseBooleanFlag("true"), true);
  assert.equal(parseBooleanFlag("YES"), true);
  assert.equal(parseBooleanFlag("on"), true);
  assert.equal(parseBooleanFlag("0"), false);
  assert.equal(parseBooleanFlag("false"), false);
  assert.equal(parseBooleanFlag("No"), false);
  assert.equal(parseBooleanFlag("off"), false);
  assert.equal(parseBooleanFlag("maybe"), null);
});

test("surface flag overrides global rollout", () => {
  const env = {
    NEXT_PUBLIC_REDESIGN_ALL: "0",
    NEXT_PUBLIC_REDESIGN_DASHBOARD: "1"
  };

  assert.equal(isSurfaceRedesignEnabled("dashboard", env), true);
  assert.equal(isSurfaceRedesignEnabled("reports", env), false);
});

test("rollout defaults to disabled when no flag is configured", () => {
  const env = {};

  assert.equal(isSurfaceRedesignEnabled("dashboard", env), false);
  assert.equal(isSurfaceRedesignEnabled("transactions", env), false);
});

test("getRedesignRollout returns all mapped surfaces", () => {
  const rollout = getRedesignRollout({
    NEXT_PUBLIC_REDESIGN_ALL: "1",
    NEXT_PUBLIC_REDESIGN_TRANSACTIONS: "0",
    NEXT_PUBLIC_REDESIGN_NET_WORTH: "false"
  });

  assert.equal(rollout.dashboard, true);
  assert.equal(rollout.transactions, false);
  assert.equal(rollout.netWorth, false);
  assert.equal(rollout.reports, true);
});
