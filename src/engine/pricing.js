/**
 * Motor de precificação: funções puras, sem DOM.
 *
 * Definições (todas por pedido):
 * - Valor Base  = custo × (1 + markup) × quantidade do kit. É o valor que precisa voltar
 *   para o caixa; o motor nunca deixa as taxas comerem esse valor.
 * - Lucro extra = preço − taxas da plataforma − imposto − Valor Base.
 * - Margem      = lucro extra ÷ preço de venda.
 *
 * Numa faixa com percentual `p` e fixo `f`, o preço que entrega a margem `m` é
 *   P = (Valor Base + f) ÷ (1 − p − imposto − m).
 * Como as faixas têm taxas diferentes, a conta é feita em cada uma e vale o menor preço que
 * cai dentro da própria faixa.
 */

import { bandAt } from "./channels.js";

/** @import { Band, Channel, ChannelKey } from "./channels.js" */
/** @import { RateConfig } from "./rates.js" */

const CENT = 0.01;
const EPS = 1e-9;

/** @param {number} value */
export function roundCents(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Arredonda para cima no centavo: preço nunca fica abaixo do necessário. */
/** @param {number} value */
export function ceilCents(value) {
  return Math.ceil(value * 100 - EPS) / 100;
}

/**
 * @typedef {object} Breakdown
 * @property {Band} band
 * @property {number} commission Parte percentual da taxa da plataforma.
 * @property {number} fixed Parte fixa da taxa da plataforma.
 * @property {number} platformFee commission + fixed.
 * @property {number} tax Imposto sobre a venda.
 * @property {number} profit Lucro extra (acima do Valor Base).
 * @property {number} margin profit ÷ preço.
 * @property {number} cashBack O que volta para o caixa: Valor Base + lucro extra.
 */

/**
 * Composição de uma venda a um preço.
 * @param {Band[]} bands
 * @param {number} price
 * @param {number} baseValue
 * @param {number} taxPct
 * @returns {Breakdown}
 */
export function breakdownAt(bands, price, baseValue, taxPct) {
  const band = bandAt(bands, price);
  const commission = price * band.pct;
  const platformFee = commission + band.fixed;
  const tax = price * taxPct;
  const profit = price - platformFee - tax - baseValue;
  return {
    band,
    commission,
    fixed: band.fixed,
    platformFee,
    tax,
    profit,
    margin: price > 0 ? profit / price : 0,
    cashBack: baseValue + profit,
  };
}

/**
 * Menor preço (em centavos) cuja margem é pelo menos `marginPct`.
 * @param {Band[]} bands
 * @param {number} baseValue
 * @param {number} taxPct
 * @param {number} marginPct
 * @returns {number | null} `null` quando nenhuma faixa consegue entregar a margem.
 */
export function solveListPrice(bands, baseValue, taxPct, marginPct) {
  /** @type {number | null} */
  let best = null;
  for (const band of bands) {
    const den = 1 - band.pct - taxPct - marginPct;
    if (den <= EPS) continue;
    const price = ceilCents(Math.max((baseValue + band.fixed) / den, band.lo));
    if (price < band.hi && (best === null || price < best)) best = price;
  }
  return best;
}

/**
 * Maior desconto que ainda não dá prejuízo em nenhum preço entre o de vitrine e o com desconto.
 * Desce faixa por faixa a partir do preço de vitrine, porque uma faixa mais barata pode ter taxa
 * fixa menor e voltar a dar lucro, mas o desconto precisa ser seguro no caminho todo.
 * @param {Band[]} bands
 * @param {number} listPrice
 * @param {number} baseValue
 * @param {number} taxPct
 * @returns {number} Fração entre 0 e 1.
 */
export function maxSafeDiscount(bands, listPrice, baseValue, taxPct) {
  if (listPrice <= 0 || breakdownAt(bands, listPrice, baseValue, taxPct).profit < -EPS) return 0;
  const start = bands.indexOf(bandAt(bands, listPrice));
  let floor = 0;
  for (let i = start; i >= 0; i--) {
    const band = bands[i];
    const top = i === start ? listPrice : band.hi;
    const den = 1 - band.pct - taxPct;
    const breakEven = den > EPS ? (baseValue + band.fixed) / den : Infinity;
    if (breakEven > band.lo) {
      floor = Math.min(Math.max(breakEven, band.lo), top);
      break;
    }
    floor = band.lo;
  }
  return Math.max(0, 1 - ceilCents(floor) / listPrice);
}

/**
 * @typedef {object} QuoteInput
 * @property {number} baseValue Valor Base do pedido (já com markup e kit).
 * @property {RateConfig} rates
 * @property {number} marginPct Margem extra desejada (fração).
 * @property {number} discountPct Desconto de vitrine simulado (fração).
 * @property {number | null} [manualListPrice] Preço de vitrine digitado pelo usuário.
 */

/**
 * @typedef {object} Quote
 * @property {ChannelKey} key
 * @property {string} name
 * @property {boolean} feasible Falso quando a margem pedida é impossível nesse canal.
 * @property {boolean} manual Preço veio do usuário, não do motor.
 * @property {number} listPrice Preço de vitrine (cheio).
 * @property {number} salePrice O que o cliente paga, com o desconto simulado.
 * @property {Breakdown} breakdown Composição da venda ao `salePrice`.
 * @property {number} maxDiscount
 * @property {"ok" | "below-target" | "loss" | "infeasible"} status
 * @property {string} feeLabel Ex.: "20% + R$ 4,00".
 */

/**
 * Cotação de um canal.
 * @param {Channel} channel
 * @param {QuoteInput} input
 * @returns {Quote}
 */
export function quoteChannel(channel, input) {
  const { baseValue, rates, marginPct, discountPct } = input;
  const bands = channel.bands(rates);
  const manual = typeof input.manualListPrice === "number" && input.manualListPrice > 0;
  const solved = manual
    ? /** @type {number} */ (input.manualListPrice)
    : solveListPrice(bands, baseValue, rates.taxPct, marginPct);
  const feasible = solved !== null;
  const listPrice = solved ?? 0;
  const salePrice = roundCents(listPrice * (1 - discountPct));
  const breakdown = breakdownAt(bands, salePrice, baseValue, rates.taxPct);

  /** @type {Quote["status"]} */
  let status = "ok";
  if (!feasible) status = "infeasible";
  else if (breakdown.profit < -CENT / 2) status = "loss";
  else if (breakdown.margin < marginPct - 0.0005) status = "below-target";

  return {
    key: channel.key,
    name: channel.name,
    feasible,
    manual,
    listPrice,
    salePrice,
    breakdown,
    maxDiscount: feasible ? maxSafeDiscount(bands, listPrice, baseValue, rates.taxPct) : 0,
    status,
    feeLabel: formatFeeLabel(breakdown.band),
  };
}

/**
 * Valor Base de um pedido.
 * @param {number} unitCost Custo unitário do produto.
 * @param {number} markupPct
 * @param {number} kitQty Unidades no pedido (kit). Taxas fixas são cobradas uma vez.
 */
export function baseValueOf(unitCost, markupPct, kitQty = 1) {
  return unitCost * (1 + markupPct) * kitQty;
}

/** @param {Band} band */
function formatFeeLabel(band) {
  const pct = `${roundCents(band.pct * 100).toLocaleString("pt-BR")}%`;
  if (band.fixed === 0) return pct;
  return `${pct} + R$ ${band.fixed.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
