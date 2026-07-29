import { execFileSync } from "node:child_process";
import { access, copyFile, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = path.join(repoRoot, "dist");
const cacheRoot = path.join(repoRoot, ".tool-cache");
const manifest = JSON.parse(await readFile(path.join(repoRoot, "tool-sources.json"), "utf8"));

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

function runGit(args, options = {}) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: options.encoding ?? "utf8",
    maxBuffer: 20 * 1024 * 1024,
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
  });
}

async function resolveSourceRepository(tool) {
  const repoName = tool.repository.split("/").at(-1);
  const configuredRoot = process.env.PUBLIC_TOOL_REPOS_DIR;
  const siblingRoot = configuredRoot ? path.resolve(configuredRoot) : path.resolve(repoRoot, "..");
  const siblingPath = path.join(siblingRoot, repoName);

  if (await exists(path.join(siblingPath, ".git"))) {
    try {
      runGit(["-C", siblingPath, "cat-file", "-e", `${tool.commit}^{commit}`]);
      return siblingPath;
    } catch {
      throw new Error(`${tool.id}: sibling clone does not contain pinned commit ${tool.commit}`);
    }
  }

  const cachePath = path.join(cacheRoot, repoName);
  await mkdir(cacheRoot, { recursive: true });
  if (!(await exists(path.join(cachePath, ".git")))) {
    runGit(["clone", "--filter=blob:none", `https://github.com/${tool.repository}.git`, cachePath], {
      stdio: "inherit",
    });
  } else {
    runGit(["-C", cachePath, "fetch", "origin"], { stdio: "inherit" });
  }
  runGit(["-C", cachePath, "cat-file", "-e", `${tool.commit}^{commit}`]);
  return cachePath;
}

async function writeGitFile(sourceRepo, commit, gitPath, destination) {
  const contents = runGit(["-C", sourceRepo, "show", `${commit}:${gitPath}`], { encoding: null });
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, contents);
}

const courseMetadata = {
  operations: {
    code: "BUS-3150",
    label: "Operations Analysis",
  },
  statistics: {
    code: "BUS-2150",
    label: "Business Statistics",
  },
};

const publicHubAnchorPattern =
  /<a\b(?=[^>]*\bhref\s*=\s*(["'])https:\/\/tools\.benhartlage\.com\/\1)[^>]*>[\s\S]*?<\/a>/gi;

function appendBodyClassesAndMetadata(source, metadata) {
  return source.replace(/<body\b([^>]*)>/i, (bodyTag, attributes) => {
    const classes = [
      "bh-tool-page",
      `bh-course--${metadata.course}`,
      `bh-family--${metadata.family}`,
    ];
    let decorated = bodyTag;

    if (/\bclass\s*=/i.test(attributes)) {
      decorated = decorated.replace(
        /\bclass\s*=\s*(["'])(.*?)\1/i,
        (_match, quote, existingClasses) => {
          const classList = existingClasses.split(/\s+/).filter(Boolean);
          for (const className of classes) {
            if (!classList.includes(className)) classList.push(className);
          }
          return `class=${quote}${classList.join(" ")}${quote}`;
        },
      );
    } else {
      decorated = decorated.replace(/>$/, ` class="${classes.join(" ")}">`);
    }

    return decorated.replace(
      />$/,
      ` data-bh-course="${metadata.course}" data-bh-family="${metadata.family}" data-bh-tool="${metadata.pageId}">`,
    );
  });
}

function addFallbackSkipLink(source) {
  if (/\bclass\s*=\s*(["'])[^"']*\bskip-link\b/i.test(source)) return source;

  let mainId = source.match(/<main\b[^>]*\bid\s*=\s*(["'])([^"']+)\1/i)?.[2];
  if (!mainId) {
    mainId = "bh-tool-main";
    source = source.replace(/<main\b([^>]*)>/i, (mainTag) =>
      mainTag.replace(/>$/, ` id="${mainId}" tabindex="-1">`),
    );
  }

  return source.replace(
    /<body\b[^>]*>/i,
    (bodyTag) =>
      `${bodyTag}\n    <a class="skip-link" href="#${mainId}">Skip to activity</a>`,
  );
}

function sharedToolBar(metadata) {
  const course = courseMetadata[metadata.course];
  return `
    <nav class="bh-tool-bar" aria-label="Tool navigation">
      <div class="bh-tool-bar__brand">
        <span class="bh-tool-bar__mark" aria-hidden="true">BH</span>
        <span class="bh-tool-bar__brand-copy">
          <strong>Dr. Ben Hartlage</strong>
          <small>Stats &amp; Operations Analysis</small>
        </span>
      </div>
      <div class="bh-tool-bar__context">
        <span>${course.code}</span>
        <strong>${course.label}</strong>
      </div>
      <a class="hub-return-link" href="https://tools.benhartlage.com/">
        <span aria-hidden="true">&larr;</span> Return to all tools
      </a>
    </nav>`;
}

function insertSharedToolBar(source, metadata) {
  const bar = sharedToolBar(metadata);
  const skipLinkPattern =
    /<a\b[^>]*\bclass\s*=\s*(["'])[^"']*\bskip-link\b[^"']*\1[^>]*>[\s\S]*?<\/a>/i;

  if (skipLinkPattern.test(source)) {
    return source.replace(skipLinkPattern, (skipLink) => `${skipLink}${bar}`);
  }

  return source.replace(/<body\b[^>]*>/i, (bodyTag) => `${bodyTag}${bar}`);
}

function insertSharedToolFooter(source, metadata) {
  const course = courseMetadata[metadata.course];
  const footer = `
    <div class="bh-tool-footer" role="note" aria-label="Tool access and course information">
      <strong>${course.code} &middot; ${course.label}</strong>
      <span>Browser-local classroom tool &middot; No account &middot; No retained responses</span>
    </div>
  `;
  return source.replace("</body>", `${footer}</body>`);
}

function removeExternalFontLinks(source) {
  return source.replace(
    /\s*<link\b[^>]*(?:fonts\.googleapis\.com|fonts\.gstatic\.com)[^>]*>\s*/gi,
    "\n",
  );
}

function removeOriginalHubReturn(source, expectedCount, pageId) {
  let matchCount = 0;
  let normalized = source.replace(publicHubAnchorPattern, () => {
    matchCount += 1;
    return "";
  });

  if (matchCount !== expectedCount) {
    throw new Error(
      `${pageId}: expected ${expectedCount} source public-hub return link(s), found ${matchCount}`,
    );
  }

  normalized = normalized
    .replace(
      /<(div|p)\b[^>]*\bclass\s*=\s*(["'])[^"']*\b(?:return-link-row|return-row)\b[^"']*\2[^>]*>\s*<\/\1>/gi,
      "",
    )
    .replace(/<p>\s*<\/p>/gi, "");
  return normalized;
}

function injectThemeAssets(source) {
  const withoutExisting = source
    .replace(
      /\s*<link\b[^>]*\bhref\s*=\s*(["'])\/(?:theme|tool-theme|hub-return)\.css\1[^>]*>\s*/gi,
      "\n",
    )
    .replace(
      /\s*<meta\b[^>]*\bname\s*=\s*(["'])theme-color\1[^>]*>\s*/gi,
      "\n",
    );
  return withoutExisting.replace(
    "</head>",
    [
      '  <meta name="theme-color" content="#191d4c" />',
      '  <link rel="stylesheet" href="/theme.css" />',
      '  <link rel="stylesheet" href="/tool-theme.css" />',
      '  <link rel="stylesheet" href="/hub-return.css" />',
      "</head>",
    ].join("\n"),
  );
}

async function decorateToolHtml(tool, htmlFile) {
  const htmlPath = path.join(distRoot, tool.targetPath, htmlFile);
  const isRootPage = htmlFile === "index.html";
  const pageSegment = isRootPage ? tool.id : path.posix.dirname(htmlFile).split("/").at(-1);
  const metadata = {
    course: tool.course,
    family: isRootPage ? tool.family : "decision-lab",
    pageId: isRootPage ? tool.id : `${tool.id}-${pageSegment}`,
  };

  let source = await readFile(htmlPath, "utf8");
  source = removeExternalFontLinks(source);
  source = removeOriginalHubReturn(source, isRootPage ? 1 : 0, metadata.pageId);
  source = appendBodyClassesAndMetadata(source, metadata);
  source = addFallbackSkipLink(source);
  source = insertSharedToolBar(source, metadata);
  source = insertSharedToolFooter(source, metadata);
  source = injectThemeAssets(source);
  await writeFile(htmlPath, source);
}

await rm(distRoot, { recursive: true, force: true });
await mkdir(path.join(distRoot, "tools"), { recursive: true });

for (const file of [
  "index.html",
  "styles.css",
  "theme.css",
  "tool-theme.css",
  "hub-return.css",
  "robots.txt",
  "sitemap.xml",
  "_headers",
  "404.html",
]) {
  await copyFile(path.join(repoRoot, file), path.join(distRoot, file));
}

const directoryHtml = await readFile(path.join(repoRoot, "index.html"), "utf8");
await writeFile(path.join(distRoot, "tools", "index.html"), directoryHtml);
await cp(path.join(repoRoot, "bus-2150"), path.join(distRoot, "bus-2150"), {
  recursive: true,
});

for (const tool of manifest.tools) {
  const sourceRepo = await resolveSourceRepository(tool);
  for (const file of tool.files) {
    const sourcePath = path.posix.join(tool.sourcePath, file).replace(/^\.\//, "");
    const destination = path.join(distRoot, tool.targetPath, file);
    await writeGitFile(sourceRepo, tool.commit, sourcePath, destination);
  }
  for (const htmlFile of tool.files.filter((file) => file.endsWith(".html"))) {
    await decorateToolHtml(tool, htmlFile);
  }
  process.stdout.write(`Composed ${tool.id} from ${tool.repository}@${tool.commit.slice(0, 12)}\n`);
}

await writeFile(
  path.join(distRoot, "deployment-manifest.json"),
  `${JSON.stringify({ schemaVersion: manifest.schemaVersion, tools: manifest.tools }, null, 2)}\n`,
);

process.stdout.write(`Built ${manifest.tools.length} tools into ${distRoot}\n`);
