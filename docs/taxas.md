# Taxas padrão e fontes

Todas as taxas são **editáveis na tela** (painel _Taxas e imposto_) e ficam salvas no
navegador. Os valores abaixo são só o ponto de partida.

> ⚠️ Marketplaces mudam taxas várias vezes por ano, e a comissão varia por categoria e por
> conta. As fontes abaixo são **secundárias** (blogs e guias de e-commerce), consultadas em
> **01/10/2026**. Antes de usar os preços, confira no painel de vendedor de cada canal.

## Como cada canal é modelado

Cada canal é um conjunto de **faixas de preço**. Dentro de uma faixa, a plataforma cobra
`percentual × preço + valor fixo`. O motor calcula o preço em cada faixa e escolhe o menor que
cai dentro da própria faixa (ver [arquitetura](arquitetura.md)).

### Shopee (vigência 03/2026)

| Preço de venda     | Comissão | Taxa por item   |
| ------------------ | -------- | --------------- |
| até R$ 7,99        | 20%      | metade do preço |
| R$ 8 a R$ 79,99    | 20%      | R$ 4            |
| R$ 80 a R$ 99,99   | 14%      | R$ 16           |
| R$ 100 a R$ 199,99 | 14%      | R$ 20           |
| a partir de R$ 200 | 14%      | R$ 26           |

- Sem teto de comissão desde 03/2026.
- Campo **Taxa adicional** (padrão 0%) para custos que dependem da conta, como comissão
  extra de afiliados.
- Fontes: [Virei Vendedor](https://vireivendedor.com.br/blog/faixas-comissao-shopee-marco-2026/),
  [E-commerce na Prática](https://ecommercenapratica.com/blog/taxa-shopee/).

### Mercado Livre

| Item                            | Padrão  | Observação                                                                |
| ------------------------------- | ------- | ------------------------------------------------------------------------- |
| Comissão Clássico               | 13%     | fontes indicam 10% a 14% conforme a categoria                             |
| Comissão Premium                | 16%     | fontes indicam 15% a 19% conforme a categoria                             |
| Custo por venda abaixo de R$ 79 | R$ 6,75 | desde 02/03/2026 **varia com peso e dimensões**                           |
| Frete a partir de R$ 79         | R$ 22   | frete grátis obrigatório, pago pelo vendedor; depende do peso e da região |

- O custo abaixo de R$ 79 e o frete são **médias editáveis**: o cálculo por peso não está
  modelado (ver _Limitações_ no README).
- Fontes: [E-commerce Puro](https://blog.ecommercepuro.com.br/quanto-custa-vender-no-mercado-livre-3/),
  [GestorShop](https://www.gestorshop.com.br/blog/comissoes-mercado-livre-2026-tabela).

### TikTok Shop (vigência 15/07/2026)

| Preço de venda    | Comissão | Taxa por item |
| ----------------- | -------- | ------------- |
| abaixo de R$ 50   | 10%      | R$ 4          |
| a partir de R$ 50 | 6%       | R$ 6          |

- **Programa de frete grátis:** +6% sobre o preço (ligado por padrão; desligue se não
  participa).
- **Afiliados:** percentual definido por você (padrão 10%, desligado).
- Fontes: [GeCommerce](https://gecommerce.com.br/marketing-digital-ecommerce/novas-taxas-do-tiktok-shop-em-2026-o-que-muda-a-partir-de-15-de-julho-e-como-recalcular-sua-margem/),
  [Duoke](https://www.duoke.com/pt/blog/article/438-tiktok-shop-novas-taxas-julho-2026).

### Shein

- Comissão de **16%** sobre o valor pago (descontos e cupons já abatidos).
- Vendedor novo: 0% nos primeiros 30 dias (coloque 0 no campo).
- Algumas categorias podem ter comissão maior.
- Fonte: [Anymarket](https://marketplace.anymarket.com.br/como-vender-na-shein/).

### Imposto

- **7%** sobre o preço de venda, como alíquota efetiva do Simples Nacional (Anexo I,
  comércio).
- É uma **premissa**: a alíquota real depende do faturamento dos últimos 12 meses de cada
  empresa. Ajuste com o valor que o seu contador informar.

## O que mudou em relação à versão original do projeto

| Item                       | Antes                 | Agora                         | Motivo                                |
| -------------------------- | --------------------- | ----------------------------- | ------------------------------------- |
| Shopee abaixo de R$ 8      | 50% de comissão       | 20% + metade do preço (≈ 70%) | regra publicada para 03/2026          |
| Shopee taxa de transação   | +2% fixo              | campo opcional, padrão 0%     | não encontrada nas fontes de 2026     |
| Shopee "Campanha Destaque" | +2,5%                 | removida                      | programa encerrado, segundo as fontes |
| ML abaixo de R$ 79         | tabela R$ 6,25 a 6,75 | média editável R$ 6,75        | passou a depender de peso em 03/2026  |
| TikTok                     | 6% + R$ 2             | 10% + R$ 4 / 6% + R$ 6        | regra de 15/07/2026                   |
