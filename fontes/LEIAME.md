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

## Enquanto os arquivos não chegam

A página funciona. Os `@font-face` não carregam, a pilha de trás assume
(Poppins → Montserrat → Futura → a do sistema) e o desenho continua de pé. É de
propósito: assim ninguém precisa da licença para rodar o projeto, e ninguém
publica sem ela por engano.

## A licença

O trial da MCKL **não serve** para isto. O texto dele proíbe, com todas as
letras, "use the Font Software as a webfonts, convert the Font Software into
webfont formats". O que a página precisa é da licença de webfont da família, que
vem no mesmo carrinho da desktop na loja deles — e é ela que gera o `.woff2` que
entra aqui.
