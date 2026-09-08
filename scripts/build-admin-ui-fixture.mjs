// Isolated browser fixture only. No route or authentication bypass is added to the app.
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
const require = createRequire(import.meta.url);
const vitePath = require.resolve("vite", { paths: [dirname(require.resolve("vitest/package.json"))] });
const { build } = require(require.resolve("esbuild", { paths: [dirname(vitePath)] }));
const tailwind = require("@tailwindcss/postcss");
const postcss = require(require.resolve("postcss", { paths: [dirname(require.resolve("@tailwindcss/postcss"))] }));
const out = resolve("artifacts/private/admin-ui");
await mkdir(out, { recursive: true });
await build({ entryPoints: ["e2e/admin-ui-entry.tsx"], bundle: true, outfile: resolve(out, "app.js"), platform: "browser", jsx: "automatic", define: { "process.env.NODE_ENV": '"development"' } });
const css = await postcss([tailwind()]).process(await readFile("src/app/globals.css", "utf8"), { from: resolve("src/app/globals.css") });
await writeFile(resolve(out, "app.css"), css.css);
