/**
 * Schema do formulário de taxas: rótulo, unidade e caminho de cada valor dentro de
 * `RateConfig`. Módulo puro (sem DOM), testado em `test/rate-fields.test.js`.
 */

/** @import { RateConfig } from "../engine/rates.js" */

/**
 * @typedef {object} NumberField
 * @property {"number"} kind
 * @property {string} path Ex.: "shopee.lowPct".
 * @property {string} label
 * @property {"%" | "R$"} unit
 */

/**
 * @typedef {object} ToggleField
 * @property {"toggle"} kind
 * @property {string} path
 * @property {string} label
 */

/** @typedef {NumberField | ToggleField} RateField */

/**
 * @typedef {object} RateGroup
 * @property {string} title
 * @property {string} [note]
 * @property {RateField[]} fields
 */

/** @type {(path: string, label: string) => NumberField} */
const percent = (path, label) => ({ kind: "number", path, label, unit: "%" });
/** @type {(path: string, label: string) => NumberField} */
const money = (path, label) => ({ kind: "number", path, label, unit: "R$" });
/** @type {(path: string, label: string) => ToggleField} */
const toggle = (path, label) => ({ kind: "toggle", path, label });

/** @type {readonly RateGroup[]} */
export const RATE_GROUPS = Object.freeze([
  {
    title: "Imposto",
    note: "Simples Nacional",
    fields: [percent("taxPct", "Alíquota efetiva sobre a venda")],
  },
  {
    title: "Shopee",
    note: "vigência 03/2026",
    fields: [
      percent("shopee.lowPct", "Comissão até R$ 79,99"),
      money("shopee.lowFixed", "Taxa por item R$ 8 a 79,99"),
      percent("shopee.highPct", "Comissão a partir de R$ 80"),
      money("shopee.fixedMid", "Taxa por item R$ 80 a 99,99"),
      money("shopee.fixedHigh", "Taxa por item R$ 100 a 199,99"),
      money("shopee.fixedPremium", "Taxa por item a partir de R$ 200"),
      percent("shopee.microExtraPct", "Abaixo de R$ 8: taxa extra (% do preço)"),
      percent("shopee.extraPct", "Taxa adicional (transação, afiliados)"),
    ],
  },
  {
    title: "Mercado Livre",
    note: "comissão varia por categoria",
    fields: [
      percent("mercadoLivre.classicPct", "Comissão Clássico"),
      percent("mercadoLivre.premiumPct", "Comissão Premium"),
      money("mercadoLivre.fixedBelow79", "Custo por venda abaixo de R$ 79 (varia com peso)"),
      money("mercadoLivre.shippingFrom79", "Frete grátis pago a partir de R$ 79"),
    ],
  },
  {
    title: "TikTok Shop",
    note: "vigência 15/07/2026",
    fields: [
      percent("tiktok.lowPct", "Comissão abaixo de R$ 50"),
      money("tiktok.lowFixed", "Taxa por item abaixo de R$ 50"),
      percent("tiktok.highPct", "Comissão a partir de R$ 50"),
      money("tiktok.highFixed", "Taxa por item a partir de R$ 50"),
      percent("tiktok.freeShippingPct", "Programa de frete grátis"),
      percent("tiktok.affiliatePct", "Comissão de afiliado"),
      toggle("tiktok.freeShipping", "Participa do programa de frete grátis"),
      toggle("tiktok.affiliate", "Vende com afiliados"),
    ],
  },
  {
    title: "Shein",
    note: "0% nos primeiros 30 dias",
    fields: [percent("shein.pct", "Comissão")],
  },
]);

/**
 * @param {RateConfig} rates
 * @param {string} path
 * @returns {unknown}
 */
export function getPath(rates, path) {
  /** @type {any} */
  let node = rates;
  for (const key of path.split(".")) node = node?.[key];
  return node;
}

/**
 * Altera um valor em `rates` (mutando) e devolve o próprio objeto.
 * @param {RateConfig} rates
 * @param {string} path
 * @param {number | boolean} value
 */
export function setPath(rates, path, value) {
  const keys = path.split(".");
  /** @type {any} */
  let node = rates;
  for (const key of keys.slice(0, -1)) node = node[key];
  node[keys[keys.length - 1]] = value;
  return rates;
}

/**
 * Converte o valor guardado para o que aparece no campo (fração → percentual).
 * @param {NumberField} field
 * @param {number} stored
 */
export function toDisplay(field, stored) {
  return field.unit === "%" ? Math.round(stored * 100 * 1000) / 1000 : stored;
}

/**
 * Converte o que foi digitado para o valor guardado (percentual → fração).
 * @param {NumberField} field
 * @param {number} typed
 */
export function fromDisplay(field, typed) {
  return field.unit === "%" ? typed / 100 : typed;
}

/**
 * Mescla taxas salvas com as padrão: chaves novas ganham o valor padrão, chaves que não
 * existem mais são descartadas, e valores de tipo errado são ignorados.
 * @param {RateConfig} defaults
 * @param {unknown} saved
 * @returns {RateConfig}
 */
export function mergeRates(defaults, saved) {
  const result = structuredClone(defaults);
  if (!saved || typeof saved !== "object") return result;
  for (const group of RATE_GROUPS) {
    for (const field of group.fields) {
      const value = getPath(/** @type {RateConfig} */ (saved), field.path);
      const ok =
        field.kind === "toggle"
          ? typeof value === "boolean"
          : typeof value === "number" && Number.isFinite(value) && value >= 0;
      if (ok) setPath(result, field.path, /** @type {number | boolean} */ (value));
    }
  }
  const markup = /** @type {{ markupPct?: unknown }} */ (saved).markupPct;
  if (typeof markup === "number" && Number.isFinite(markup) && markup >= 0) {
    result.markupPct = markup;
  }
  return result;
}
