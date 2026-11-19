import { describe, expect, it } from "vitest";
import { SESSION_MAX_AGE_SEC, createSessionToken, verifySessionToken } from "./session";

const PASS = "correct horse battery staple";
const now = new Date("2026-11-18T12:00:00Z");

describe("owner session token", () => {
  it("accepts a token it signed", () => {
    expect(verifySessionToken(createSessionToken(PASS, now), PASS, now)).toBe(true);
  });

  it("rejects the old forgeable value and malformed tokens", () => {
    for (const t of ["1", "", "v1", "v1.123", "v1.abc.sig", "v2.9999999999.sig", undefined]) {
      expect(verifySessionToken(t, PASS, now)).toBe(false);
    }
  });

  it("rejects a token signed with a different passphrase (passphrase rotation revokes sessions)", () => {
    expect(verifySessionToken(createSessionToken("old pass", now), PASS, now)).toBe(false);
  });

  it("rejects a tampered expiry", () => {
    const [v, , sig] = createSessionToken(PASS, now).split(".");
    expect(verifySessionToken(`${v}.9999999999.${sig}`, PASS, now)).toBe(false);
  });

  it("expires after 30 days", () => {
    const token = createSessionToken(PASS, now);
    const later = new Date(now.getTime() + (SESSION_MAX_AGE_SEC + 1) * 1000);
    expect(verifySessionToken(token, PASS, later)).toBe(false);
  });

  it("fails closed when the server has no passphrase configured", () => {
    expect(verifySessionToken(createSessionToken(PASS, now), undefined, now)).toBe(false);
  });
});
