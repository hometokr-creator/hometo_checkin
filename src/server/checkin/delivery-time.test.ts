import { expect, it } from "vitest";
import { scheduledDeliveryAt } from "./delivery-time";

it.each(["2026-09-19", "2026-09-20", "2026-12-25"])("keeps weekend/holiday %s at 14:00 Korea", date => {
  expect(scheduledDeliveryAt(date)).toBe(`${date}T05:00:00.000Z`);
});
it("rejects invalid dates", () => {
  expect(() => scheduledDeliveryAt("2026-02-30")).toThrow("INVALID_CONTRACT_DATE");
});
