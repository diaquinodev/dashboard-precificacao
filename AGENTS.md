# Regras para agentes neste repositório

- O motor (`src/engine/`) não importa nada de `src/ui/` nem usa DOM. Toda regra de preço
  nova entra no motor com teste em `test/`.
- Taxa nova ou alterada: atualize `src/engine/rates.js`, o schema em `src/ui/rate-fields.js`
  e a fonte em `docs/taxas.md`. O teste `rate-fields` falha se um campo ficar sem formulário.
- Dado vindo de planilha ou do usuário entra no DOM só por `textContent`.
- Antes de abrir PR: `npm run check`; se mexeu na tela: `npm run e2e` e `npm run screenshots`.
- Nunca commitar dados de cliente real. O catálogo de exemplo é fictício.
