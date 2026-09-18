# Fontes

A tipografia do site é a **Trust**, de Jeremy Mickel (MCKL Type).
<https://www.mckltype.com/typefaces/trust>

Os arquivos não estão aqui, e não devem estar: são licenciados por uso, e o
repositório é público para quem tem acesso à pasta. Esta pasta é onde eles
entram, e o `.gitignore` já impede que subam junto num commit distraído.

## O que a folha de estilo espera

`landing.css` declara três pesos, que são os três que a página usa. Os nomes dos
arquivos são estes, exatamente:

| arquivo | peso | onde aparece |
| --- | --- | --- |
| `Trust1A-Regular.woff2` | 400 | corpo, valores do rodapé, texto do painel |
| `Trust1A-Medium.woff2` | 500 | logotipo do selo, rótulos |
| `Trust1A-Bold.woff2` | 700 | títulos do painel e do cabeçalho (o CSS pede 600 e o navegador resolve para cá) |

Se o kit da compra vier com a variável (`Trust1A-Variable.woff2`), use ela no
lugar dos três: há um `@font-face` pronto e comentado no fim de `landing.css`.

## Trocar de subfamília

A Trust tem nove — de 1A a 3C, do sans ao serifado. Para provar outra, mude a
linha `--trust` no alto de `landing.css` e o nome dos arquivos nos `@font-face`.
Nada mais na folha nomeia fonte: tudo pede `var(--sans)`.

## O que está aqui hoje

`Trust1ATRIAL-{Regular,Medium,Bold}.otf` — o trial da MCKL, tal como veio, sem
conversão. Cada `@font-face` tenta o `.woff2` licenciado primeiro e cai no `.otf`
só se ele faltar; no dia em que o kit entrar, o licenciado vence sozinho.

A página é peça interna, de prova, e não vai ao ar — é isso que faz o trial
servir. O trial não cobre publicação nem uso como webfont: se um dia for
publicar, os três `.woff2` licenciados entram aqui e os `.otf` saem.
