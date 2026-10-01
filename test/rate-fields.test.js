import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_RATES, cloneDefaultRates } from "../src/engine/rates.js";
import {
  RATE_GROUPS,
  fromDisplay,
  getPath,
  mergeRates,
  setPath,
  toDisplay,
} from "../src/ui/rate-fields.js";

const fields = RATE_GROUPS.flatMap((g) => g.fields);

test("todo campo do formulário aponta para uma taxa que existe, com o tipo certo", () => {
  for (const field of fields) {
    const value = getPath(cloneDefaultRates(), field.path);
    const expected = field.kind === "toggle" ? "boolean" : "number";
    assert.equal(typeof value, expected, field.path);
  }
});

test("toda taxa editável tem um campo no formulário (nada escondido)", () => {
  const covered = new Set(fields.map((f) => f.path));
  covered.add("markupPct"); // fica no cartão Estratégia
  /** @param {Record<string, unknown>} obj @param {string} prefix @returns {string[]} */
  const leaves = (obj, prefix = "") =>
    Object.entries(obj).flatMap(([k, v]) =>
      v && typeof v === "object"
        ? leaves(/** @type {Record<string, unknown>} */ (v), `${prefix}${k}.`)
        : [`${prefix}${k}`],
    );
  for (const path of leaves(/** @type {any} */ (DEFAULT_RATES))) {
    assert.ok(covered.has(path), `sem campo: ${path}`);
  }
});

test("percentual: 20 na tela ↔ 0,2 guardado", () => {
  const field = /** @type {import("../src/ui/rate-fields.js").NumberField} */ (fields[0]);
  assert.equal(fromDisplay(field, 20), 0.2);
  assert.equal(toDisplay(field, 0.07), 7);
});

test("setPath altera o caminho certo", () => {
  const r = cloneDefaultRates();
  setPath(r, "shopee.lowFixed", 0);
  assert.equal(r.shopee.lowFixed, 0);
});

test("mergeRates: aceita zero, ignora lixo e completa chaves novas", () => {
  const merged = mergeRates(cloneDefaultRates(), {
    taxPct: 0,
    shopee: { lowPct: "abc", lowFixed: -1 },
    tiktok: { affiliate: true },
    removida: 123,
  });
  assert.equal(merged.taxPct, 0);
  assert.equal(merged.shopee.lowPct, DEFAULT_RATES.shopee.lowPct);
  assert.equal(merged.shopee.lowFixed, DEFAULT_RATES.shopee.lowFixed);
  assert.equal(merged.tiktok.affiliate, true);
  assert.equal(merged.shein.pct, DEFAULT_RATES.shein.pct);
  assert.equal("removida" in merged, false);
});

test("mergeRates: entrada inválida devolve as padrão", () => {
  assert.deepEqual(mergeRates(cloneDefaultRates(), null), cloneDefaultRates());
});
