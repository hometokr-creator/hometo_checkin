import { dateOnly } from "./contract-calendar";

/** Confirmed policy: 14:00 Asia/Seoul on the scheduled date, including holidays. */
export function scheduledDeliveryAt(scheduledOn: string): string {
  dateOnly(scheduledOn);
  return `${scheduledOn}T05:00:00.000Z`;
}
