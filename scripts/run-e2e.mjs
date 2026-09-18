import { spawn } from "node:child_process";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

const isWindows = process.platform === "win32";
const serverUrl = "http://127.0.0.1:3100/c/demo-monthly";

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
}

async function waitForServer(server, timeoutMs = 120_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (server.exitCode !== null) {
      throw new Error(`Next.js dev server exited with code ${server.exitCode}`);
    }

    try {
      const response = await fetch(serverUrl);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }

    await delay(500);
  }

  throw new Error("Timed out waiting for the Next.js dev server");
}

async function stopServer(server) {
  if (!server.pid || server.exitCode !== null) return;

  if (isWindows) {
    const killer = spawn(
      "taskkill",
      ["/PID", String(server.pid), "/T", "/F"],
      { stdio: "ignore", windowsHide: true },
    );
    await waitForExit(killer);
    return;
  }

  process.kill(-server.pid, "SIGTERM");
}

const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "dev",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3100",
  ],
  {
    detached: !isWindows,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: "inherit",
    windowsHide: true,
  },
);

let exitCode = 1;

try {
  await waitForServer(server);

  const playwright = spawn(
    process.execPath,
    ["node_modules/@playwright/test/cli.js", "test"],
    { env: process.env, stdio: "inherit", windowsHide: true },
  );
  exitCode = await waitForExit(playwright);
} finally {
  await stopServer(server);
}

process.exitCode = exitCode;
