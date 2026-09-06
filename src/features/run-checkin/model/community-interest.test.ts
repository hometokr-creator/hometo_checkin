import { expect, it } from "vitest";
import { COMMUNITY_INTEREST_TITLE, getCommunityInterestTitle } from "./community-interest";

it("uses the exact non-numeric hook without verified percentage data", () => {
  for (const value of [undefined, NaN, Infinity, -1, 101]) {
    expect(getCommunityInterestTitle(value)).toBe(COMMUNITY_INTEREST_TITLE);
  }
  expect(getCommunityInterestTitle(0)).toContain("0%");
  expect(getCommunityInterestTitle(42)).toContain("42%");
});
