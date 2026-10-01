/**
 * Gera os prints do README em `docs/img/` usando o navegador instalado.
 * Uso: `npm run screenshots`.
 */
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";
import { startServer } from "./serve.js";

const OUT = new URL("../docs/img/", import.meta.url);

const server = await startServer(0);
const { port } = /** @type {import("node:net").AddressInfo} */ (server.address());
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? "chrome" });
await mkdir(OUT, { recursive: true });

/** @type {[string, number, number, "light" | "dark", boolean][]} */
const shots = [
  ["desktop-claro", 1440, 1000, "light", false],
  ["desktop-escuro", 1440, 1000, "dark", false],
  ["celular", 390, 844, "light", true],
];

for (const [name, width, height, theme, fullPage] of shots) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.evaluate((t) => {
    document.documentElement.dataset.theme = t;
  }, theme);
  await page.click("#load-example");
  await page.waitForSelector("#channels-section:not([hidden])");
  await page.fill("#search", "EX-008");
  await page.keyboard.press("Enter");
  await page.locator("#margin").fill("15");
  await page.waitForTimeout(2500); // espera o aviso "produtos carregados" sumir
  await page.screenshot({
    path: decodeURIComponent(new URL(`${name}.png`, OUT).pathname).replace(/^\/([A-Za-z]:)/, "$1"),
    fullPage,
  });
  await page.close();
  console.log(`docs/img/${name}.png`);
}

await browser.close();
server.close();
