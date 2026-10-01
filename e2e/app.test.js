/**
 * Teste de ponta a ponta: abre a tela no navegador instalado (Chrome ou Edge; escolha com
 * BROWSER_CHANNEL=chrome) e usa o app como uma pessoa usaria.
 * Rodar com `npm run e2e`. Prints vão para `e2e/screenshots/`.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { startServer } from "../scripts/serve.js";
import { CHANNELS } from "../src/engine/channels.js";
import { baseValueOf, quoteChannel } from "../src/engine/pricing.js";
import { cloneDefaultRates } from "../src/engine/rates.js";

/** @typedef {import("playwright-core").Page} Page */

const NBSP = String.fromCharCode(0xa0); // o Intl põe espaço não separável depois de R$
const SHOTS = new URL("./screenshots/", import.meta.url);
/** @type {import("node:http").Server} */
let server;
/** @type {import("playwright-core").Browser} */
let browser;
let baseUrl = "";

before(async () => {
  server = await startServer(0);
  const address = /** @type {import("node:net").AddressInfo} */ (server.address());
  baseUrl = `http://127.0.0.1:${address.port}/`;
  browser = await launchInstalledBrowser();
  await mkdir(SHOTS, { recursive: true });
});

/** Usa o navegador já instalado (sem baixar nada): BROWSER_CHANNEL, senão Chrome, senão Edge. */
async function launchInstalledBrowser() {
  const channels = process.env.BROWSER_CHANNEL
    ? [process.env.BROWSER_CHANNEL]
    : ["chrome", "msedge"];
  /** @type {unknown} */
  let lastError;
  for (const channel of channels) {
    try {
      return await chromium.launch({ channel });
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

after(async () => {
  await browser?.close();
  server?.close();
});

/**
 * Página nova (armazenamento limpo) que falha o teste em qualquer erro de console.
 * @param {{ width?: number, height?: number }} [size]
 */
async function open(size = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900, ...size } });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseUrl });
  const page = await context.newPage();
  /** @type {string[]} */
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  await page.goto(baseUrl);
  return { page, context, errors };
}

/** @param {Page} page */
async function loadExample(page) {
  await page.click("#load-example");
  await page.waitForSelector("#channels-section:not([hidden])");
}

/** @param {Page} page @param {string} key */
const card = (page, key) => page.locator(`article[aria-labelledby="ch-${key}"]`);

/** @param {number} n */
const ptBR = (n) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

test("estado inicial: sem produto, sem erros", async () => {
  const { page, context, errors } = await open();
  assert.match((await page.textContent("#alert-text")) ?? "", /Escolha ou cadastre/);
  assert.equal(await page.isHidden("#channels-section"), true);
  assert.equal(await page.textContent("#rates-date"), "15/07/2026");
  assert.deepEqual(errors, []);
  await context.close();
});

test("catálogo de exemplo: preços na tela são os mesmos do motor", async () => {
  const { page, context, errors } = await open();
  await loadExample(page);
  assert.equal(await page.textContent("#catalog-count"), "12 no catálogo");
  assert.equal(await page.textContent("#sel-sku"), "EX-001");
  const base = baseValueOf(4.2, 0.5, 1);
  assert.equal(await page.textContent("#sel-base"), `R$${NBSP}${ptBR(base)}`);
  for (const channel of CHANNELS) {
    const q = quoteChannel(channel, {
      baseValue: base,
      rates: cloneDefaultRates(),
      marginPct: 0,
      discountPct: 0,
    });
    const shown = await card(page, channel.key).locator(".price-input").inputValue();
    assert.equal(shown, ptBR(q.listPrice), channel.key);
  }
  assert.equal(await page.locator("#compare-body tr").count(), 5);
  assert.match((await page.textContent("#alert-text")) ?? "", /Valor Base protegido/);
  assert.deepEqual(errors, []);
  await context.close();
});

test("busca com teclado: digita sem acento, seta e Enter", async () => {
  const { page, context } = await open();
  await loadExample(page);
  await page.fill("#search", "calca");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  assert.equal(await page.textContent("#sel-name"), "Calça pantalona");
  assert.equal(await page.isHidden("#search-results"), true);
  await context.close();
});

test("cadastro manual: valida, adiciona e calcula; kit dobra o Valor Base", async () => {
  const { page, context } = await open();
  await page.click("#tab-add");
  await page.fill("#add-name", "Vestido teste");
  await page.fill("#add-cost", "abc");
  await page.click("#add-form button[type=submit]");
  assert.equal(await page.getAttribute("#add-cost", "aria-invalid"), "true");
  await page.fill("#add-cost", "29,90");
  await page.click("#add-form button[type=submit]");
  assert.equal(await page.textContent("#sel-name"), "Vestido teste");
  assert.equal(await page.textContent("#sel-sku"), "MAN-001");
  assert.equal(await page.textContent("#sel-base"), `R$${NBSP}44,85`);
  await page.click('#kit-buttons button[data-qty="2"]');
  assert.equal(await page.textContent("#sel-base"), `R$${NBSP}89,70`);
  await context.close();
});

test("editar o custo do produto selecionado recalcula", async () => {
  const { page, context } = await open();
  await loadExample(page);
  await page.fill("#sel-cost", "100");
  assert.equal(await page.textContent("#sel-base"), `R$${NBSP}150,00`);
  await context.close();
});

test("margem extra e desconto: alerta muda de verde para vermelho", async () => {
  const { page, context } = await open();
  await loadExample(page);
  await page.locator("#margin").fill("20");
  assert.match((await page.textContent("#alert-text")) ?? "", /20% de margem extra/);
  const margin = await card(page, "shein").locator(".metric-value").nth(1).textContent();
  assert.ok(Number((margin ?? "").replace("%", "").replace(",", ".")) >= 20, margin ?? "");
  await page.locator("#discount").fill("50");
  assert.match((await page.textContent("#alert-text")) ?? "", /Prejuízo em/);
  assert.equal(await page.getAttribute("#alert", "class"), "alert bad");
  await context.close();
});

test("preço manual: marca o cartão, mostra prejuízo e volta ao calculado", async () => {
  const { page, context } = await open();
  await loadExample(page);
  const shein = card(page, "shein");
  const original = await shein.locator(".price-input").inputValue();
  await shein.locator(".price-input").fill("1");
  assert.equal(await shein.locator(".badge-manual").isVisible(), true);
  assert.match((await shein.locator(".status").textContent()) ?? "", /Prejuízo/);
  await shein.getByRole("button", { name: /Voltar ao preço calculado/ }).click();
  assert.equal(await shein.locator(".badge-manual").isHidden(), true);
  await page.locator("#search").focus();
  assert.equal(await shein.locator(".price-input").inputValue(), original);
  await context.close();
});

test("taxas: zero é aceito (bug 1) e texto inválido é sinalizado", async () => {
  const { page, context } = await open();
  await loadExample(page);
  await page.click("#rates-panel summary");
  const input = page.getByRole("textbox", { name: "Shein: Comissão (%)", exact: true });
  await input.fill("0");
  assert.equal(await card(page, "shein").locator(".fee-label").textContent(), "0%");
  assert.equal(await page.isVisible("#rates-changed"), true);
  await input.fill("abc");
  assert.equal(await input.getAttribute("aria-invalid"), "true");
  await page.click("#rates-reset");
  assert.equal(await card(page, "shein").locator(".fee-label").textContent(), "16%");
  assert.equal(await page.isHidden("#rates-changed"), true);
  await context.close();
});

test("upload de CSV do Excel (Windows-1252, ;) com linha ruim", async () => {
  const { page, context } = await open();
  await page.click("#tab-import");
  const csv = "Código;Descrição;Custo Unitário\r\nB-1;Calça linho;R$ 59,90\r\nB-2;Saia;\r\n";
  const bytes = Buffer.from(csv, "latin1");
  await page.setInputFiles("#file-input", {
    name: "catalogo.csv",
    mimeType: "text/csv",
    buffer: bytes,
  });
  await page.waitForSelector("#import-report .ok");
  const report = (await page.textContent("#import-report")) ?? "";
  assert.match(report, /1 produto\(s\)/);
  assert.match(report, /Linha 3: Custo inválido/);
  assert.equal(await page.textContent("#sel-name"), "Calça linho");
  await context.close();
});

test("link do Google Sheets: lê CSV público e explica quando não é público", async () => {
  const { page, context } = await open();
  await page.route("https://docs.google.com/**", (route) => {
    const url = route.request().url();
    if (url.includes("/d/PUBLICA/")) {
      route.fulfill({ status: 200, contentType: "text/csv", body: "sku,nome,custo\nG1,Top,15.5" });
    } else {
      route.fulfill({ status: 200, contentType: "text/html", body: "<!DOCTYPE html><html>" });
    }
  });
  await page.click("#tab-import");
  await page.fill("#sheets-url", "https://docs.google.com/spreadsheets/d/PRIVADA/edit#gid=0");
  await page.click("#sheets-form button");
  await page.waitForSelector("#import-report .bad");
  assert.match((await page.textContent("#import-report")) ?? "", /Qualquer pessoa com o link/);
  await page.fill("#sheets-url", "https://docs.google.com/spreadsheets/d/PUBLICA/edit#gid=0");
  await page.click("#sheets-form button");
  await page.waitForSelector("#import-report .ok");
  assert.equal(await page.textContent("#sel-name"), "Top");
  await page.fill("#sheets-url", "https://exemplo.com/x.csv");
  await page.click("#sheets-form button");
  assert.match((await page.textContent("#import-report")) ?? "", /não parece um link/);
  await context.close();
});

test("persistência: catálogo, produto e taxas sobrevivem ao recarregar", async () => {
  const { page, context } = await open();
  await loadExample(page);
  await page.fill("#search", "EX-007");
  await page.keyboard.press("Enter");
  await page.click("#rates-panel summary");
  await page.getByRole("textbox", { name: "Shein: Comissão (%)", exact: true }).fill("18");
  await page.reload();
  assert.equal(await page.textContent("#catalog-count"), "12 no catálogo");
  assert.equal(await page.textContent("#sel-sku"), "EX-007");
  assert.equal(await card(page, "shein").locator(".fee-label").textContent(), "18%");
  await context.close();
});

test("copiar preços, exportar catálogo e alternar tema", async () => {
  const { page, context } = await open();
  await loadExample(page);
  await page.click("#copy-all");
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(clip, /Meia cano curto \(par\) \(EX-001\) — kit 1x/);
  assert.match(clip, /Shein: R\$/);
  await page.click("#tab-import");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.click("#export-catalog"),
  ]);
  assert.equal(download.suggestedFilename(), "catalogo.csv");
  await page.click("#theme-toggle");
  const theme = await page.evaluate(() => document.documentElement.dataset.theme);
  assert.ok(theme === "dark" || theme === "light");
  await context.close();
});

test("responsivo: sem rolagem horizontal da página em 360, 768 e 1280 px", async () => {
  for (const [width, height] of [
    [360, 780],
    [768, 1024],
    [1280, 900],
  ]) {
    for (const theme of ["light", "dark"]) {
      const { page, context, errors } = await open({ width, height });
      await page.evaluate((t) => {
        document.documentElement.dataset.theme = t;
      }, theme);
      await loadExample(page);
      await page.fill("#search", "EX-008");
      await page.keyboard.press("Enter");
      await page.locator("#discount").fill("10");
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      assert.ok(overflow <= 0, `${width}px ${theme}: página rola ${overflow}px na horizontal`);
      await page.screenshot({
        path: fileURLToPath(new URL(`${width}-${theme}.png`, SHOTS)),
        fullPage: true,
      });
      assert.deepEqual(errors, []);
      await context.close();
    }
  }
});
