import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mock = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("../db", () => ({ getDb: () => ({ from: mock.from }) }));
import { exchangeToken } from "./access";
describe("pending delivery access", () => {
 it("reports delivery pending before checking the deliberately closed token deadline", async () => {
   let tokens = 0;
   mock.from.mockImplementation((table: string) => {
     const query = { select: () => query, eq: () => query, maybeSingle: async () => ({
       error: null, data: table === "checkin_session" ? { status: "open", delivery_pending: true }
        : ++tokens === 1 ? { id: "token", session_id: "session" }
        : { id: "token", session_id: "session", expires_at: "2000-01-01T00:00:00Z", revoked_at: null },
     }) };
     return query;
   });
   await expect(exchangeToken("a".repeat(43))).rejects.toMatchObject({ code: "unavailable", status: 503 });
 });
});
