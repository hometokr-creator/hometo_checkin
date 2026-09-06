import {
  CHECKIN_INTEREST_TOPICS,
  type CheckinInterestEvent,
  type CheckinInterestRecord,
} from "../model/checkin-interest";

// Mock only. Memory lasts for this JS runtime, not across reloads or devices.
// Replace this boundary with the checkin_interest API. Cross-round retention
// requires the backend to join sessionId to the participant and next round.
const records = new Map<string, CheckinInterestRecord>();
const recordedEvents = new Set<string>();
const topicValues = new Set<string>(CHECKIN_INTEREST_TOPICS.map((topic) => topic.value));

export async function recordCheckinInterest(
  event: CheckinInterestEvent,
): Promise<CheckinInterestRecord> {
  if (!event || typeof event.sessionId !== "string" || !event.sessionId.trim()) {
    throw new TypeError("Invalid interest session");
  }
  if (!["exposed", "clicked", "topics-submitted"].includes(event.type)) {
    throw new TypeError("Invalid interest event");
  }
  if (event.type === "topics-submitted" && (
    !Array.isArray(event.topics) || event.topics.length > CHECKIN_INTEREST_TOPICS.length ||
    !event.topics.every((topic) => topicValues.has(topic)) ||
    new Set(event.topics).size !== event.topics.length
  )) throw new TypeError("Invalid interest topics");

  const eventId = `${event.sessionId}:community-interest:v1:${event.type}`;
  const current = records.get(event.sessionId);
  if (recordedEvents.has(eventId) && current) {
    return { ...current, topics: [...current.topics] };
  }
  if (event.type === "topics-submitted" && !current?.clicked) {
    throw new TypeError("Interest must be clicked before submitting topics");
  }
  const createdAt = new Date().toISOString();
  const record: CheckinInterestRecord = {
    sessionId: event.sessionId,
    clicked: false,
    topics: [],
    createdAt,
    ...current,
  };
  if (event.type === "exposed") record.exposedAt = createdAt;
  if (event.type === "clicked") {
    record.clicked = true;
    record.clickedAt = createdAt;
  }
  if (event.type === "topics-submitted") {
    record.topics = [...event.topics];
    record.topicsSubmittedAt = createdAt;
  }
  records.set(event.sessionId, record);
  recordedEvents.add(eventId);
  console.info("[mock:checkin-interest]", { eventId, type: event.type, ...record, topics: [...record.topics] });
  return { ...record, topics: [...record.topics] };
}
