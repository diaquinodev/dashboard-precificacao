const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const NUM = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** @param {number} value */
export function brl(value) {
  return BRL.format(Math.abs(value) < 0.005 ? 0 : value);
}

/** Número com duas casas, sem símbolo (para campos editáveis). */
/** @param {number} value */
export function decimal(value) {
  return NUM.format(value);
}

/**
 * @param {number} fraction 0.153 → "15,3%"
 * @param {number} [digits]
 */
export function pct(fraction, digits = 1) {
  const value = Math.abs(fraction) < 0.00005 ? 0 : fraction * 100;
  return `${value.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

/** @param {string} iso "2026-07-15" → "15/07/2026" */
export function dateBR(iso) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
