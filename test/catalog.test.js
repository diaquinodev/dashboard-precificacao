import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decodeText,
  mergeProducts,
  normalizeHeader,
  parseCsv,
  parseNumber,
  readCatalog,
  sheetsCsvUrl,
  toCsv,
} from "../src/engine/catalog.js";

test("parseNumber: formatos brasileiro e americano", () => {
  /** @type {[string, number | null][]} */
  const cases = [
    ["59,90", 59.9],
    ["59.90", 59.9], // regressão bug 3: antes virava 5990
    ["59.9", 59.9],
    ["1.234,56", 1234.56], // regressão bug 5: antes virava 1,234
    ["1,234.56", 1234.56],
    ["R$ 1.234,56", 1234.56],
    ["R$" + String.fromCharCode(0xa0) + "89,90", 89.9],
    ["1.234", 1234],
    ["12.345.678", 12345678],
    ["100", 100],
    ["0", 0],
    ["", null],
    ["abc", null],
    ["-5", null],
    ["1,2,3", null],
    ["1.2.3", null],
  ];
  for (const [input, expected] of cases) assert.equal(parseNumber(input), expected, input);
});

test("parseCsv: separador ponto e vírgula, aspas, BOM e CRLF", () => {
  const rows = parseCsv(
    String.fromCharCode(0xfeff) + 'sku;nome;custo\r\nA1;"Blusa; manga ""longa""";29,90\r\n',
  );
  assert.deepEqual(rows, [
    ["sku", "nome", "custo"],
    ["A1", 'Blusa; manga "longa"', "29,90"],
  ]);
});

test("parseCsv: separador vírgula com decimal entre aspas", () => {
  assert.deepEqual(parseCsv('sku,nome,custo\nA1,Saia,"39,90"'), [
    ["sku", "nome", "custo"],
    ["A1", "Saia", "39,90"],
  ]);
});

test("normalizeHeader: acentos, maiúsculas e sublinhado", () => {
  assert.equal(normalizeHeader("  Custo_Unitário "), "custo unitario");
  assert.equal(normalizeHeader("Descrição"), "descricao");
});

test("readCatalog: lê produtos, ignora linhas ruins e explica o motivo", () => {
  const csv = [
    "Catálogo exportado em 01/10/2026",
    "",
    "Código;Nome do Produto;Custo Unitário",
    "A1;Blusa;29,90",
    "A2;Saia;R$ 1.234,56",
    "A3;;10",
    "A4;Calça;",
    "A1;Repetida;5",
    ";Sem SKU;12.5",
    ";;",
  ].join("\n");
  const { products, issues } = readCatalog(csv);
  assert.deepEqual(products, [
    { sku: "A1", name: "Blusa", unitCost: 29.9 },
    { sku: "A2", name: "Saia", unitCost: 1234.56 },
    { sku: "LINHA-9", name: "Sem SKU", unitCost: 12.5 },
  ]);
  assert.deepEqual(
    issues.map((i) => i.line),
    [6, 7, 8],
  );
  assert.match(issues[2].reason, /repetido/);
});

test("readCatalog: sem coluna custo, explica", () => {
  const { products, issues } = readCatalog("sku;nome;preco\nA1;Blusa;10");
  assert.equal(products.length, 0);
  assert.match(issues[0].reason, /custo/);
});

test("readCatalog: sem coluna nome, explica", () => {
  const { products, issues } = readCatalog("sku;custo\nA1;10");
  assert.equal(products.length, 0);
  assert.match(issues[0].reason, /nome/);
});

test("toCsv → readCatalog devolve o mesmo catálogo", () => {
  const products = [
    { sku: "X;1", name: 'Vestido "midi"', unitCost: 79.9 },
    { sku: "X2", name: "Top", unitCost: 1234.5 },
  ];
  assert.deepEqual(readCatalog(toCsv(products)).products, products);
});

test("o catálogo de exemplo carrega sem problemas", async () => {
  const { readFile } = await import("node:fs/promises");
  const text = await readFile(new URL("../data/catalogo-exemplo.csv", import.meta.url), "utf8");
  const { products, issues } = readCatalog(text);
  assert.equal(issues.length, 0);
  assert.ok(products.length >= 10);
});

test("sheetsCsvUrl: link de edição, publicado e inválido", () => {
  assert.equal(
    sheetsCsvUrl("https://docs.google.com/spreadsheets/d/AbC-123_x/edit#gid=42"),
    "https://docs.google.com/spreadsheets/d/AbC-123_x/export?format=csv&gid=42",
  );
  assert.equal(
    sheetsCsvUrl("https://docs.google.com/spreadsheets/d/AbC/edit?usp=sharing"),
    "https://docs.google.com/spreadsheets/d/AbC/export?format=csv&gid=0",
  );
  const published =
    "https://docs.google.com/spreadsheets/d/e/2PACX-x/pub?gid=0&single=true&output=csv";
  assert.equal(sheetsCsvUrl(published), published);
  assert.equal(sheetsCsvUrl("https://exemplo.com/planilha.csv"), null);
});

test("mergeProducts: atualiza pelo SKU sem diferenciar maiúsculas e acrescenta os novos", () => {
  const current = [
    { sku: "A1", name: "Blusa", unitCost: 10 },
    { sku: "MAN-001", name: "Manual", unitCost: 5 },
  ];
  const { products, added, updated } = mergeProducts(current, [
    { sku: "a1", name: "Blusa nova", unitCost: 12 },
    { sku: "B2", name: "Saia", unitCost: 20 },
  ]);
  assert.equal(added, 1);
  assert.equal(updated, 1);
  assert.deepEqual(
    products.map((p) => `${p.sku}:${p.unitCost}`),
    ["a1:12", "MAN-001:5", "B2:20"],
  );
  assert.equal(current[0].unitCost, 10, "não altera o catálogo original");
});

test("decodeText: UTF-8 e Windows-1252 (CSV do Excel)", () => {
  assert.equal(decodeText(new TextEncoder().encode("Calça;29,90")), "Calça;29,90");
  // "Calça" em Windows-1252: ç = 0xE7
  const cp1252 = new Uint8Array([0x43, 0x61, 0x6c, 0xe7, 0x61]);
  assert.equal(decodeText(cp1252), "Calça");
});
