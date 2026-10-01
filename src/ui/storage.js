/**
 * Guarda catálogo e preferências no navegador. Em janela anônima ou com armazenamento
 * bloqueado, falha em silêncio e o app funciona sem memória entre visitas.
 */

const PREFIX = "precificador:";

/**
 * @template T
 * @param {string} key
 * @param {T} fallback
 * @returns {T}
 */
export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : /** @type {T} */ (JSON.parse(raw));
  } catch {
    return fallback;
  }
}

/**
 * @param {string} key
 * @param {unknown} value
 */
export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* sem armazenamento: segue sem persistir */
  }
}

/** @param {string} key */
export function remove(key) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* idem */
  }
}
