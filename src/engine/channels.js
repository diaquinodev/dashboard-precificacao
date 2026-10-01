/**
 * Cada canal de venda é descrito como faixas de preço contíguas. Dentro de uma faixa, o
 * custo da plataforma é linear no preço: `pct * preço + fixed`. Essa forma é o que permite
 * resolver o preço exato em `pricing.js`, faixa por faixa.
 */

/** @import { RateConfig } from "./rates.js" */

/**
 * @typedef {object} Band
 * @property {number} lo Início da faixa (inclusivo), em reais.
 * @property {number} hi Fim da faixa (exclusivo); `Infinity` na última.
 * @property {number} pct Soma dos percentuais cobrados sobre o preço de venda.
 * @property {number} fixed Valor fixo por pedido (taxa por item ou frete).
 */

/**
 * @typedef {object} Channel
 * @property {ChannelKey} key
 * @property {string} name
 * @property {(rates: RateConfig) => Band[]} bands
 */

/** @typedef {"shopee" | "mlClassic" | "mlPremium" | "tiktok" | "shein"} ChannelKey */

/** @param {RateConfig} r @returns {Band[]} */
function shopeeBands(r) {
  const s = r.shopee;
  return [
    { lo: 0, hi: 8, pct: s.lowPct + s.microExtraPct + s.extraPct, fixed: 0 },
    { lo: 8, hi: 80, pct: s.lowPct + s.extraPct, fixed: s.lowFixed },
    { lo: 80, hi: 100, pct: s.highPct + s.extraPct, fixed: s.fixedMid },
    { lo: 100, hi: 200, pct: s.highPct + s.extraPct, fixed: s.fixedHigh },
    { lo: 200, hi: Infinity, pct: s.highPct + s.extraPct, fixed: s.fixedPremium },
  ];
}

/** @param {number} pct @param {RateConfig} r @returns {Band[]} */
function mercadoLivreBands(pct, r) {
  const m = r.mercadoLivre;
  return [
    { lo: 0, hi: 79, pct, fixed: m.fixedBelow79 },
    { lo: 79, hi: Infinity, pct, fixed: m.shippingFrom79 },
  ];
}

/** @param {RateConfig} r @returns {Band[]} */
function tiktokBands(r) {
  const t = r.tiktok;
  const extra = (t.freeShipping ? t.freeShippingPct : 0) + (t.affiliate ? t.affiliatePct : 0);
  return [
    { lo: 0, hi: 50, pct: t.lowPct + extra, fixed: t.lowFixed },
    { lo: 50, hi: Infinity, pct: t.highPct + extra, fixed: t.highFixed },
  ];
}

/** @param {RateConfig} r @returns {Band[]} */
function sheinBands(r) {
  return [{ lo: 0, hi: Infinity, pct: r.shein.pct, fixed: 0 }];
}

/** @type {readonly Channel[]} */
export const CHANNELS = Object.freeze([
  { key: "shopee", name: "Shopee", bands: shopeeBands },
  {
    key: "mlClassic",
    name: "ML Clássico",
    bands: (r) => mercadoLivreBands(r.mercadoLivre.classicPct, r),
  },
  {
    key: "mlPremium",
    name: "ML Premium",
    bands: (r) => mercadoLivreBands(r.mercadoLivre.premiumPct, r),
  },
  { key: "tiktok", name: "TikTok Shop", bands: tiktokBands },
  { key: "shein", name: "Shein", bands: sheinBands },
]);

/**
 * Faixa que contém o preço.
 * @param {Band[]} bands
 * @param {number} price
 * @returns {Band}
 */
export function bandAt(bands, price) {
  const found = bands.find((b) => price >= b.lo && price < b.hi);
  return found ?? bands[bands.length - 1];
}
