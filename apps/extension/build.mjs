// Bundles the extension into dist/. Env comes from the repo root .env.local / .env
// (NEXT_PUBLIC_APP_URL, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY).
import { build, context } from "esbuild";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");

function loadEnv() {
  const out = { ...process.env };
  for (const f of [".env", ".env.local"]) {
    const p = resolve(root, f);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (m && !(m[1] in process.env)) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  return out;
}
const env = loadEnv();
const appUrl = env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

const define = {
  "__APP_URL__": JSON.stringify(appUrl),
  "__SUPABASE_URL__": JSON.stringify(env.NEXT_PUBLIC_SUPABASE_URL ?? ""),
  "__SUPABASE_ANON_KEY__": JSON.stringify(env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""),
};

mkdirSync(resolve(here, "dist"), { recursive: true });
const manifest = JSON.parse(readFileSync(resolve(here, "manifest.json"), "utf8"));
const origin = new URL(appUrl).origin;
manifest.externally_connectable.matches = [...new Set([`${origin}/*`, ...manifest.externally_connectable.matches])];
manifest.host_permissions = [...new Set([`${origin}/*`, ...manifest.host_permissions])];
writeFileSync(resolve(here, "dist/manifest.json"), JSON.stringify(manifest, null, 2));
cpSync(resolve(here, "src/popup.html"), resolve(here, "dist/popup.html"));
cpSync(resolve(here, "icons"), resolve(here, "dist/icons"), { recursive: true });

const opts = {
  entryPoints: {
    background: "src/background.ts",
    content: "src/content.ts",
    popup: "src/popup.ts",
  },
  bundle: true,
  format: "esm",
  target: "chrome120",
  outdir: "dist",
  sourcemap: true,
  define,
  logLevel: "info",
};

if (process.argv.includes("--watch")) {
  const ctx = await context(opts);
  await ctx.watch();
} else {
  await build(opts);
}
