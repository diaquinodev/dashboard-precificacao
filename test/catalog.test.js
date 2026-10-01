import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeHeader,
  parseCsv,
  parseNumber,
  readCatalog,
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
