# Como montar a planilha de produtos

O dashboard lê uma planilha com **uma linha por produto** e três colunas. Você pode enviar o
arquivo (CSV) ou colar o link de uma planilha do Google Sheets.

> Modelo pronto: [`data/catalogo-exemplo.csv`](../data/catalogo-exemplo.csv) (também em
> **Planilha → Baixar planilha modelo** dentro do app).

## Colunas

| Coluna  | Obrigatória | O que é                                           | Exemplo           |
| ------- | ----------- | ------------------------------------------------- | ----------------- |
| `sku`   | não         | Código do produto. Se ficar vazio, vira `LINHA-n` | `EX-007`          |
| `nome`  | **sim**     | Nome do produto, como você quer ver na busca      | `Calça pantalona` |
| `custo` | **sim**     | Quanto **você paga** por uma unidade, em reais    | `49,90`           |

**`custo` é o custo unitário, não o preço de venda.** O dashboard soma o markup (padrão
+50%, ajustável na tela) para formar o **Valor Base**, e é a partir dele que calcula o preço
em cada marketplace.

### Nomes aceitos no cabeçalho

Maiúsculas, acentos, `_` e `-` são ignorados. Qualquer um destes funciona:

- **sku:** `sku`, `ref`, `referência`, `código`, `cod`, `ref bling`, `código sku`
- **nome:** `nome`, `produto`, `descrição`, `nome do produto`, `name`
- **custo:** `custo`, `custo unitário`, `custo fábrica`, `custo de fábrica`, `custo produto`, `cost`

O cabeçalho não precisa estar na primeira linha: títulos e linhas em branco acima dele são
ignorados. A busca procura a primeira linha que tenha uma coluna de **custo**.

## Exemplo

```csv
sku;nome;custo
EX-001;Meia cano curto (par);4,20
EX-007;Calça pantalona;49,90
EX-010;Jaqueta jeans;96,00
```

## Formato do arquivo

- **Separador:** `;` (padrão do Excel em português), `,` ou tabulação. Detectado sozinho.
- **Codificação:** UTF-8 ou Windows-1252 (o "CSV" do Excel no Windows). Detectada sozinha,
  então acentos chegam certos nos dois casos.
- **Textos com `;` ou `,`** precisam estar entre aspas: `"Blusa; manga longa"`.
- **Tamanho máximo:** 5 MB.

## Como escrever os valores

| Você escreve       | O dashboard entende | Regra                                               |
| ------------------ | ------------------- | --------------------------------------------------- |
| `49,90`            | 49,90               | vírgula = decimal                                   |
| `49.90`            | 49,90               | ponto seguido de 1 ou 2 dígitos = decimal           |
| `1.234,56`         | 1.234,56            | com ponto **e** vírgula, o último é o decimal       |
| `1,234.56`         | 1.234,56            | idem (formato americano)                            |
| `R$ 89,90`         | 89,90               | `R$` e espaços são ignorados                        |
| `1.234`            | 1.234,00            | ponto seguido de **3** dígitos = milhar (padrão BR) |
| `-5`, `abc`, vazio | linha ignorada      | custo precisa ser um número maior que zero          |

> ⚠️ `1.234` é lido como **mil duzentos e trinta e quatro**, como no Brasil. Se o seu custo
> é R$ 1,234 (três casas decimais), escreva `1,234`.

## O que acontece com linhas com problema

Nada é descartado em silêncio. Depois de carregar, o app mostra quantos produtos entraram e
lista cada linha ignorada com o motivo:

- `Linha 7: Custo inválido: "abc".`
- `Linha 9: Nome vazio.`
- `Linha 12: SKU repetido: "EX-003" (mantida a primeira linha).`

## Carregar de novo não apaga o que já existe

A importação **mescla pelo SKU**: produto com SKU que já está no catálogo é atualizado,
SKU novo é acrescentado, e o resto (incluindo o que você cadastrou à mão) continua lá.
Para começar do zero, use **Planilha → Limpar catálogo**.

## Usando o Google Sheets

1. Na planilha, clique em **Compartilhar → Acesso geral → Qualquer pessoa com o link
   (Leitor)**.
2. Copie o link do navegador (o que termina em `/edit#gid=…`) e cole em **Planilha → link do
   Google Sheets**.
3. O app baixa a aba indicada pelo `gid` do link. Para outra aba, abra essa aba antes de
   copiar o link.

Também funciona o link de **Arquivo → Compartilhar → Publicar na Web → CSV**.

> 🔒 Com "qualquer pessoa com o link", quem tiver o link consegue ver os custos. Se os dados
> são sensíveis, prefira exportar o CSV e enviar o arquivo: ele é lido só no seu navegador e
> não vai para nenhum servidor.

## Onde os dados ficam

O catálogo fica **só no seu navegador** (`localStorage`). Nada é enviado para servidor. Em
janela anônima, ele some ao fechar. Use **Exportar catálogo** para guardar uma cópia em CSV.
