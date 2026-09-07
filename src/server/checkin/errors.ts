import "server-only";
export class CheckinError extends Error {
  constructor(public code: "invalid" | "expired" | "conflict" | "invalid-answer" | "unsupported" | "not-completed" | "unavailable", public status: number) { super(code); }
}
export function databaseError(error: { message?: string } | null): never {
  const code = error?.message;
  if (code === "expired") throw new CheckinError("expired", 410);
  if (code === "conflict") throw new CheckinError("conflict", 409);
  if (code === "invalid") throw new CheckinError("invalid", 401);
  if (code === "not-completed") throw new CheckinError("not-completed", 409);
  if (code === "invalid-answer") throw new CheckinError("invalid-answer", 422);
  throw new CheckinError("unavailable", 503);
}
