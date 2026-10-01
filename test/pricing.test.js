import { test } from "node:test";
import assert from "node:assert/strict";
import { CHANNELS } from "../src/engine/channels.js";
import { cloneDefaultRates } from "../src/engine/rates.js";
import {
  baseValueOf,
  breakdownAt,
  maxSafeDiscount,
  quoteChannel,
  solveListPrice,
} from "../src/engine/pricing.js";

const rates = cloneDefaultRates();

/** Custos de R$ 1 a R$ 500, de R$ 0,25 em R$ 0,25. */
const COSTS = Array.from({ length: 1997 }, (_, i) => 1 + i * 0.25);

/** @param {import("../src/engine/channels.js").Channel} channel @param {number} cost */
const quote = (channel, cost, marginPct = 0, discountPct = 0) =>
  quoteChannel(channel, { baseValue: cost, rates, marginPct, discountPct });

test("exemplo calculado à mão: Shopee, Valor Base R$ 30, margem 0%", () => {
  // Faixa R$ 8–79,99: P = (30 + 4) / (1 − 0,20 − 0,07) = 46,575… → R$ 46,58
  const q = quote(CHANNELS[0], 30);
  assert.equal(q.listPrice, 46.58);
  assert.equal(q.feeLabel, "20% + R$ 4,00");
  assert.ok(q.breakdown.profit >= 0 && q.breakdown.profit < 0.01);
});

test("margem 0%: lucro extra nunca negativo em nenhum canal e custo", () => {
  for (const channel of CHANNELS) {
    for (const cost of COSTS) {
      const q = quote(channel, cost);
      assert.ok(q.feasible, `${channel.key} ${cost}`);
      assert.ok(
        q.breakdown.profit >= -0.005,
        `${channel.key} custo ${cost}: ${q.breakdown.profit}`,
      );
    }
  }
});

test("margem 0%: lucro extra é R$ 0,00, salvo quando o preço cai no início de uma faixa", () => {
  for (const channel of CHANNELS) {
    const starts = channel.bands(rates).map((b) => b.lo);
    for (const cost of COSTS) {
      const q = quote(channel, cost);
      if (starts.includes(q.listPrice)) continue;
      assert.ok(q.breakdown.profit < 0.01, `${channel.key} custo ${cost}: ${q.breakdown.profit}`);
    }
  }
});

test("margem alvo é atingida e o preço é o menor possível (1 centavo a menos não atinge)", () => {
  for (const margin of [0.1, 0.2, 0.35]) {
    for (const channel of CHANNELS) {
      const bands = channel.bands(rates);
      for (const cost of COSTS) {
        const q = quote(channel, cost, margin);
        assert.ok(q.breakdown.margin >= margin - 1e-6, `${channel.key} ${cost} ${margin}`);
        const below = breakdownAt(bands, q.listPrice - 0.01, cost, rates.taxPct);
        assert.ok(below.margin < margin, `${channel.key} ${cost} ${margin}: não é o menor preço`);
      }
    }
  }
});

test("regressão bug 2: fronteira de faixa não gera prejuízo (TikTok antigo, custo R$ 62)", () => {
  // Modelo antigo: 12% + R$ 2 abaixo de R$ 79, 12% sem fixo a partir de R$ 79.
  // O código antigo devolvia R$ 76,54 cobrando o fixo de R$ 2: prejuízo de R$ 2.
  const bands = [
    { lo: 0, hi: 79, pct: 0.12, fixed: 2 },
    { lo: 79, hi: Infinity, pct: 0.12, fixed: 0 },
  ];
  const price = solveListPrice(bands, 62, 0.07, 0);
  assert.equal(price, 79);
  assert.ok(breakdownAt(bands, /** @type {number} */ (price), 62, 0.07).profit >= 0);
});

test("regressão bug 4: margem impossível vira 'inatingível', não um preço absurdo", () => {
  const q = quote(CHANNELS[0], 50, 0.8);
  assert.equal(q.feasible, false);
  assert.equal(q.status, "infeasible");
  assert.equal(q.listPrice, 0);
});

test("desconto máximo seguro: no limite não há prejuízo; 1 centavo além, há", () => {
  for (const channel of CHANNELS) {
    const bands = channel.bands(rates);
    for (const cost of COSTS.filter((_, i) => i % 7 === 0)) {
      const q = quote(channel, cost, 0.25);
      const floorPrice = Math.ceil(q.listPrice * (1 - q.maxDiscount) * 100 - 1e-6) / 100;
      for (let p = floorPrice; p <= q.listPrice; p = Math.round((p + 0.5) * 100) / 100) {
        const b = breakdownAt(bands, p, cost, rates.taxPct);
        assert.ok(b.profit >= -0.005, `${channel.key} ${cost}: prejuízo a R$ ${p}`);
      }
      if (q.maxDiscount > 0 && floorPrice > 0.01) {
        const b = breakdownAt(bands, floorPrice - 0.01, cost, rates.taxPct);
        assert.ok(b.profit < 0, `${channel.key} ${cost}: desconto podia ser maior`);
      }
    }
  }
});

test("desconto além do seguro marca prejuízo", () => {
  const q0 = quote(CHANNELS[4], 40, 0.1);
  const q = quote(CHANNELS[4], 40, 0.1, q0.maxDiscount + 0.05);
  assert.equal(q.status, "loss");
  assert.ok(q.salePrice < q.listPrice);
});

test("maxSafeDiscount é 0 quando o preço de vitrine já dá prejuízo", () => {
  const bands = CHANNELS[4].bands(rates);
  assert.equal(maxSafeDiscount(bands, 10, 50, rates.taxPct), 0);
});

test("preço manual é respeitado e o desconto incide sobre ele", () => {
  const q = quoteChannel(CHANNELS[4], {
    baseValue: 30,
    rates,
    marginPct: 0,
    discountPct: 0.1,
    manualListPrice: 100,
  });
  assert.equal(q.manual, true);
  assert.equal(q.listPrice, 100);
  assert.equal(q.salePrice, 90);
  assert.ok(Math.abs(q.breakdown.profit - (90 - 14.4 - 6.3 - 30)) < 1e-9);
});

test("kit: Valor Base multiplica, taxa fixa é cobrada uma vez por pedido", () => {
  assert.equal(baseValueOf(10, 0.5, 3), 45);
  const one = quote(CHANNELS[1], baseValueOf(20, 0.5, 1));
  const kit = quote(CHANNELS[1], baseValueOf(20, 0.5, 2));
  assert.equal(one.breakdown.fixed, rates.mercadoLivre.fixedBelow79);
  assert.ok(kit.breakdown.fixed === rates.mercadoLivre.fixedBelow79 || kit.listPrice >= 79);
});

test("taxas zeradas são aceitas (regressão bug 1 no motor)", () => {
  const zero = cloneDefaultRates();
  zero.taxPct = 0;
  zero.shein.pct = 0;
  const q = quoteChannel(CHANNELS[4], { baseValue: 50, rates: zero, marginPct: 0, discountPct: 0 });
  assert.equal(q.listPrice, 50);
  assert.equal(q.breakdown.platformFee, 0);
});

test("TikTok: frete grátis e afiliado entram no percentual só quando ligados", () => {
  const r = cloneDefaultRates();
  const tiktok = CHANNELS[3];
  assert.equal(tiktok.bands(r)[1].pct, 0.12);
  r.tiktok.freeShipping = false;
  assert.equal(tiktok.bands(r)[1].pct, 0.06);
  r.tiktok.affiliate = true;
  assert.equal(tiktok.bands(r)[1].pct, 0.16);
});

test("Shopee abaixo de R$ 8: 20% + metade do preço", () => {
  const bands = CHANNELS[0].bands(rates);
  const b = breakdownAt(bands, 5, 0, 0);
  assert.ok(Math.abs(b.platformFee - 3.5) < 1e-9);
});
