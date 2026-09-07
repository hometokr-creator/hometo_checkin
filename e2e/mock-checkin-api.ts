import type { Page } from "@playwright/test";
import { MOCK_SESSIONS } from "../src/domains/checkin/api/mock-sessions";
import { selectGuestScenario } from "../src/features/run-checkin/model/scenarios/select-guest-scenario";
import type { CheckinSession } from "../src/domains/checkin/model/checkin";
import type { CheckinInterestRecord } from "../src/domains/checkin/model/checkin-interest";
// Browser-only fixtures. Production routes never accept demo tokens.
export async function installMockCheckinApi(page: Page) {
  const sessions: Record<string, CheckinSession> = {
    ...MOCK_SESSIONS,
    "demo-completed": {
      ...MOCK_SESSIONS["demo-monthly"],
      id: "session-completed",
    },
  };
  const completed = new Set(["session-completed"]);
  const interest = new Map<string, CheckinInterestRecord>();
  await page.route("**/api/checkin/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const body =
      request.method() === "POST" ? request.postDataJSON() : undefined;
    const respond = (data: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(data),
      });
    if (url.pathname.endsWith("/access")) {
      const session = sessions[body.token];
      return respond(
        session ? { sessionId: session.id } : { code: "invalid" },
        session ? 200 : 401,
      );
    }
    if (url.pathname.endsWith("/session")) {
      const id = url.searchParams.get("sessionId");
      const session = Object.values(sessions).find((s) => s.id === id);
      return respond(
        completed.has(id ?? "")
          ? { status: "completed", sessionId: id }
          : { status: "active", session },
      );
    }
    const id = url.pathname.split("/").at(-2)!;
    if (url.pathname.endsWith("/answer")) {
      const session = Object.values(sessions).find((s) => s.id === id)!;
      const scenario = selectGuestScenario(session);
      const outcome = body.answers.issues.some(
        (i: { tag: string }) => i.tag === "urgent",
      )
        ? "urgent"
        : body.answers.issues.length
          ? "reported"
          : "ok";
      completed.add(id);
      return respond({
        status: "accepted",
        outcome,
        completionMessage: scenario.completionMessages[outcome].text,
      });
    }
    if (url.pathname.endsWith("/progress-events"))
      return respond({ status: "recorded" });
    if (url.pathname.endsWith("/interest-events")) {
      if (!completed.has(id)) return respond({ code: "not-completed" }, 409);
      const now = new Date().toISOString();
      const r = interest.get(id) ?? {
        sessionId: id,
        clicked: false,
        topics: [],
        createdAt: now,
      };
      if (body.type === "exposed") r.exposedAt ??= now;
      if (body.type === "clicked") {
        r.clicked = true;
        r.clickedAt ??= now;
      }
      if (body.type === "topics-submitted" && !r.topicsSubmittedAt) {
        r.topics = body.topics;
        r.topicsSubmittedAt = now;
      }
      interest.set(id, r);
      return respond(r);
    }
    return respond({ code: "invalid" }, 404);
  });
}
