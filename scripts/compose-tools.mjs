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

await rm(distRoot, { recursive: true, force: true });
await mkdir(path.join(distRoot, "tools"), { recursive: true });

for (const file of ["index.html", "styles.css", "robots.txt", "sitemap.xml", "_headers", "404.html"]) {
  await copyFile(path.join(repoRoot, file), path.join(distRoot, file));
}

const directoryHtml = await readFile(path.join(repoRoot, "index.html"), "utf8");
await writeFile(path.join(distRoot, "tools", "index.html"), directoryHtml);

for (const tool of manifest.tools) {
  const sourceRepo = await resolveSourceRepository(tool);
  for (const file of tool.files) {
    const sourcePath = path.posix.join(tool.sourcePath, file).replace(/^\.\//, "");
    const destination = path.join(distRoot, tool.targetPath, file);
    await writeGitFile(sourceRepo, tool.commit, sourcePath, destination);
  }
  process.stdout.write(`Composed ${tool.id} from ${tool.repository}@${tool.commit.slice(0, 12)}\n`);
}

await writeFile(
  path.join(distRoot, "deployment-manifest.json"),
  `${JSON.stringify({ schemaVersion: manifest.schemaVersion, tools: manifest.tools }, null, 2)}\n`,
);

process.stdout.write(`Built ${manifest.tools.length} tools into ${distRoot}\n`);
