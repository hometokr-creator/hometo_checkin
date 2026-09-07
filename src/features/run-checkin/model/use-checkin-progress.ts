"use client";
import { useEffect } from "react";
import { recordCheckinProgress } from "@/domains/checkin/api/record-checkin-progress";
// Progress is best effort. No answer data, unload handler, or submission dependency.
export function useCheckinProgress(
  sessionId: string,
  scenarioId: string,
  stepId?: string,
) {
  useEffect(() => {
    if (!stepId) return;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let active = true;
    void recordCheckinProgress(sessionId, scenarioId, stepId).catch(() => {
      if (active)
        retry = setTimeout(() => {
          void recordCheckinProgress(sessionId, scenarioId, stepId).catch(
            () => {},
          );
        }, 1000);
    });
    return () => {
      active = false;
      if (retry) clearTimeout(retry);
    };
  }, [sessionId, scenarioId, stepId]);
}
