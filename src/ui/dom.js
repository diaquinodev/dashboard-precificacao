/**
 * Utilitários de DOM. Conteúdo dinâmico entra sempre por `textContent`, nunca por
 * `innerHTML`: nome de produto vindo de planilha não vira HTML.
 */

/**
 * @template {HTMLElement} [T=HTMLElement]
 * @param {string} id
 * @returns {T}
 */
export function byId(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Elemento #${id} não encontrado`);
  return /** @type {T} */ (el);
}

/** @typedef {Node | string | null | undefined | false} Child */

/**
 * Cria um elemento. `text` define o texto; `class` a classe; `on<evento>` registra
 * ouvintes; o resto vira atributo (`true` = atributo vazio, `false`/`null` = ausente).
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {Record<string, unknown>} [props]
 * @param {...Child} children
 * @returns {HTMLElementTagNameMap[K]}
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "text") el.textContent = String(value);
    else if (key === "class") el.className = String(value);
    else if (key.startsWith("on") && typeof value === "function") {
      el.addEventListener(key.slice(2).toLowerCase(), /** @type {EventListener} */ (value));
    } else el.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child);
  }
  return el;
}
