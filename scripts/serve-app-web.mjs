#!/usr/bin/env node
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, "..");
const distDir = resolve(rootDir, "packages/app/dist");
const indexPath = resolve(distDir, "index.html");

const host = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? process.env.PASEO_PORT ?? 4173);

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function isInsideDist(filePath) {
  return filePath === distDir || filePath.startsWith(`${distDir}${sep}`);
}

async function resolveStaticPath(pathname) {
  const pathnameWithIndex = pathname.endsWith("/") ? `${pathname}index.html` : pathname;
  const filePath = resolve(distDir, decodeURIComponent(pathnameWithIndex).replace(/^\/+/, ""));

  if (!isInsideDist(filePath)) {
    return undefined;
  }

  const fileStats = await stat(filePath).catch(() => undefined);
  if (fileStats?.isFile()) {
    return filePath;
  }

  // Expo Router routes should still load when the browser refreshes a nested URL.
  const indexStats = await stat(indexPath).catch(() => undefined);
  if (indexStats?.isFile()) {
    return indexPath;
  }

  return undefined;
}

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url, "http://localhost");
  const filePath = await resolveStaticPath(requestUrl.pathname);

  if (!filePath) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found\n");
    return;
  }

  response.writeHead(200, {
    "content-type": contentTypes[extname(filePath)] ?? "application/octet-stream",
  });
  createReadStream(filePath).pipe(response);
});

server.listen(port, host, () => {
  const urlHost = host.includes(":") ? `[${host}]` : host;
  console.log(`Serving packages/app/dist at http://${urlHost}:${port}`);
});
