#!/usr/bin/env node
/**
 * CI guard: the Supabase service role key must never reach the browser.
 *
 * Three independent checks, because each catches a different mistake:
 *
 *  1. SOURCE — no client-reachable module may reference SUPABASE_SERVICE_ROLE*.
 *     Catches "I'll just read it here" before it is ever bundled.
 *  2. NAMING — the service key must never be exposed under a NEXT_PUBLIC_ name.
 *     Anything NEXT_PUBLIC_* is inlined into the client bundle by definition.
 *  3. BUNDLE — if a production build exists, scan every client-served asset for
 *     the literal key value, for the string `service_role`, and for any JWT
 *     whose payload claims the service_role role.
 *
 * Exit code 1 on any finding. Run:  npm run check:leak   (or `npm run verify`)
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, extname, sep } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const findings = [];
const report = (message) => findings.push(message);

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".vercel",
  "coverage",
  "playwright-report",
]);

function walk(dir, filter, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) walk(full, filter, out);
    else if (filter(full)) out.push(full);
  }
  return out;
}

/**
 * Modules that end up in the browser bundle. `lib/supabase/admin.ts` is the one
 * sanctioned reader of the key; it is `server-only`, so importing it from a
 * client component is already a build error.
 */
const SERVER_ONLY_ALLOWLIST = new Set(
  [
    "lib/supabase/admin.ts",
    "lib/env.ts", // documents the rule in a comment; asserted below
  ].map((p) => p.split("/").join(sep)),
);

const SOURCE_DIRS = ["app", "components", "hooks", "lib", "config"];
const SOURCE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".css"]);

/** Root-level source files that are not inside a scanned directory. */
const ROOT_SOURCE_FILES = ["proxy.ts", "next.config.ts"];

/** Every source file the checks below walk over. */
function sourceFiles() {
  const files = SOURCE_DIRS.flatMap((dir) =>
    walk(join(root, dir), (f) => SOURCE_EXTS.has(extname(f))),
  );
  for (const name of ROOT_SOURCE_FILES) {
    const path = join(root, name);
    if (existsSync(path)) files.push(path);
  }
  return files;
}

// -----------------------------------------------------------------------------
// 1. SOURCE — who references the service role key?
// -----------------------------------------------------------------------------
const SERVICE_KEY_REF = /SUPABASE_SERVICE_ROLE[A-Z_]*/;

for (const file of sourceFiles()) {
  const rel = relative(root, file);
  const contents = readFileSync(file, "utf8");

  // A client component that reads the key is always wrong, allowlist or not.
  const isClientComponent = /^\s*["']use client["'];?/m.test(contents);
  if (isClientComponent && /process\.env\.SUPABASE_SERVICE_ROLE/.test(contents)) {
    report(`${rel} is a client component AND reads the service role key.`);
  }

  if (!SERVICE_KEY_REF.test(contents)) continue;

  if (SERVER_ONLY_ALLOWLIST.has(rel)) {
    // Allowed — but only if the module really is server-only.
    const isServerOnly = /^import\s+["']server-only["'];?/m.test(contents);
    const readsTheKey = /process\.env\.SUPABASE_SERVICE_ROLE/.test(contents);
    if (readsTheKey && !isServerOnly) {
      report(`${rel} reads the service role key but is not marked \`import "server-only"\`.`);
    }
    continue;
  }

  report(`${rel} references SUPABASE_SERVICE_ROLE*. Only lib/supabase/admin.ts may.`);
}

// -----------------------------------------------------------------------------
// 2. NAMING — never expose the key under a NEXT_PUBLIC_ name
// -----------------------------------------------------------------------------
for (const envFile of [".env.example", ".env.local", ".env", ".env.production"]) {
  const path = join(root, envFile);
  if (!existsSync(path)) continue;
  const contents = readFileSync(path, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const name = trimmed.slice(0, trimmed.indexOf("=")).trim();
    if (name.startsWith("NEXT_PUBLIC_") && /SERVICE_ROLE|SECRET/i.test(name)) {
      report(`${envFile} defines ${name} — NEXT_PUBLIC_* is inlined into the client bundle.`);
    }
  }
}

// -----------------------------------------------------------------------------
// 3. BUNDLE — scan client-served assets of a production build
// -----------------------------------------------------------------------------
const serviceKeyValue = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
const hasRealKey = serviceKeyValue.length > 20 && !serviceKeyValue.includes("placeholder");

/** Decode a JWT payload without verifying it — we only care about the claims. */
function claimsOf(token) {
  try {
    const [, payload] = token.split(".");
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

const JWT_PATTERN = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;

/**
 * Supabase's current API keys are opaque prefixed strings, not JWTs, so the
 * `role=service_role` claim check below never fires for them. `sb_secret_*` is
 * the secret key and must never be shipped; `sb_publishable_*` is the anon key
 * and is expected in the bundle, so it is deliberately NOT matched here.
 */
const SECRET_KEY_PREFIX = /sb_secret_[A-Za-z0-9_-]+/g;

const bundleTargets = [join(root, ".next", "static"), join(root, "public")];
let scannedFiles = 0;

for (const target of bundleTargets) {
  for (const file of walk(target, () => true)) {
    const rel = relative(root, file);
    let contents;
    try {
      contents = readFileSync(file, "utf8");
    } catch {
      continue; // binary asset
    }
    scannedFiles++;

    if (hasRealKey && contents.includes(serviceKeyValue)) {
      report(`SERVICE ROLE KEY VALUE found verbatim in ${rel}.`);
    }
    if (contents.includes("service_role")) {
      report(`The string "service_role" appears in client-served asset ${rel}.`);
    }
    if (/SUPABASE_SERVICE_ROLE/.test(contents)) {
      report(`SUPABASE_SERVICE_ROLE* appears in client-served asset ${rel}.`);
    }
    for (const token of contents.match(JWT_PATTERN) ?? []) {
      const claims = claimsOf(token);
      if (claims?.role === "service_role") {
        report(`A JWT claiming role=service_role is embedded in ${rel}.`);
      }
    }
    if (SECRET_KEY_PREFIX.test(contents)) {
      report(`A Supabase secret key (sb_secret_*) appears in client-served asset ${rel}.`);
    }
    SECRET_KEY_PREFIX.lastIndex = 0; // /g regexes are stateful across .test() calls
  }
}

// -----------------------------------------------------------------------------
// Result
// -----------------------------------------------------------------------------
const builtBundleScanned = existsSync(join(root, ".next", "static"));

if (findings.length > 0) {
  console.error("✗ Service-key leak check FAILED:\n");
  for (const finding of new Set(findings)) console.error(`  - ${finding}`);
  console.error("\nThe service role key bypasses RLS. It must never reach a browser.");
  process.exit(1);
}

console.log("✓ Service-key leak check passed.");
console.log(`  source scan: ${SOURCE_DIRS.join(", ")}`);
console.log(
  builtBundleScanned
    ? `  bundle scan: ${scannedFiles} client-served files under .next/static and public/`
    : "  bundle scan: SKIPPED (no production build found — run `npm run build` first)",
);
