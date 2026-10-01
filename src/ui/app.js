/**
 * Tela do precificador. Guarda o estado, chama o motor (`src/engine`) e atualiza o DOM.
 * Os cartões de canal são criados uma vez e só têm os valores trocados a cada cálculo,
 * para não tirar o foco de quem está digitando um preço.
 */

import {
  decodeText,
  mergeProducts,
  parseNumber,
  readCatalog,
  sheetsCsvUrl,
  toCsv,
} from "../engine/catalog.js";
import { CHANNELS } from "../engine/channels.js";
import { baseValueOf, quoteChannel } from "../engine/pricing.js";
import { RATES_VALID_FROM, cloneDefaultRates } from "../engine/rates.js";
import { byId, h } from "./dom.js";
import { brl, dateBR, decimal, pct } from "./format.js";
import {
  RATE_GROUPS,
  fromDisplay,
  getPath,
  mergeRates,
  setPath,
  toDisplay,
} from "./rate-fields.js";
import { load, save } from "./storage.js";

/** @import { Product, CatalogIssue } from "../engine/catalog.js" */
/** @import { ChannelKey } from "../engine/channels.js" */
/** @import { Quote } from "../engine/pricing.js" */
/** @import { NumberField } from "./rate-fields.js" */

const KIT_OPTIONS = [1, 2, 3, 4];
const SEARCH_LIMIT = 30;

/** @returns {Record<ChannelKey, number | null>} */
const noManualPrices = () => ({
  shopee: null,
  mlClassic: null,
  mlPremium: null,
  tiktok: null,
  shein: null,
});

const state = {
  /** @type {Product[]} */
  products: sanitizeProducts(load("catalog", [])),
  /** @type {Product | null} */
  selected: null,
  kitQty: 1,
  marginPct: clampNumber(load("margin", 0), 0, 0.6),
  discountPct: 0,
  rates: mergeRates(cloneDefaultRates(), load("rates", null)),
  manual: noManualPrices(),
  /** @type {Quote[]} */
  quotes: [],
};

/* ============================== util ============================== */

/** @param {unknown} value @param {number} min @param {number} max */
function clampNumber(value, min, max) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : min;
}

/** @param {unknown} raw @returns {Product[]} */
function sanitizeProducts(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (p) =>
      p &&
      typeof p.sku === "string" &&
      typeof p.name === "string" &&
      typeof p.unitCost === "number" &&
      p.unitCost > 0,
  );
}

/** Texto sem acento e minúsculo, para a busca. */
/** @param {string} s */
function fold(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

let toastTimer = 0;
/** @param {string} message */
function toast(message) {
  const el = byId("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove("show"), 2200);
}

/** @param {string} text */
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/* ============================== catálogo ============================== */

function persistCatalog() {
  save("catalog", state.products);
}

function renderCatalogState() {
  const n = state.products.length;
  byId("catalog-count").textContent = `${n} no catálogo`;
  byId("search-empty").hidden = n > 0;
  /** @type {HTMLButtonElement} */ (byId("export-catalog")).disabled = n === 0;
  /** @type {HTMLButtonElement} */ (byId("clear-catalog")).disabled = n === 0;
}

/** @param {Product} product */
function selectProduct(product) {
  state.selected = product;
  state.kitQty = 1;
  state.manual = noManualPrices();
  save("selected", product.sku);
  closeSearch();
  /** @type {HTMLInputElement} */ (byId("search")).value = "";
  renderSelected();
  recalc();
}

function clearSelection() {
  state.selected = null;
  save("selected", null);
  renderSelected();
  recalc();
  byId("search").focus();
}

function renderSelected() {
  const p = state.selected;
  byId("selected").hidden = !p;
  if (!p) return;
  byId("sel-sku").textContent = p.sku;
  byId("sel-name").textContent = p.name;
  const cost = /** @type {HTMLInputElement} */ (byId("sel-cost"));
  if (document.activeElement !== cost) {
    cost.value = decimal(p.unitCost);
    cost.removeAttribute("aria-invalid");
  }
  for (const btn of byId("kit-buttons").querySelectorAll("button")) {
    btn.setAttribute("aria-pressed", String(Number(btn.dataset.qty) === state.kitQty));
  }
}

/**
 * @param {Product[]} incoming
 * @param {CatalogIssue[]} issues
 * @param {string} source
 */
function applyImport(incoming, issues, source) {
  const report = byId("import-report");
  report.replaceChildren();
  if (incoming.length > 0) {
    const merged = mergeProducts(state.products, incoming);
    state.products = merged.products;
    persistCatalog();
    renderCatalogState();
    report.append(
      h("p", {
        class: "ok",
        text: `✓ ${incoming.length} produto(s) de ${source}: ${merged.added} novo(s), ${merged.updated} atualizado(s).`,
      }),
    );
  }
  if (issues.length > 0) {
    report.append(
      h("p", {
        class: incoming.length > 0 ? "" : "bad",
        text: `${incoming.length > 0 ? "⚠" : "✕"} ${issues.length} linha(s) ignorada(s):`,
      }),
      h("ul", {}, ...issues.map((i) => h("li", { text: `Linha ${i.line}: ${i.reason}` }))),
    );
  }
  if (incoming.length > 0) {
    toast(`${incoming.length} produto(s) carregado(s)`);
    if (!state.selected) selectProduct(state.products[0]);
  }
}

/** @param {string} message */
function importError(message) {
  byId("import-report").replaceChildren(h("p", { class: "bad", text: `✕ ${message}` }));
}

/** @param {File} file */
async function importFile(file) {
  if (file.size > 5 * 1024 * 1024) {
    importError("Arquivo maior que 5 MB. Exporte só as colunas sku, nome e custo.");
    return;
  }
  const text = decodeText(await file.arrayBuffer());
  const { products, issues } = readCatalog(text);
  applyImport(products, issues, `"${file.name}"`);
}

/** @param {string} url */
async function importSheets(url) {
  const csvUrl = sheetsCsvUrl(url);
  if (!csvUrl) {
    importError("Isso não parece um link do Google Sheets (docs.google.com/spreadsheets/…).");
    return;
  }
  try {
    const res = await fetch(csvUrl);
    const text = await res.text();
    if (!res.ok || /^\s*<(!doctype|html)/i.test(text)) throw new Error("not csv");
    const { products, issues } = readCatalog(text);
    applyImport(products, issues, "Google Sheets");
  } catch {
    importError(
      'Não consegui ler a planilha. Ela precisa estar compartilhada como "Qualquer pessoa com o link" (leitor).',
    );
  }
}

async function loadExample() {
  try {
    const res = await fetch("data/catalogo-exemplo.csv");
    if (!res.ok) throw new Error(String(res.status));
    const { products, issues } = readCatalog(await res.text());
    applyImport(products, issues, "exemplo");
  } catch {
    toast("Não foi possível carregar o exemplo.");
  }
}

function exportCatalog() {
  const blob = new Blob([toCsv(state.products)], { type: "text/csv;charset=utf-8" });
  const link = h("a", { href: URL.createObjectURL(blob), download: "catalogo.csv" });
  link.click();
  URL.revokeObjectURL(link.href);
}

function clearCatalog() {
  if (!window.confirm(`Apagar os ${state.products.length} produtos do catálogo deste navegador?`))
    return;
  state.products = [];
  persistCatalog();
  renderCatalogState();
  byId("import-report").replaceChildren();
  clearSelection();
}

/* ============================== busca ============================== */

let activeIndex = -1;
/** @type {Product[]} */
let searchHits = [];

function closeSearch() {
  const list = byId("search-results");
  list.hidden = true;
  list.replaceChildren();
  byId("search").setAttribute("aria-expanded", "false");
  byId("search").removeAttribute("aria-activedescendant");
  activeIndex = -1;
}

/** @param {string} query */
function runSearch(query) {
  const q = fold(query.trim());
  if (!q) {
    closeSearch();
    return;
  }
  searchHits = state.products
    .filter((p) => fold(p.sku).includes(q) || fold(p.name).includes(q))
    .slice(0, SEARCH_LIMIT);
  const list = byId("search-results");
  activeIndex = -1;
  list.replaceChildren(
    ...(searchHits.length > 0
      ? searchHits.map((p, i) =>
          h(
            "li",
            {
              id: `hit-${i}`,
              role: "option",
              "aria-selected": "false",
              onmousedown: (/** @type {MouseEvent} */ e) => e.preventDefault(),
              onclick: () => selectProduct(p),
            },
            h("span", {}, h("span", { class: "sku", text: p.sku }), p.name),
            h("span", { class: "money", text: brl(p.unitCost) }),
          ),
        )
      : [h("li", { class: "empty", text: "Nenhum produto encontrado" })]),
  );
  list.hidden = false;
  byId("search").setAttribute("aria-expanded", "true");
}

/** @param {number} next */
function moveActive(next) {
  const items = byId("search-results").querySelectorAll('[role="option"]');
  if (items.length === 0) return;
  activeIndex = (next + items.length) % items.length;
  items.forEach((el, i) => el.setAttribute("aria-selected", String(i === activeIndex)));
  items[activeIndex].scrollIntoView({ block: "nearest" });
  byId("search").setAttribute("aria-activedescendant", `hit-${activeIndex}`);
}

/* ============================== taxas ============================== */

/** @type {Map<string, HTMLInputElement>} */
const rateInputs = new Map();

function buildRatesForm() {
  const form = byId("rates-form");
  form.replaceChildren();
  rateInputs.clear();
  for (const group of RATE_GROUPS) {
    const fields = group.fields.map((field) => {
      if (field.kind === "toggle") {
        const input = h("input", { type: "checkbox" });
        input.addEventListener("change", () => {
          setPath(state.rates, field.path, input.checked);
          ratesChanged();
        });
        rateInputs.set(field.path, input);
        return h("label", { class: "rate-toggle" }, input, field.label);
      }
      const input = h("input", {
        type: "text",
        inputmode: "decimal",
        autocomplete: "off",
        "aria-label": `${group.title}: ${field.label} (${field.unit})`,
      });
      input.addEventListener("input", () => {
        const typed = parseNumber(input.value);
        const valid = typed !== null && (field.unit !== "%" || typed < 100);
        input.setAttribute("aria-invalid", String(!valid));
        if (!valid) return;
        setPath(state.rates, field.path, fromDisplay(field, typed));
        ratesChanged();
      });
      input.addEventListener("blur", () => fillRateInput(field, input));
      rateInputs.set(field.path, input);
      return h(
        "label",
        { class: "rate-field" },
        h("span", { text: field.label }),
        h("div", { class: "with-unit" }, input, h("span", { class: "unit", text: field.unit })),
      );
    });
    form.append(
      h(
        "section",
        { class: "rate-group" },
        h("h3", {}, group.title, group.note ? h("small", { text: group.note }) : null),
        h("div", { class: "rate-fields" }, ...fields),
      ),
    );
  }
  fillRatesForm();
}

/** @param {NumberField} field @param {HTMLInputElement} input */
function fillRateInput(field, input) {
  const stored = /** @type {number} */ (getPath(state.rates, field.path));
  input.value = toDisplay(field, stored).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
  input.removeAttribute("aria-invalid");
}

function fillRatesForm() {
  for (const group of RATE_GROUPS) {
    for (const field of group.fields) {
      const input = rateInputs.get(field.path);
      if (!input) continue;
      if (field.kind === "toggle") input.checked = Boolean(getPath(state.rates, field.path));
      else fillRateInput(field, input);
    }
  }
  markRatesEdited();
}

function markRatesEdited() {
  const defaults = cloneDefaultRates();
  defaults.markupPct = state.rates.markupPct;
  byId("rates-changed").hidden = JSON.stringify(defaults) === JSON.stringify(state.rates);
}

function ratesChanged() {
  save("rates", state.rates);
  markRatesEdited();
  recalc();
}

/* ============================== cartões ============================== */

/**
 * @typedef {object} CardRefs
 * @property {HTMLElement} root
 * @property {HTMLElement} fee
 * @property {HTMLElement} best
 * @property {HTMLElement} manual
 * @property {HTMLInputElement} price
 * @property {HTMLButtonElement} reset
 * @property {HTMLButtonElement} copy
 * @property {HTMLElement} sale
 * @property {HTMLElement} bar
 * @property {HTMLElement} profit
 * @property {HTMLElement} margin
 * @property {HTMLElement} cash
 * @property {HTMLElement} maxDiscount
 * @property {HTMLElement} status
 */

/** @type {Map<ChannelKey, CardRefs>} */
const cards = new Map();

function buildCards() {
  const container = byId("channels");
  for (const channel of CHANNELS) {
    const key = channel.key;
    /** @type {CardRefs} */
    const r = {
      root: h("article", { class: "channel", "aria-labelledby": `ch-${key}` }),
      fee: h("span", { class: "fee-label" }),
      best: h("span", { class: "badge badge-best", hidden: true }),
      manual: h("span", { class: "badge badge-manual", text: "Preço manual", hidden: true }),
      price: h("input", {
        type: "text",
        inputmode: "decimal",
        class: "price-input",
        "aria-label": `Preço de vitrine na ${channel.name}`,
        autocomplete: "off",
      }),
      reset: h("button", {
        type: "button",
        class: "btn btn-ghost btn-sm",
        "aria-label": `Voltar ao preço calculado na ${channel.name}`,
        title: "Voltar ao preço calculado",
        text: "↺",
        hidden: true,
      }),
      copy: h("button", {
        type: "button",
        class: "btn btn-ghost btn-sm",
        "aria-label": `Copiar preço da ${channel.name}`,
        title: "Copiar preço",
        text: "Copiar",
      }),
      sale: h("p", { class: "sale-line", hidden: true }),
      bar: h("div", { class: "bar", role: "img" }),
      profit: h("dd", { class: "metric-value" }),
      margin: h("dd", { class: "metric-value" }),
      cash: h("dd", { class: "metric-value" }),
      maxDiscount: h("dd", { class: "metric-value" }),
      status: h("p", { class: "status" }),
    };
    r.root.append(
      h(
        "div",
        { class: "channel-head" },
        h(
          "div",
          { class: "channel-title" },
          h("h3", { id: `ch-${key}`, text: channel.name }),
          r.best,
        ),
        r.fee,
      ),
      h(
        "div",
        { class: "price-block" },
        h("div", { class: "price-label" }, h("span", { text: "Preço de vitrine" }), r.manual),
        h(
          "div",
          { class: "price-row" },
          h("span", { class: "currency", text: "R$" }),
          r.price,
          h("div", { class: "price-actions" }, r.reset, r.copy),
        ),
        r.sale,
      ),
      r.bar,
      h(
        "dl",
        { class: "metrics" },
        metric("Lucro extra", r.profit),
        metric("Margem", r.margin),
        metric("Volta pro caixa", r.cash),
        metric("Desconto seguro", r.maxDiscount),
      ),
      r.status,
    );

    r.price.addEventListener("input", () => {
      const raw = r.price.value.trim();
      if (raw === "") {
        state.manual[key] = null;
        r.price.removeAttribute("aria-invalid");
        recalc();
        return;
      }
      const value = parseNumber(raw);
      const valid = value !== null && value > 0;
      r.price.setAttribute("aria-invalid", String(!valid));
      if (!valid) return;
      state.manual[key] = value;
      recalc();
    });
    r.price.addEventListener("blur", () => {
      r.price.removeAttribute("aria-invalid");
      updateCards();
    });
    r.reset.addEventListener("click", () => {
      state.manual[key] = null;
      recalc();
      r.price.focus();
    });
    r.copy.addEventListener("click", async () => {
      const q = state.quotes.find((x) => x.key === key);
      if (!q?.feasible) return;
      const ok = await copyText(decimal(q.salePrice));
      toast(ok ? `${channel.name}: ${brl(q.salePrice)} copiado` : "Não foi possível copiar");
    });
    r.bar.addEventListener("pointerover", showTooltip);
    r.bar.addEventListener("pointermove", moveTooltip);
    r.bar.addEventListener("pointerleave", hideTooltip);

    cards.set(key, r);
    container.append(r.root);
  }
}

/** @param {string} label @param {HTMLElement} value */
function metric(label, value) {
  return h("div", { class: "metric" }, h("dt", { text: label }), value);
}

/** @param {Quote} q */
function statusText(q) {
  const b = q.breakdown;
  switch (q.status) {
    case "infeasible":
      return "✕ Margem inatingível: taxas + imposto + margem passam de 100%";
    case "loss":
      return `✕ Prejuízo de ${brl(-b.profit)}: as taxas comem o Valor Base`;
    case "below-target":
      return `⚠ Abaixo da margem extra desejada (${pct(state.marginPct, 0)})`;
    default:
      return state.marginPct > 0 ? "✓ Na meta de margem extra" : "✓ Valor Base protegido";
  }
}

/** @param {HTMLElement} bar @param {Quote} q @param {number} baseValue */
function renderBar(bar, q, baseValue) {
  const b = q.breakdown;
  const fees = Math.max(0, b.platformFee);
  const tax = Math.max(0, b.tax);
  const base = Math.max(0, Math.min(baseValue, q.salePrice - fees - tax));
  const profit = Math.max(0, b.profit);
  const total = base + fees + tax + profit;
  /** @type {[string, string, number][]} */
  const parts = [
    ["seg-base", "Valor Base", base],
    ["seg-fees", "Taxas da plataforma", fees],
    ["seg-tax", "Imposto", tax],
    ["seg-profit", "Lucro extra", profit],
  ];
  bar.replaceChildren(
    ...parts
      .filter(([, , value]) => value > 0.004 && total > 0)
      .map(([cls, label, value]) =>
        h("span", {
          class: cls,
          style: `flex: ${value} 1 0`,
          "data-tip": `${label}: ${brl(value)} (${pct(value / total)})`,
        }),
      ),
  );
  bar.setAttribute(
    "aria-label",
    `Composição de ${brl(q.salePrice)}: Valor Base ${brl(base)}, taxas ${brl(fees)}, imposto ${brl(tax)}, lucro extra ${brl(profit)}`,
  );
}

function updateCards() {
  const baseValue = currentBaseValue();
  const best = bestQuote();
  for (const q of state.quotes) {
    const r = /** @type {CardRefs} */ (cards.get(q.key));
    const b = q.breakdown;
    r.fee.textContent = q.feasible ? q.feeLabel : "—";
    r.best.hidden = best?.key !== q.key;
    r.best.textContent = bestLabel(best);
    r.root.classList.toggle("is-best", best?.key === q.key);
    r.manual.hidden = !q.manual;
    r.reset.hidden = !q.manual;
    r.copy.disabled = !q.feasible;
    if (document.activeElement !== r.price) {
      r.price.value = q.feasible ? decimal(q.listPrice) : "";
      r.price.placeholder = q.feasible ? "" : "inatingível";
    }
    const discounted = q.feasible && q.salePrice < q.listPrice;
    r.sale.hidden = !discounted;
    if (discounted) {
      r.sale.replaceChildren(
        "Cliente paga ",
        h("strong", { text: brl(q.salePrice) }),
        " em vez de ",
        h("s", { text: brl(q.listPrice) }),
      );
    }
    if (q.feasible) renderBar(r.bar, q, baseValue);
    else r.bar.replaceChildren();
    r.profit.textContent = q.feasible ? brl(b.profit) : "—";
    r.profit.classList.toggle("neg", q.feasible && b.profit < -0.005);
    r.margin.textContent = q.feasible ? pct(b.margin) : "—";
    r.cash.textContent = q.feasible ? brl(b.cashBack) : "—";
    r.maxDiscount.textContent = q.feasible ? pct(q.maxDiscount) : "—";
    r.status.textContent = statusText(q);
    r.status.className = `status ${q.status}`;
  }
}

/* ============================== tooltip ============================== */

/** @param {PointerEvent} e */
function showTooltip(e) {
  const target = /** @type {HTMLElement} */ (e.target);
  const tip = target.dataset?.tip;
  if (!tip) return;
  const el = byId("tooltip");
  el.textContent = tip;
  el.hidden = false;
  moveTooltip(e);
}

/** @param {PointerEvent} e */
function moveTooltip(e) {
  const el = byId("tooltip");
  const target = /** @type {HTMLElement} */ (e.target);
  if (target.dataset?.tip && el.textContent !== target.dataset.tip) {
    el.textContent = target.dataset.tip;
  }
  const x = Math.min(e.clientX + 12, window.innerWidth - el.offsetWidth - 8);
  const y = e.clientY - el.offsetHeight - 12;
  el.style.left = `${Math.max(8, x)}px`;
  el.style.top = `${y < 8 ? e.clientY + 16 : y}px`;
}

function hideTooltip() {
  byId("tooltip").hidden = true;
}

/* ============================== resumo e tabela ============================== */

function feasibleQuotes() {
  return state.quotes.filter((q) => q.feasible);
}

function bestQuote() {
  const list = feasibleQuotes();
  if (list.length === 0) return null;
  return list.reduce((a, b) => (b.breakdown.profit > a.breakdown.profit ? b : a));
}

/** Com todos os canais no prejuízo, "mais lucrativo" engana: vira "menor prejuízo". */
/** @param {Quote | null} best */
function bestLabel(best) {
  return best && best.breakdown.profit < -0.005 ? "Menor prejuízo" : "★ Mais lucrativo";
}

function updateInsights() {
  const list = feasibleQuotes();
  const best = bestQuote();
  const cheapest = list.length ? list.reduce((a, b) => (b.salePrice < a.salePrice ? b : a)) : null;
  const prices = list.map((q) => q.salePrice);
  byId("ins-best-label").textContent = bestLabel(best).replace("★ ", "");
  byId("ins-best").textContent = best?.name ?? "—";
  byId("ins-best-sub").textContent = best ? `lucro extra de ${brl(best.breakdown.profit)}` : "";
  byId("ins-cheapest").textContent = cheapest?.name ?? "—";
  byId("ins-cheapest-sub").textContent = cheapest ? `cliente paga ${brl(cheapest.salePrice)}` : "";
  byId("ins-spread").textContent = prices.length
    ? brl(Math.max(...prices) - Math.min(...prices))
    : "—";
  byId("ins-discount").textContent = list.length
    ? pct(Math.min(...list.map((q) => q.maxDiscount)))
    : "—";
}

function updateTable() {
  byId("compare-body").replaceChildren(
    ...state.quotes.map((q) => {
      const b = q.breakdown;
      if (!q.feasible) {
        return h(
          "tr",
          {},
          h("td", { text: q.name }),
          h("td", { colspan: 6, class: "neg", text: "margem inatingível" }),
        );
      }
      return h(
        "tr",
        {},
        h("td", { text: q.name }),
        h("td", { text: brl(q.salePrice) }),
        h("td", { text: brl(b.platformFee) }),
        h("td", { text: brl(b.tax) }),
        h("td", { class: "cash", text: brl(b.cashBack) }),
        h("td", { class: b.profit < -0.005 ? "neg" : "", text: brl(b.profit) }),
        h("td", { class: b.profit < -0.005 ? "neg" : "", text: pct(b.margin) }),
      );
    }),
  );
}

/** @param {"" | "ok" | "warn" | "bad"} level @param {string} icon @param {string} text */
function setAlert(level, icon, text) {
  const alert = byId("alert");
  alert.className = `alert ${level}`;
  /** @type {HTMLElement} */ (alert.querySelector(".alert-icon")).textContent = icon;
  byId("alert-text").textContent = text;
}

function updateAlert() {
  /** @param {Quote["status"]} s */
  const names = (s) =>
    state.quotes
      .filter((q) => q.status === s)
      .map((q) => q.name)
      .join(", ");
  const loss = names("loss");
  const infeasible = names("infeasible");
  const below = names("below-target");
  if (loss) {
    setAlert("bad", "✕", `Prejuízo em: ${loss}. Reduza o desconto ou suba o preço.`);
  } else if (infeasible) {
    setAlert("warn", "!", `Margem inatingível em: ${infeasible}. Reduza a margem extra.`);
  } else if (below) {
    setAlert("warn", "!", `Abaixo da margem extra desejada em: ${below}.`);
  } else {
    const extra = state.marginPct > 0 ? ` com ${pct(state.marginPct, 0)} de margem extra` : "";
    setAlert("ok", "✓", `Valor Base protegido em todos os canais${extra}.`);
  }
}

/* ============================== cálculo ============================== */

function currentBaseValue() {
  return state.selected
    ? baseValueOf(state.selected.unitCost, state.rates.markupPct, state.kitQty)
    : 0;
}

function recalc() {
  const p = state.selected;
  const hasProduct = Boolean(p);
  byId("insights").hidden = !hasProduct;
  byId("channels-section").hidden = !hasProduct;
  byId("table-section").hidden = !hasProduct;
  /** @type {HTMLButtonElement} */ (byId("copy-all")).disabled = !hasProduct;
  if (!p) {
    state.quotes = [];
    setAlert("", "ℹ", "Escolha ou cadastre um produto para ver os preços.");
    return;
  }
  const baseValue = currentBaseValue();
  byId("sel-base").textContent = brl(baseValue);
  state.quotes = CHANNELS.map((channel) =>
    quoteChannel(channel, {
      baseValue,
      rates: state.rates,
      marginPct: state.marginPct,
      discountPct: state.discountPct,
      manualListPrice: state.manual[channel.key],
    }),
  );
  updateCards();
  updateInsights();
  updateTable();
  updateAlert();
}

/* ============================== controles ============================== */

function setupSliders() {
  /** @type {[string, string, () => number, (v: number) => void][]} */
  const sliders = [
    [
      "markup",
      "markup-out",
      () => state.rates.markupPct,
      (v) => {
        state.rates.markupPct = v;
        save("rates", state.rates);
      },
    ],
    [
      "margin",
      "margin-out",
      () => state.marginPct,
      (v) => {
        state.marginPct = v;
        state.manual = noManualPrices();
        save("margin", v);
      },
    ],
    ["discount", "discount-out", () => state.discountPct, (v) => (state.discountPct = v)],
  ];
  for (const [id, outId, get, set] of sliders) {
    const input = /** @type {HTMLInputElement} */ (byId(id));
    const out = byId(outId);
    input.value = String(Math.round(get() * 100));
    out.textContent = `${input.value}%`;
    input.addEventListener("input", () => {
      out.textContent = `${input.value}%`;
      set(Number(input.value) / 100);
      recalc();
    });
  }
}

function setupTabs() {
  const tabs = /** @type {HTMLButtonElement[]} */ ([
    ...document.querySelectorAll('.tabs [role="tab"]'),
  ]);
  /** @param {HTMLButtonElement} tab */
  const activate = (tab) => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      byId(/** @type {string} */ (t.getAttribute("aria-controls"))).hidden = !on;
    }
    tab.focus();
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => activate(tab));
    tab.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") activate(tabs[(i + 1) % tabs.length]);
      if (e.key === "ArrowLeft") activate(tabs[(i - 1 + tabs.length) % tabs.length]);
    });
  });
}

function setupSearch() {
  const input = /** @type {HTMLInputElement} */ (byId("search"));
  input.addEventListener("input", () => runSearch(input.value));
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (byId("search-results").hidden) runSearch(input.value);
      moveActive(activeIndex + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveActive(activeIndex - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = searchHits[activeIndex >= 0 ? activeIndex : 0];
      if (hit && !byId("search-results").hidden) selectProduct(hit);
    } else if (e.key === "Escape") closeSearch();
  });
  input.addEventListener("blur", () => setTimeout(closeSearch, 150));
  byId("load-example").addEventListener("click", loadExample);
}

function setupAddForm() {
  const form = /** @type {HTMLFormElement} */ (byId("add-form"));
  const name = /** @type {HTMLInputElement} */ (byId("add-name"));
  const sku = /** @type {HTMLInputElement} */ (byId("add-sku"));
  const cost = /** @type {HTMLInputElement} */ (byId("add-cost"));
  const error = byId("add-error");
  /** @param {string} message @param {HTMLInputElement} field */
  const fail = (message, field) => {
    error.textContent = message;
    error.hidden = false;
    field.setAttribute("aria-invalid", "true");
    field.focus();
  };
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    for (const f of [name, sku, cost]) f.removeAttribute("aria-invalid");
    error.hidden = true;
    const nameValue = name.value.trim();
    const costValue = parseNumber(cost.value);
    let skuValue = sku.value.trim();
    if (!nameValue) return fail("Informe o nome do produto.", name);
    if (costValue === null || costValue <= 0) {
      return fail("Custo inválido. Use números, como 29,90.", cost);
    }
    const taken = new Set(state.products.map((p) => p.sku.toLowerCase()));
    if (skuValue && taken.has(skuValue.toLowerCase())) {
      return fail("Já existe um produto com esse SKU.", sku);
    }
    if (!skuValue) {
      let n = 1;
      while (taken.has(`man-${String(n).padStart(3, "0")}`)) n++;
      skuValue = `MAN-${String(n).padStart(3, "0")}`;
    }
    const product = { sku: skuValue, name: nameValue, unitCost: costValue };
    state.products = [...state.products, product];
    persistCatalog();
    renderCatalogState();
    form.reset();
    toast("Produto adicionado ao catálogo");
    selectProduct(product);
  });
}

function setupImport() {
  const fileInput = /** @type {HTMLInputElement} */ (byId("file-input"));
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file) importFile(file);
    fileInput.value = "";
  });
  const zone = byId("dropzone");
  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    zone.classList.add("is-dragging");
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("is-dragging"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("is-dragging");
    const file = e.dataTransfer?.files?.[0];
    if (file) importFile(file);
  });
  byId("sheets-form").addEventListener("submit", (e) => {
    e.preventDefault();
    importSheets(/** @type {HTMLInputElement} */ (byId("sheets-url")).value);
  });
  byId("export-catalog").addEventListener("click", exportCatalog);
  byId("clear-catalog").addEventListener("click", clearCatalog);
}

function setupSelected() {
  const kit = byId("kit-buttons");
  for (const qty of KIT_OPTIONS) {
    kit.append(
      h("button", {
        type: "button",
        "data-qty": qty,
        "aria-pressed": String(qty === 1),
        text: `${qty}x`,
        onclick: () => {
          state.kitQty = qty;
          state.manual = noManualPrices();
          renderSelected();
          recalc();
        },
      }),
    );
  }
  const cost = /** @type {HTMLInputElement} */ (byId("sel-cost"));
  cost.addEventListener("input", () => {
    const value = parseNumber(cost.value);
    const valid = value !== null && value > 0;
    cost.setAttribute("aria-invalid", String(!valid));
    if (!valid || !state.selected) return;
    const sku = state.selected.sku;
    state.products = state.products.map((p) => (p.sku === sku ? { ...p, unitCost: value } : p));
    state.selected = /** @type {Product} */ (state.products.find((p) => p.sku === sku));
    persistCatalog();
    recalc();
  });
  cost.addEventListener("blur", renderSelected);
  byId("clear-selection").addEventListener("click", clearSelection);
}

function setupTopbar() {
  byId("rates-date").textContent = dateBR(RATES_VALID_FROM);
  byId("copy-all").addEventListener("click", async () => {
    const p = state.selected;
    if (!p) return;
    const lines = state.quotes.map(
      (q) => `${q.name}: ${q.feasible ? brl(q.salePrice) : "inatingível"}`,
    );
    const text = [`${p.name} (${p.sku}) — kit ${state.kitQty}x`, ...lines].join("\n");
    toast((await copyText(text)) ? "Preços copiados" : "Não foi possível copiar");
  });
  byId("theme-toggle").addEventListener("click", () => {
    const root = document.documentElement;
    const current =
      root.dataset.theme ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = current === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    save("theme", next);
  });
  byId("rates-reset").addEventListener("click", () => {
    const markup = state.rates.markupPct;
    state.rates = cloneDefaultRates();
    state.rates.markupPct = markup;
    fillRatesForm();
    ratesChanged();
    toast("Taxas padrão restauradas");
  });
}

/* ============================== início ============================== */

function init() {
  setupTopbar();
  setupTabs();
  setupSearch();
  setupAddForm();
  setupImport();
  setupSelected();
  setupSliders();
  buildRatesForm();
  buildCards();
  renderCatalogState();
  const savedSku = load("selected", null);
  const saved = state.products.find((p) => p.sku === savedSku);
  if (saved) selectProduct(saved);
  else recalc();
}

init();
