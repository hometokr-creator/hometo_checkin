import { readFile, mkdir, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { randomBytes, createHash, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
const env = {
  ...parseEnv(await readFile(".env.local", "utf8")),
  ...process.env,
};
const base = process.env.CHECKIN_TEST_ORIGIN ?? "http://127.0.0.1:3100";
const project = new URL(env.SUPABASE_URL).hostname;
if (
  project !== "rfwxpqekweizestlxomi.supabase.co" &&
  !["localhost", "127.0.0.1"].includes(project)
)
  throw new Error("Use the dedicated development project only");
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const fixtures = JSON.parse(
  await readFile("src/server/checkin/fixtures/submissions.json", "utf8"),
);
let participantId;
const sessionIds = [];
async function checked(query, label) {
  const r = await query;
  if (r.error) throw new Error(label + ": " + r.error.code);
  return r.data;
}
async function create(index = 1) {
  const token = randomBytes(32).toString("base64url");
  const type = index === 3 ? "rule" : index === 4 ? "facility" : null;
  const sid = await checked(
    db.rpc("create_checkin_session", {
      p_participant_id: participantId,
      p_round_type: type ? "event" : "monthly",
      p_round_key: "test-" + randomUUID(),
      p_scenario_id: type ? type + "-event-guest" : "monthly-guest",
      p_event_type: type,
      p_context:
        type === "rule" ? { type } : type ? { type, itemName: "에어컨" } : null,
      p_sent_at: new Date().toISOString(),
      p_token_digest: createHash("sha256").update(token).digest("hex"),
    }),
    "create",
  );
  sessionIds.push(sid);
  const access = await call("/access", undefined, { token });
  assert.equal(access.status, 200, "access");
  const cookie = access.response.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  assert.ok(cookie);
  assert.match(access.response.headers.get("set-cookie"), /HttpOnly/i);
  return { sid, cookie, token };
}
async function call(path, cookie, payload) {
  const response = await fetch(base + "/api/checkin" + path, {
    method: payload === undefined ? "GET" : "POST",
    headers: {
      origin: base,
      ...(cookie ? { cookie } : {}),
      ...(payload !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  return { status: response.status, data: await response.json(), response };
}
const answer = (s, index = 1) => ({
  ...structuredClone(fixtures[index]),
  sessionId: s.sid,
});
try {
  participantId = (
    await checked(
      db
        .from("checkin_participant")
        .insert({
          display_name: "HTTP integration fixture",
          phone: "TEST-NOT-A-PHONE",
          contract_start_date: "2026-01-01",
          contract_end_date: "2026-12-31",
          memo: "temporary automated test",
        })
        .select("id")
        .single(),
      "participant",
    )
  ).id;
  for (let i = 0; i < 5; i++) {
    const s = await create(i);
    const input = answer(s, i);
    const lookup = await call("/session?sessionId=" + s.sid, s.cookie);
    assert.equal(lookup.data.status, "active");
    assert.equal(
      (
        await call("/sessions/" + s.sid + "/interest-events", s.cookie, {
          type: "exposed",
        })
      ).status,
      409,
    );
    const saved = await call("/sessions/" + s.sid + "/answer", s.cookie, input);
    assert.equal(saved.status, 200, "sample " + i);
    assert.equal(
      saved.data.outcome,
      ["reported", "ok", "urgent", "reported", "reported"][i],
    );
    const row = await checked(
      db
        .from("checkin_response")
        .select("answers_json")
        .eq("session_id", s.sid)
        .single(),
      "read",
    );
    assert.deepEqual(row.answers_json, input.answers);
    const duplicate = await call(
      "/sessions/" + s.sid + "/answer",
      s.cookie,
      input,
    );
    assert.equal(duplicate.data.status, "duplicate");
    assert.equal(
      (await call("/session?sessionId=" + s.sid, s.cookie)).data.status,
      "completed",
    );
    if (i === 4)
      assert.equal(
        saved.data.completionMessage,
        "의견 남겨주셔서 감사해요! 잘 전달할게요 🙂",
      );
  }
  console.log(
    "PASS: payloads A-E, persisted content, completion lookup, duplicate retry",
  );
  const s = await create();
  const input = answer(s);
  const endpoint = "/sessions/" + s.sid + "/answer";
  const concurrent = await Promise.all([
    call(endpoint, s.cookie, input),
    call(endpoint, s.cookie, input),
  ]);
  assert.deepEqual(concurrent.map((r) => r.data.status).sort(), [
    "accepted",
    "duplicate",
  ]);
  const changed = structuredClone(input);
  changed.idempotencyKey = "new";
  changed.answers.responses.monthlyStatus = "issue";
  assert.equal((await call(endpoint, s.cookie, changed)).status, 409);
  const race = await create();
  const first = answer(race);
  const second = structuredClone(first);
  second.answers.responses.monthlyStatus = "issue";
  second.idempotencyKey = "different";
  assert.deepEqual(
    (
      await Promise.all([
        call("/sessions/" + race.sid + "/answer", race.cookie, first),
        call("/sessions/" + race.sid + "/answer", race.cookie, second),
      ])
    )
      .map((r) => r.status)
      .sort(),
    [200, 409],
  );
  console.log(
    "PASS: simultaneous identical and different answers, new-key conflict",
  );
  const interest = "/sessions/" + s.sid + "/interest-events";
  assert.equal(
    (await call(interest, s.cookie, { type: "clicked" })).status,
    422,
  );
  await call(interest, s.cookie, { type: "exposed" });
  await call(interest, s.cookie, { type: "clicked" });
  const empty = await call(interest, s.cookie, {
    type: "topics-submitted",
    topics: [],
  });
  assert.ok(empty.data.topicsSubmittedAt);
  const immutable = await call(interest, s.cookie, {
    type: "topics-submitted",
    topics: ["host"],
  });
  assert.deepEqual(immutable.data, empty.data);
  assert.equal(
    (
      await call(interest, s.cookie, {
        type: "topics-submitted",
        topics: ["invalid"],
      })
    ).status,
    422,
  );
  assert.equal(
    (await call("/session?sessionId=" + s.sid, s.cookie)).data.status,
    "completed",
  );
  const p = await create();
  const progress = "/sessions/" + p.sid + "/progress-events";
  const event = { scenarioId: "monthly-guest", stepId: "q_main" };
  assert.equal(
    (await call(progress, p.cookie, { ...event, freeText: "must not store" }))
      .status,
    422,
  );
  assert.equal(
    (await call(progress, p.cookie, { ...event, stepId: "missing" })).status,
    422,
  );
  await Promise.all([
    call(progress, p.cookie, event),
    call(progress, p.cookie, event),
  ]);
  assert.equal(
    (
      await checked(
        db.from("checkin_progress_event").select("id").eq("session_id", p.sid),
        "progress count",
      )
    ).length,
    1,
  );
  assert.equal(
    (await call("/sessions/" + p.sid + "/answer", s.cookie, answer(p))).status,
    401,
  );
  const tampered = answer(p, 2);
  tampered.answers.overallTriage = "R2";
  tampered.answers.issues[0].triageLevel = "R2";
  assert.equal(
    (await call("/sessions/" + p.sid + "/answer", p.cookie, tampered)).data
      .outcome,
    "urgent",
  );
  const expired = await create();
  await checked(
    db
      .from("checkin_session")
      .update({ answer_expires_at: new Date(Date.now() - 1000).toISOString() })
      .eq("id", expired.sid),
    "expire",
  );
  assert.equal(
    (
      await call(
        "/sessions/" + expired.sid + "/answer",
        expired.cookie,
        answer(expired),
      )
    ).status,
    410,
  );
  await checked(
    db
      .from("checkin_access_token")
      .update({ revoked_at: new Date().toISOString() })
      .eq("session_id", expired.sid),
    "revoke",
  );
  assert.equal(
    (await call("/session?sessionId=" + expired.sid, expired.cookie)).status,
    401,
  );
  console.log(
    "PASS: independent interest/progress, immutable topics, authorization, expiry, server triage",
  );
  // Keep one separate synthetic session for browser/manual validation.
  const demo = await create();
  await mkdir("artifacts/private", { recursive: true });
  await writeFile(
    "artifacts/private/browser-session.json",
    JSON.stringify(
      { sessionId: demo.sid, url: base + "/c/" + demo.token },
      null,
      2,
    ),
  );
  sessionIds.splice(sessionIds.indexOf(demo.sid), 1);
  console.log(
    "Private browser fixture: artifacts/private/browser-session.json",
  );
} catch (error) {
  console.error("Backend integration failed:", error.message);
  process.exitCode = 1;
} finally {
  if (sessionIds.length) {
    const responses = await checked(
      db.from("checkin_response").select("id").in("session_id", sessionIds),
      "cleanup read",
    );
    if (responses.length)
      await checked(
        db
          .from("checkin_issue")
          .delete()
          .in(
            "response_id",
            responses.map((r) => r.id),
          ),
        "cleanup issues",
      );
    for (const table of [
      "checkin_interest",
      "checkin_progress_event",
      "checkin_response",
      "checkin_access_token",
      "checkin_delivery",
    ])
      await checked(
        db.from(table).delete().in("session_id", sessionIds),
        "cleanup " + table,
      );
    await checked(
      db.from("checkin_session").delete().in("id", sessionIds),
      "cleanup sessions",
    );
  }
  if (participantId) {
    const remaining = await checked(
      db
        .from("checkin_session")
        .select("id")
        .eq("participant_id", participantId),
      "remaining",
    );
    if (!remaining.length)
      await checked(
        db.from("checkin_participant").delete().eq("id", participantId),
        "cleanup participant",
      );
  }
}
