import { contractCalendar, koreanToday } from "../src/server/checkin/contract-calendar.ts";
// Local date preview only. No database, credentials or customer information.
try {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== "--renewal" && !/^--(start|end|from)=/.test(arg))) throw new Error("UNKNOWN_ARGUMENT");
  const value = name => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  console.log(JSON.stringify(contractCalendar(value("start") ?? "", value("end") ?? "", value("from") ?? koreanToday(), {
    shortContract: "onboarding-only", singleMonthly: "renewal", renewal: args.includes("--renewal"),
  }), null, 2));
} catch { console.error("INVALID_CALENDAR_ARGUMENTS"); process.exitCode = 1; }
