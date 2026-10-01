/**
 * Taxas padrão de cada marketplace.
 *
 * São só pontos de partida: todas ficam editáveis na tela, porque mudam ao longo do ano e
 * variam por categoria e por conta. As fontes de cada valor estão em `docs/taxas.md`.
 * Percentuais são frações (0.2 = 20%); valores fixos são em reais.
 */

/**
 * @typedef {object} RateConfig
 * @property {number} taxPct Imposto sobre a venda (alíquota efetiva do Simples Nacional).
 * @property {number} markupPct Acréscimo sobre o custo que forma o Valor Base (0.5 = +50%).
 * @property {{ microExtraPct: number, lowPct: number, lowFixed: number, highPct: number,
 *   fixedMid: number, fixedHigh: number, fixedPremium: number, extraPct: number }} shopee
 * @property {{ classicPct: number, premiumPct: number, fixedBelow79: number,
 *   shippingFrom79: number }} mercadoLivre
 * @property {{ lowPct: number, lowFixed: number, highPct: number, highFixed: number,
 *   freeShippingPct: number, freeShipping: boolean, affiliatePct: number,
 *   affiliate: boolean }} tiktok
 * @property {{ pct: number }} shein
 */

export const RATES_VALID_FROM = "2026-07-15";

/** @type {Readonly<RateConfig>} */
export const DEFAULT_RATES = Object.freeze({
  taxPct: 0.07,
  markupPct: 0.5,
  shopee: {
    // Até R$ 7,99: 20% + taxa por item de metade do preço (equivale a +50% sobre o preço).
    microExtraPct: 0.5,
    lowPct: 0.2,
    lowFixed: 4,
    highPct: 0.14,
    fixedMid: 16,
    fixedHigh: 20,
    fixedPremium: 26,
    // Taxa adicional opcional (ex.: transação ou comissão extra de afiliados).
    extraPct: 0,
  },
  mercadoLivre: {
    classicPct: 0.13,
    premiumPct: 0.16,
    // Desde 03/2026 varia com peso e dimensões; o valor é uma média editável.
    fixedBelow79: 6.75,
    // Frete grátis obrigatório a partir de R$ 79, pago pelo vendedor.
    shippingFrom79: 22,
  },
  tiktok: {
    lowPct: 0.1,
    lowFixed: 4,
    highPct: 0.06,
    highFixed: 6,
    freeShippingPct: 0.06,
    freeShipping: true,
    affiliatePct: 0.1,
    affiliate: false,
  },
  shein: {
    pct: 0.16,
  },
});

/**
 * Cópia profunda e editável das taxas padrão.
 * @returns {RateConfig}
 */
export function cloneDefaultRates() {
  return structuredClone(/** @type {RateConfig} */ (DEFAULT_RATES));
}
