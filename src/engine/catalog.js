/**
 * Leitura do catálogo de produtos: CSV (upload, link do Google Sheets ou exportado do Excel)
 * e números digitados. A especificação para quem monta a planilha está em `docs/planilha.md`.
 */

/**
 * @typedef {object} Product
 * @property {string} sku
 * @property {string} name
 * @property {number} unitCost Custo unitário (o que você paga pelo produto).
 */

/**
 * @typedef {object} CatalogIssue
 * @property {number} line Linha da planilha (1 = cabeçalho na primeira linha).
 * @property {string} reason
 */

/**
 * Converte texto em número aceitando formato brasileiro e americano.
 *
 * Regras:
 * - Remove "R$", espaços e espaços não separáveis.
 * - Com ponto e vírgula: o último dos dois é o separador decimal ("1.234,56" e "1,234.56").
 * - Só vírgula: uma vírgula é decimal ("59,90"); mais de uma é inválido.
 * - Só ponto: grupos de 3 dígitos são milhar ("1.234" = mil duzentos e trinta e quatro,
 *   como no Brasil); qualquer outro caso é decimal ("59.90", "59.9").
 * @param {unknown} raw
 * @returns {number | null} `null` para vazio, negativo ou ilegível.
 */
export function parseNumber(raw) {
  let s = String(raw ?? "")
    .replace(/R\$/gi, "")
    .replace(/\s/g, ""); // \s também cobre o espaço não separável (U+00A0)
  if (s === "" || s.startsWith("-")) return null;
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    const decimal = lastDot > lastComma ? "." : ",";
    const thousands = decimal === "." ? "," : ".";
    s = s.split(thousands).join("");
    if (decimal === ",") s = s.replace(",", ".");
  } else if (lastComma >= 0) {
    if (s.indexOf(",") !== lastComma) return null;
    s = s.replace(",", ".");
  } else if (lastDot >= 0) {
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.split(".").join("");
    else if (s.indexOf(".") !== lastDot) return null;
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

/**
 * Lê CSV (RFC 4180) detectando o separador: `;` (Excel em português), `,` ou tabulação.
 * @param {string} text
 * @returns {string[][]}
 */
export function parseCsv(text) {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const delimiter = detectDelimiter(src);
  /** @type {string[][]} */
  const rows = [];
  /** @type {string[]} */
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** @param {string} text */
function detectDelimiter(text) {
  // Olha as primeiras linhas, não só a primeira: exportações costumam ter um título acima
  // do cabeçalho, sem nenhum separador.
  const head = text.split(/\r?\n/, 10).join("\n");
  const outsideQuotes = head.replace(/"[^"]*"/g, "");
  /** @type {[string, number][]} */
  const counts = [";", ",", "\t"].map((d) => [d, outsideQuotes.split(d).length - 1]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ",";
}

/** @param {string} header */
export function normalizeHeader(header) {
  return header
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[_\-.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Nomes aceitos para cada coluna (já normalizados). */
export const COLUMN_ALIASES = Object.freeze({
  sku: ["sku", "ref", "referencia", "codigo", "cod", "ref bling", "codigo sku"],
  name: ["nome", "produto", "descricao", "nome do produto", "name"],
  unitCost: [
    "custo",
    "custo unitario",
    "custo fabrica",
    "custo de fabrica",
    "custo produto",
    "cost",
  ],
});

/** @param {string[]} headers @param {readonly string[]} aliases */
function findColumn(headers, aliases) {
  return headers.findIndex((h) => aliases.includes(h));
}

/**
 * Transforma o CSV em produtos e lista o que foi ignorado e por quê.
 * @param {string} text
 * @returns {{ products: Product[], issues: CatalogIssue[] }}
 */
export function readCatalog(text) {
  const rows = parseCsv(text);
  /** @type {CatalogIssue[]} */
  const issues = [];
  const headerIndex = rows.findIndex((r) =>
    r.some((cell) => COLUMN_ALIASES.unitCost.includes(normalizeHeader(cell))),
  );
  if (headerIndex === -1) {
    return {
      products: [],
      issues: [{ line: 1, reason: 'Cabeçalho não encontrado: falta a coluna "custo".' }],
    };
  }
  const headers = rows[headerIndex].map(normalizeHeader);
  const col = {
    sku: findColumn(headers, COLUMN_ALIASES.sku),
    name: findColumn(headers, COLUMN_ALIASES.name),
    unitCost: findColumn(headers, COLUMN_ALIASES.unitCost),
  };
  if (col.name === -1) {
    issues.push({ line: headerIndex + 1, reason: 'Falta a coluna "nome".' });
    return { products: [], issues };
  }

  /** @type {Product[]} */
  const products = [];
  const seen = new Set();
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    const line = i + 1;
    if (row.every((cell) => cell.trim() === "")) continue;
    const name = (row[col.name] ?? "").trim();
    const costText = (row[col.unitCost] ?? "").trim();
    const unitCost = parseNumber(costText);
    const sku = col.sku >= 0 ? (row[col.sku] ?? "").trim() : "";
    if (!name) {
      issues.push({ line, reason: "Nome vazio." });
      continue;
    }
    if (unitCost === null || unitCost <= 0) {
      issues.push({ line, reason: `Custo inválido: "${costText}".` });
      continue;
    }
    const finalSku = sku || `LINHA-${line}`;
    if (seen.has(finalSku.toLowerCase())) {
      issues.push({ line, reason: `SKU repetido: "${finalSku}" (mantida a primeira linha).` });
      continue;
    }
    seen.add(finalSku.toLowerCase());
    products.push({ sku: finalSku, name, unitCost });
  }
  if (products.length === 0 && issues.length === 0) {
    issues.push({ line: headerIndex + 2, reason: "Nenhum produto abaixo do cabeçalho." });
  }
  return { products, issues };
}

/**
 * Gera o CSV de um catálogo (para exportar o que foi cadastrado à mão).
 * @param {Product[]} products
 */
export function toCsv(products) {
  /** @param {string} v */
  const q = (v) => (/[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = products.map(
    (p) => `${q(p.sku)};${q(p.name)};${p.unitCost.toFixed(2).replace(".", ",")}`,
  );
  return ["sku;nome;custo", ...lines].join("\n") + "\n";
}

/**
 * Converte o link de uma planilha do Google Sheets no link de exportação CSV.
 * Aceita o link de edição (com `#gid=`), o de "Publicar na Web" (`output=csv`) e o próprio
 * link de exportação. A planilha precisa estar compartilhada como "qualquer pessoa com o link".
 * @param {string} url
 * @returns {string | null} `null` se não for um link de planilha reconhecível.
 */
export function sheetsCsvUrl(url) {
  const trimmed = url.trim();
  if (!/^https:\/\/docs\.google\.com\/spreadsheets\//.test(trimmed)) return null;
  if (/[?&](output|format)=csv/.test(trimmed)) return trimmed;
  const id = trimmed.match(/\/spreadsheets\/d\/([\w-]+)/)?.[1];
  if (!id) return null;
  const gid = trimmed.match(/[#?&]gid=(\d+)/)?.[1] ?? "0";
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}

/**
 * Junta um catálogo importado ao atual pelo SKU (sem diferenciar maiúsculas):
 * SKU que já existe é atualizado, SKU novo é acrescentado, o resto fica como estava.
 * @param {Product[]} current
 * @param {Product[]} incoming
 * @returns {{ products: Product[], added: number, updated: number }}
 */
export function mergeProducts(current, incoming) {
  const products = current.map((p) => ({ ...p }));
  const index = new Map(products.map((p, i) => [p.sku.toLowerCase(), i]));
  let added = 0;
  let updated = 0;
  for (const p of incoming) {
    const i = index.get(p.sku.toLowerCase());
    if (i === undefined) {
      index.set(p.sku.toLowerCase(), products.length);
      products.push({ ...p });
      added++;
    } else {
      products[i] = { ...p };
      updated++;
    }
  }
  return { products, added, updated };
}

/**
 * Decodifica o arquivo enviado: UTF-8 quando válido; senão Windows-1252, que é o padrão
 * do Excel em português ao salvar "CSV (separado por vírgulas)".
 * @param {ArrayBuffer | Uint8Array} bytes
 */
export function decodeText(bytes) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}
