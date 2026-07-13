import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = path.join(repoRoot, "dist");
const manifest = JSON.parse(await readFile(path.join(repoRoot, "tool-sources.json"), "utf8"));
const errors = [];

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

async function listFiles(root) {
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(target)));
    else files.push(target);
  }
  return files;
}

function fail(message) {
  errors.push(message);
}

const requiredRoutes = [
  "index.html",
  "tools/index.html",
  "linear-programming/index.html",
  "normal-area/index.html",
  "linear-regression/index.html",
  "sampling-distribution/index.html",
  "robots.txt",
  "sitemap.xml",
  "404.html",
];

for (const route of requiredRoutes) {
  if (!(await exists(path.join(distRoot, route)))) fail(`Missing required output: ${route}`);
}

for (const tool of manifest.tools) {
  const htmlPath = path.join(distRoot, tool.targetPath, "index.html");
  const html = await readFile(htmlPath, "utf8");
  const expectedCanonical = `https://tools.benhartlage.com/${tool.targetPath}/`;
  if (!html.includes(`rel="canonical" href="${expectedCanonical}"`)) {
    fail(`${tool.id}: canonical URL does not match ${expectedCanonical}`);
  }
  if (!html.includes('href="https://tools.benhartlage.com/"')) {
    fail(`${tool.id}: return link does not point to the public hub`);
  }
  if (html.includes("Main GitHub Tools Page")) {
    fail(`${tool.id}: stale GitHub-branded return link remains`);
  }
  for (const file of tool.files) {
    if (!(await exists(path.join(distRoot, tool.targetPath, file)))) {
      fail(`${tool.id}: missing allowlisted file ${file}`);
    }
  }
}

const htmlFiles = (await listFiles(distRoot)).filter((file) => file.endsWith(".html"));
const linkPattern = /(?:href|src)="([^"]+)"/g;
for (const htmlFile of htmlFiles) {
  const html = await readFile(htmlFile, "utf8");
  for (const match of html.matchAll(linkPattern)) {
    const value = match[1];
    if (/^(?:https?:|mailto:|tel:|data:|javascript:|#)/.test(value)) continue;
    const clean = value.split(/[?#]/, 1)[0];
    if (!clean) continue;
    const resolved = clean.startsWith("/")
      ? path.join(distRoot, clean)
      : path.resolve(path.dirname(htmlFile), clean);
    const expected = clean.endsWith("/") ? path.join(resolved, "index.html") : resolved;
    if (!(await exists(expected))) {
      fail(`${path.relative(distRoot, htmlFile)}: unresolved asset/link ${value}`);
    }
  }
}

const rootHtml = await readFile(path.join(distRoot, "index.html"), "utf8");
const toolsHtml = await readFile(path.join(distRoot, "tools", "index.html"), "utf8");
if (!rootHtml.includes('rel="canonical" href="https://tools.benhartlage.com/"')) fail("Root canonical URL is missing");
if (!toolsHtml.includes('rel="canonical" href="https://tools.benhartlage.com/"')) fail("Tools canonical URL is missing");
if (!rootHtml.includes("Operations Analysis") || !rootHtml.includes("Business Statistics")) {
  fail("Root hub does not expose both required disciplines");
}

if (errors.length) {
  process.stderr.write(`${errors.join("\n")}\n`);
  process.exit(1);
}

process.stdout.write(`Validated ${htmlFiles.length} HTML files, ${manifest.tools.length} pinned tools, and all local assets.\n`);
