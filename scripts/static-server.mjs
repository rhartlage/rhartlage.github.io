import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = path.join(repoRoot, "dist");
const port = Number(process.env.PORT || 4173);
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    const decoded = decodeURIComponent(url.pathname);
    let target = path.join(distRoot, decoded);
    const targetStat = await stat(target).catch(() => null);
    if (targetStat?.isDirectory()) target = path.join(target, "index.html");
    const finalStat = await stat(target).catch(() => null);
    if (!finalStat?.isFile() || !target.startsWith(distRoot)) target = path.join(distRoot, "404.html");
    const body = await readFile(target);
    response.writeHead(target.endsWith("404.html") ? 404 : 200, {
      "Content-Type": contentTypes[path.extname(target)] || "application/octet-stream",
    });
    response.end(body);
  } catch (error) {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Local preview error");
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  }
}).listen(port, "127.0.0.1", () => {
  process.stdout.write(`Public hub preview: http://127.0.0.1:${port}/\n`);
});
