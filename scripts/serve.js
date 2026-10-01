/**
 * Servidor estático mínimo para desenvolvimento e para o teste de ponta a ponta.
 * Módulos ES não carregam por file://, por isso o app precisa de um servidor.
 * Uso: `npm start` (porta 5173) ou `PORT=8080 npm start`.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const TYPES = /** @type {Record<string, string>} */ ({
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
});

/**
 * @param {number} port
 * @returns {Promise<import("node:http").Server>}
 */
export function startServer(port) {
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
    const file = normalize(join(ROOT, path === "/" ? "index.html" : path));
    if (!file.startsWith(ROOT) || file.includes("node_modules")) {
      res.writeHead(403).end();
      return;
    }
    try {
      const body = await readFile(file);
      res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404).end("não encontrado");
    }
  });
  return new Promise((ok) => server.listen(port, "127.0.0.1", () => ok(server)));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 5173);
  await startServer(port);
  console.log(`Precificador em http://127.0.0.1:${port}`);
}
