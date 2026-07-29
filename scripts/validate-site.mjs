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
  "study-design-bias/index.html",
  "normal-area/index.html",
  "sampling-distribution/index.html",
  "inference-decision/index.html",
  "comparing-groups/index.html",
  "linear-regression/index.html",
  "categorical-risk/index.html",
  "statistical-investigation/index.html",
  "bus-3150/index.html",
  "bus-3150/lp-formulation-sensitivity/index.html",
  "bus-3150/network-integer-decisions/index.html",
  "bus-3150/simulation-operating-risk/index.html",
  "bus-3150/forecast-to-decision/index.html",
  "hub-return.css",
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
  if (!html.includes('href="/hub-return.css"')) {
    fail(`${tool.id}: shared return-link stylesheet is missing`);
  }

  const returnAnchors = html.match(
    /<a\b[^>]*\bhref\s*=\s*["']https:\/\/tools\.benhartlage\.com\/["'][^>]*>[\s\S]*?<\/a>/gi,
  ) ?? [];
  if (returnAnchors.length !== 1) {
    fail(`${tool.id}: expected exactly one return link to the public hub, found ${returnAnchors.length}`);
  } else {
    const returnAnchor = returnAnchors[0];
    const openingTag = returnAnchor.slice(0, returnAnchor.indexOf(">") + 1);
    if (!/\bclass\s*=\s*["'][^"']*\bhub-return-link\b[^"']*["']/i.test(openingTag)) {
      fail(`${tool.id}: shared return-link class is missing from the public-hub anchor`);
    }
    if (!/<span aria-hidden="true">\u2190<\/span>\s+Return to all tools<\/a>$/i.test(returnAnchor)) {
      fail(`${tool.id}: return-link label is not standardized`);
    }
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
const headerRules = await readFile(path.join(distRoot, "_headers"), "utf8");
if (!rootHtml.includes('rel="canonical" href="https://tools.benhartlage.com/"')) fail("Root canonical URL is missing");
if (!toolsHtml.includes('rel="canonical" href="https://tools.benhartlage.com/"')) fail("Tools canonical URL is missing");
if (!rootHtml.includes("Operations Analysis") || !rootHtml.includes("Business Statistics")) {
  fail("Root hub does not expose both required disciplines");
}
if (!/Cache-Control:[^\r\n]*\bno-transform\b/.test(headerRules)) {
  fail("HTML responses do not prohibit analytics or other edge payload injection");
}

const expectedToolIds = [
  "linear-programming",
  "study-design-bias",
  "normal-area",
  "sampling-distribution",
  "inference-decision",
  "comparing-groups",
  "linear-regression",
  "categorical-risk",
  "statistical-investigation",
  "bus-3150",
];
if (JSON.stringify(manifest.tools.map((tool) => tool.id)) !== JSON.stringify(expectedToolIds)) {
  fail("Pinned tool manifest does not match the approved ten-tool catalog");
}

for (const toolId of expectedToolIds) {
  const targetPath = manifest.tools.find((tool) => tool.id === toolId)?.targetPath;
  if (!targetPath || !rootHtml.includes(`href="/${targetPath}/"`)) {
    fail(`Root hub does not expose ${toolId}`);
  }
}

const bus2150Tools = manifest.tools.filter((tool) => tool.id !== "linear-programming");
const forbiddenRuntimePatterns = [
  ["external Google font", /fonts\.(?:googleapis|gstatic)\.com/],
  ["network request", /\b(?:fetch|XMLHttpRequest)\s*\(/],
  ["local storage", /\b(?:localStorage|sessionStorage)\b/],
  ["cookie access", /\bdocument\.cookie\b/],
];
for (const tool of bus2150Tools) {
  for (const file of tool.files) {
    const contents = await readFile(path.join(distRoot, tool.targetPath, file), "utf8");
    for (const [label, pattern] of forbiddenRuntimePatterns) {
      if (pattern.test(contents)) fail(`${tool.id}: forbidden ${label} dependency in ${file}`);
    }
  }
}

for (const route of [
  "lp-formulation-sensitivity",
  "network-integer-decisions",
  "simulation-operating-risk",
  "forecast-to-decision",
]) {
  const html = await readFile(path.join(distRoot, "bus-3150", route, "index.html"), "utf8");
  const canonical = `https://tools.benhartlage.com/bus-3150/${route}/`;
  if (!html.includes(`rel="canonical" href="${canonical}"`)) {
    fail(`bus-3150/${route}: canonical URL does not match ${canonical}`);
  }
}

const anovaApp = await readFile(path.join(distRoot, "comparing-groups", "app.js"), "utf8");
if (!anovaApp.includes('q.get("lab")==="anova"')) {
  fail("Comparing Groups Lab does not expose the approved ?lab=anova entry mode");
}

if (errors.length) {
  process.stderr.write(`${errors.join("\n")}\n`);
  process.exit(1);
}

process.stdout.write(`Validated ${htmlFiles.length} HTML files, ${manifest.tools.length} pinned tools, and all local assets.\n`);
