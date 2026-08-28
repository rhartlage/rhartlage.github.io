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

function attributeValue(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "i"));
  return match?.[2];
}

function classTokens(tag) {
  return (attributeValue(tag, "class") ?? "").split(/\s+/).filter(Boolean);
}

function countClassToken(source, token) {
  let count = 0;
  for (const match of source.matchAll(/<[^!/][^>]*\bclass\s*=\s*(["'])(.*?)\1[^>]*>/gi)) {
    if (match[2].split(/\s+/).includes(token)) count += 1;
  }
  return count;
}

function countStylesheet(source, href) {
  let count = 0;
  for (const match of source.matchAll(/<link\b[^>]*>/gi)) {
    if (attributeValue(match[0], "href") === href) count += 1;
  }
  return count;
}

function anchorHrefCounts(source) {
  const counts = new Map();
  for (const match of source.matchAll(/<a\b[^>]*>/gi)) {
    const href = attributeValue(match[0], "href");
    if (href) counts.set(href, (counts.get(href) ?? 0) + 1);
  }
  return counts;
}

function assertOrdered(source, firstNeedle, secondNeedle, description) {
  const firstIndex = source.indexOf(firstNeedle);
  const secondIndex = source.indexOf(secondNeedle);
  if (firstIndex === -1 || secondIndex === -1 || firstIndex >= secondIndex) {
    fail(`${description}: expected ${firstNeedle} before ${secondNeedle}`);
  }
}

const requiredRoutes = [
  "index.html",
  "tools/index.html",
  "bus-2150/index.html",
  "linear-programming/index.html",
  "linear-programming-3d/index.html",
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
  "theme.css",
  "tool-theme.css",
  "hub-return.css",
  "robots.txt",
  "sitemap.xml",
  "404.html",
];

for (const route of requiredRoutes) {
  if (!(await exists(path.join(distRoot, route)))) fail(`Missing required output: ${route}`);
}

for (const tool of manifest.tools) {
  for (const file of tool.files) {
    if (!(await exists(path.join(distRoot, tool.targetPath, file)))) {
      fail(`${tool.id}: missing allowlisted file ${file}`);
    }
  }

  for (const htmlFile of tool.files.filter((file) => file.endsWith(".html"))) {
    const htmlPath = path.join(distRoot, tool.targetPath, htmlFile);
    const html = await readFile(htmlPath, "utf8");
    const pageDirectory = path.posix.dirname(htmlFile);
    const routePath =
      pageDirectory === "." ? tool.targetPath : `${tool.targetPath}/${pageDirectory}`;
    const expectedCanonical = `https://tools.benhartlage.com/${routePath}/`;
    const expectedFamily = pageDirectory === "." ? tool.family : "decision-lab";
    const pageSegment = pageDirectory === "." ? tool.id : pageDirectory.split("/").at(-1);
    const expectedPageId =
      pageDirectory === "." ? tool.id : `${tool.id}-${pageSegment}`;
    const pageLabel = pageDirectory === "." ? tool.id : `${tool.id}/${pageDirectory}`;

    if (!html.includes(`rel="canonical" href="${expectedCanonical}"`)) {
      fail(`${pageLabel}: canonical URL does not match ${expectedCanonical}`);
    }

    for (const stylesheet of ["/theme.css", "/tool-theme.css", "/hub-return.css"]) {
      const count = countStylesheet(html, stylesheet);
      if (count !== 1) {
        fail(`${pageLabel}: expected exactly one ${stylesheet} stylesheet, found ${count}`);
      }
    }

    const bodyTag = html.match(/<body\b[^>]*>/i)?.[0];
    if (!bodyTag) {
      fail(`${pageLabel}: body element is missing`);
    } else {
      const expectedClasses = [
        "bh-tool-page",
        `bh-course--${tool.course}`,
        `bh-family--${expectedFamily}`,
      ];
      const bodyClasses = classTokens(bodyTag);
      for (const expectedClass of expectedClasses) {
        if (!bodyClasses.includes(expectedClass)) {
          fail(`${pageLabel}: body class ${expectedClass} is missing`);
        }
      }
      const expectedAttributes = {
        "data-bh-course": tool.course,
        "data-bh-family": expectedFamily,
        "data-bh-tool": expectedPageId,
      };
      for (const [name, value] of Object.entries(expectedAttributes)) {
        if (attributeValue(bodyTag, name) !== value) {
          fail(`${pageLabel}: ${name} does not match ${value}`);
        }
      }
    }

    const barCount = countClassToken(html, "bh-tool-bar");
    if (barCount !== 1) {
      fail(`${pageLabel}: expected exactly one shared tool bar, found ${barCount}`);
    }
    const barTag = html.match(/<nav\b[^>]*\bclass\s*=\s*(["'])[^"']*\bbh-tool-bar\b[^"']*\1[^>]*>/i)?.[0];
    if (!barTag || attributeValue(barTag, "aria-label") !== "Tool navigation") {
      fail(`${pageLabel}: shared tool bar must be a labeled navigation landmark`);
    }
    const footerCount = countClassToken(html, "bh-tool-footer");
    if (footerCount !== 1) {
      fail(`${pageLabel}: expected exactly one shared tool footer, found ${footerCount}`);
    }
    const footerTag = html.match(/<div\b[^>]*\bclass\s*=\s*(["'])[^"']*\bbh-tool-footer\b[^"']*\1[^>]*>/i)?.[0];
    if (
      !footerTag ||
      attributeValue(footerTag, "role") !== "note" ||
      attributeValue(footerTag, "aria-label") !== "Tool access and course information"
    ) {
      fail(`${pageLabel}: shared tool footer must be a labeled non-landmark note`);
    }

    const anchorElements = html.match(/<a\b[^>]*>[\s\S]*?<\/a>/gi) ?? [];
    const labeledReturnAnchors = anchorElements.filter((anchor) =>
      /Return to all tools/i.test(anchor),
    );
    if (labeledReturnAnchors.length !== 1) {
      fail(
        `${pageLabel}: expected exactly one all-tools link, found ${labeledReturnAnchors.length}`,
      );
    }

    const returnAnchors = anchorElements.filter((anchor) => {
      const openingTag = anchor.slice(0, anchor.indexOf(">") + 1);
      return attributeValue(openingTag, "href") === "https://tools.benhartlage.com/";
    });
    if (returnAnchors.length !== 1) {
      fail(
        `${pageLabel}: expected exactly one return link to the public hub, found ${returnAnchors.length}`,
      );
    } else {
      const returnAnchor = returnAnchors[0];
      const openingTag = returnAnchor.slice(0, returnAnchor.indexOf(">") + 1);
      if (!classTokens(openingTag).includes("hub-return-link")) {
        fail(`${pageLabel}: shared return-link class is missing from the public-hub anchor`);
      }
      if (
        !/<span\s+aria-hidden\s*=\s*(["'])true\1>\s*(?:&larr;|&#x2190;|&#8592;|\u2190)\s*<\/span>\s*Return to all tools\s*<\/a>$/i.test(
          returnAnchor,
        )
      ) {
        fail(`${pageLabel}: return-link label is not standardized`);
      }
    }

    if (html.includes("Main GitHub Tools Page")) {
      fail(`${pageLabel}: stale GitHub-branded return link remains`);
    }
    if (/fonts\.(?:googleapis|gstatic)\.com/i.test(html)) {
      fail(`${pageLabel}: external Google font dependency remains in generated HTML`);
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
const bus2150Html = await readFile(path.join(distRoot, "bus-2150", "index.html"), "utf8");
const headerRules = await readFile(path.join(distRoot, "_headers"), "utf8");
if (!rootHtml.includes('rel="canonical" href="https://tools.benhartlage.com/"')) fail("Root canonical URL is missing");
if (!toolsHtml.includes('rel="canonical" href="https://tools.benhartlage.com/"')) fail("Tools canonical URL is missing");
if (!bus2150Html.includes('rel="canonical" href="https://tools.benhartlage.com/bus-2150/"')) {
  fail("BUS-2150 suite canonical URL is missing");
}
if (!rootHtml.includes("Operations Analysis") || !rootHtml.includes("Business Statistics")) {
  fail("Root hub does not expose both required disciplines");
}
for (const stylesheet of ["/theme.css", "/tool-theme.css", "/hub-return.css"]) {
  if (countStylesheet(bus2150Html, stylesheet) !== 1) {
    fail(`BUS-2150 suite does not load exactly one ${stylesheet} stylesheet`);
  }
}
if (!/Cache-Control:[^\r\n]*\bno-transform\b/.test(headerRules)) {
  fail("HTML responses do not prohibit analytics or other edge payload injection");
}

const expectedToolIds = [
  "linear-programming",
  "linear-programming-3d",
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
  fail("Pinned tool manifest does not match the approved eleven-tool catalog");
}

const expectedToolMetadata = {
  "linear-programming": { course: "operations", family: "studio" },
  "linear-programming-3d": { course: "operations", family: "studio" },
  "study-design-bias": { course: "statistics", family: "module" },
  "normal-area": { course: "statistics", family: "studio" },
  "sampling-distribution": { course: "statistics", family: "studio" },
  "inference-decision": { course: "statistics", family: "module" },
  "comparing-groups": { course: "statistics", family: "module" },
  "linear-regression": { course: "statistics", family: "studio" },
  "categorical-risk": { course: "statistics", family: "module" },
  "statistical-investigation": { course: "statistics", family: "module" },
  "bus-3150": { course: "operations", family: "decision-labs" },
};
for (const tool of manifest.tools) {
  const expected = expectedToolMetadata[tool.id];
  if (!expected || tool.course !== expected.course || tool.family !== expected.family) {
    fail(
      `${tool.id}: course/family metadata does not match ${expected?.course ?? "unknown"}/${expected?.family ?? "unknown"}`,
    );
  }
}

const courseControls = rootHtml.match(
  /<nav\b(?=[^>]*\bclass\s*=\s*(["'])[^"']*\bcourse-controls\b[^"']*\1)[^>]*>[\s\S]*?<\/nav>/i,
)?.[0];
if (!courseControls) {
  fail("Root hub course controls are missing");
} else {
  assertOrdered(
    courseControls,
    'href="#business-statistics"',
    'href="#operations-analysis"',
    "Root hub course selector order",
  );
}
const statisticsSectionIndex = rootHtml.search(
  /<section\b(?=[^>]*\bid\s*=\s*(["'])business-statistics\1)[^>]*>/i,
);
const operationsSectionIndex = rootHtml.search(
  /<section\b(?=[^>]*\bid\s*=\s*(["'])operations-analysis\1)[^>]*>/i,
);
if (
  statisticsSectionIndex === -1 ||
  operationsSectionIndex === -1 ||
  statisticsSectionIndex >= operationsSectionIndex
) {
  fail("Root hub discipline sections do not place BUS-2150 before BUS-3150");
}

const groupedLabRoutes = [
  "/study-design-bias/",
  "/inference-decision/",
  "/comparing-groups/",
  "/categorical-risk/",
];
const directHomeRoutes = [
  "/bus-2150/",
  "/normal-area/",
  "/sampling-distribution/",
  "/linear-regression/",
  "/statistical-investigation/",
  "/linear-programming/",
  "/linear-programming-3d/",
  "/bus-3150/",
];
const homeHrefCounts = anchorHrefCounts(rootHtml);
const suiteHrefCounts = anchorHrefCounts(bus2150Html);
const isLocalPageRoute = (route) => route !== "/" && /^\/[^?#]*\/$/.test(route);
const actualHomeToolRoutes = [...homeHrefCounts.keys()].filter(isLocalPageRoute);
if (JSON.stringify(actualHomeToolRoutes.sort()) !== JSON.stringify([...directHomeRoutes].sort())) {
  fail(
    `Root hub direct tool links do not match the approved directory: ${actualHomeToolRoutes.join(", ")}`,
  );
}
for (const route of directHomeRoutes) {
  if (homeHrefCounts.get(route) !== 1) {
    fail(`Root hub expected exactly one direct link to ${route}`);
  }
}
const actualSuiteToolRoutes = [...suiteHrefCounts.keys()].filter(isLocalPageRoute);
if (
  JSON.stringify(actualSuiteToolRoutes.sort()) !== JSON.stringify([...groupedLabRoutes].sort())
) {
  fail(
    `BUS-2150 suite links do not match the four grouped chapter labs: ${actualSuiteToolRoutes.join(", ")}`,
  );
}
for (const route of groupedLabRoutes) {
  if (suiteHrefCounts.get(route) !== 1) {
    fail(`BUS-2150 suite expected exactly one link to ${route}`);
  }
}

const bus2150Tools = manifest.tools.filter((tool) => tool.course === "statistics");
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

const anovaApp = await readFile(path.join(distRoot, "comparing-groups", "app.js"), "utf8");
if (!anovaApp.includes('q.get("lab")==="anova"')) {
  fail("Comparing Groups Lab does not expose the approved ?lab=anova entry mode");
}

if (errors.length) {
  process.stderr.write(`${errors.join("\n")}\n`);
  process.exit(1);
}

process.stdout.write(`Validated ${htmlFiles.length} HTML files, ${manifest.tools.length} pinned tools, and all local assets.\n`);
