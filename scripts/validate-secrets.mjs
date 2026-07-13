import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const roots = [repoRoot, path.join(repoRoot, "dist")];
const ignored = new Set([".git", ".tool-cache", ".wrangler", "node_modules"]);
const patterns = [
  { name: "private key", regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: "GitHub token", regex: /gh[pousr]_[A-Za-z0-9_]{30,}/ },
  { name: "AWS access key", regex: /AKIA[0-9A-Z]{16}/ },
  { name: "OpenAI key", regex: /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/ },
  { name: "Cloudflare token assignment", regex: /CLOUDFLARE_API_TOKEN\s*=\s*[^<\s][^\s]*/ },
];

async function scan(root, seen) {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) {
      await scan(target, seen);
      continue;
    }
    const relative = path.relative(repoRoot, target);
    if (seen.has(relative)) continue;
    seen.add(relative);
    const contents = await readFile(target, "utf8").catch(() => "");
    for (const pattern of patterns) {
      if (pattern.regex.test(contents)) {
        throw new Error(`${relative}: high-confidence ${pattern.name} pattern detected`);
      }
    }
  }
}

const seen = new Set();
for (const root of roots) await scan(root, seen);
process.stdout.write(`Secret scan passed across ${seen.size} source and generated files.\n`);
