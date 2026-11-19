import { describe, expect, it } from "vitest";
import { isNewsDraftExpired, newsExpiryLabel } from "./news-expiry";

const now = new Date("2026-11-18T12:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000);

describe("newsExpiryLabel", () => {
  it("shows whole days when 24h or more remain", () => {
    expect(newsExpiryLabel(hoursAgo(0), now)).toBe("expires in 3 days");
    expect(newsExpiryLabel(hoursAgo(30), now)).toBe("expires in 1 day");
  });

  it("switches to hours under 24h", () => {
    expect(newsExpiryLabel(hoursAgo(60), now)).toBe("expires in 12h");
  });

  it("never shows less than 1h, even when overdue", () => {
    expect(newsExpiryLabel(hoursAgo(71.9), now)).toBe("expires in 1h");
    expect(newsExpiryLabel(hoursAgo(80), now)).toBe("expires in 1h");
  });
});

describe("isNewsDraftExpired", () => {
  it("is true only after 72h (same boundary as the cron)", () => {
    expect(isNewsDraftExpired(hoursAgo(71), now)).toBe(false);
    expect(isNewsDraftExpired(hoursAgo(72), now)).toBe(false);
    expect(isNewsDraftExpired(hoursAgo(72.01), now)).toBe(true);
  });
});
