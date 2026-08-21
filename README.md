# Everblue · Landing

Uma tela só: a marca no meio, um gradiente vivo atrás e um painel flutuante para
calibrar o que o cursor faz com as duas coisas. Roda sem build e sem servidor —
basta abrir `index.html` no navegador, como o gerador de globo.

## Arquivos

| arquivo | papel |
| --- | --- |
| `index.html` | markup da página, o logotipo em vetor e o painel |
| `landing.css` | estilo da página e do painel |
| `globe-core.js` | geometria do globo, portada do gerador |
| `gradient.js` | o fundo em WebGL (shader e uniformes) |
| `landing.js` | estado, ponteiro, laço de quadro e montagem do painel |

Os scripts são clássicos com `defer`, e não módulos ES: assim a página continua
funcionando aberta direto do disco (`file://`), onde módulos falhariam por CORS.

## Como está organizado

Um `requestAnimationFrame` só move tudo. O fundo e o globo leem o mesmo ponteiro
no mesmo quadro — se cada um tivesse o seu laço, um chegaria atrasado do outro e
a marca pareceria descolar do fundo.

- **`globe-core.js`** é o gerador sem a interface: projeta a esfera, corta as
  linhas no horizonte e devolve os `d` dos caminhos. Quem manda no formato da
  marca continua sendo `pgm/Globe` — mexeu na geometria lá, traga a mudança para
  cá em vez de desenhar um segundo logo.
- **`gradient.js`** é um mesh gradient: cinco âncoras de cor pairando devagar,
  misturadas por peso gaussiano e amassadas por um *domain warp* de ruído. O
  cursor não pinta nada — ele deforma a coordenada **antes** da mistura, e é por
  isso que os efeitos se somam sem sujar.
- **`landing.js`** guarda o estado, converte o ponteiro para os dois espaços
  (tela, para o fundo; centro da marca, para o globo) e monta o painel a partir
  da mesma lista que descreve o estado.

## A página

Só o símbolo, centralizado — é a visualização padrão. O logotipo entra pelo
painel (*Marca · Mostrar logotipo*) e é o vetor da marca, não texto.

Os dois vetores moram em `index.html` uma vez só, como `<symbol>`, e herdam a
tinta do globo por `currentColor`: `#letra` é o logotipo e `#simbolo` é a versão
cheia do globo. O selo do topo usa os dois — em tamanho de canto, o desenho de
linha do meio fecharia e viraria borrão, então ali entra a versão cheia. O globo
do meio continua sendo geometria viva, desenhada quadro a quadro.

O rodapé é leitura ao vivo da esfera, tirada da pose em vigor e não de um relógio
à parte — para quando o globo para:

| valor | o que é |
| --- | --- |
| `lat` | latitude do ponto da esfera que encara o observador |
| `lon` | longitude do mesmo ponto (sinal trocado: girar para a direita traz à frente o meridiano da esquerda) |
| `azimute` | direção do desvio na tela, 0° ao norte |
| `desvio` | distância do cruzamento dos eixos ao centro, em % do raio |
| `giro` | velocidade angular do desenho, em °/s |

Clicar num valor acende no globo o lugar de onde ele sai — um anel de 1px no
ponto que o número descreve, mais uma guia tracejada por valor: o círculo de
latitude, o meridiano, o raio do azimute, o círculo do desvio e o rastro do
giro. Clicar de novo apaga; só um por vez.

## O painel

Flutua sobre a página, arrasta pela barra de título e lembra tudo no
`localStorage` deste navegador. `H` esconde, `M` minimiza, **Copiar estado** joga
o JSON na área de transferência e **Restaurar** volta aos padrões (a janela fica
onde está).

- **Cursor** — influência mestra, alcance da zona que ele mexe e inércia.
- **Efeitos do cursor** — sete, cada um com interruptor e dose própria: atrair,
  repelir, redemoinho, ondas (clique dá um estouro), brilho, paralaxe e
  turbulência. Mexer na dose de um efeito desligado liga ele.
- **Cores** — as quatro paletas são ponto de partida: escolher uma copia as
  cores para o estado, e a partir dali cada uma das cinco âncoras (mais o
  "fundo", que é o piso do campo e a cor da vinheta) é editável por amostra ou
  por hex. Mexer numa cor solta a paleta e nenhum chip fica aceso.
- **Movimento do fundo** — o que ele faz sozinho, sem ninguém no mouse: padrão do
  caminho das âncoras, velocidade (o relógio), amplitude (o caminho), giro da
  composição inteira e respiro. Zerar velocidade e amplitude deixa o fundo parado
  como arte fixa.
- **Gradiente** — escala, deformação, contraste, grão, vinheta e resolução.
- **Globo** — tamanho e traço, e mais nada: abertura, grade de linhas e o jeito
  de seguir o cursor não estão aqui. O traço é um só para o desenho inteiro —
  aro e linhas com a mesma espessura.
- **Marca** — o interruptor do logotipo e a tinta. "Da paleta" deixa a
  luminância decidir; qualquer outra fixa a cor.
- **Presets** — guardam o desenho inteiro (cores, movimento, gradiente e globo) e
  deixam de fora a janela do painel. Ficam neste navegador; **Exportar** grava um
  `.json` e **Importar** traz de volta. Salvar com um nome que já existe
  substitui aquele; o × no chip apaga.

## Detalhes que não são gosto

- **O movimento do globo é circular por construção.** Com uma amplitude por eixo
  — 45° na rotação e 28° na inclinação, que era o par do gerador — um círculo do
  mouse sai uma elipse deitada. `poseCircular()` resolve ao contrário: impõe onde
  o cruzamento dos eixos deve cair e devolve os dois ângulos, de modo que o mesmo
  gesto valha o mesmo deslocamento em qualquer direção. Os dois eixos do ponteiro
  também são divididos pelo mesmo raio e presos ao disco unitário, senão numa
  tela deitada andar de lado valeria menos do que subir.
- **A guia de leitura é de 1px de verdade.** O globo é desenhado em unidades de
  viewBox e escalado pelo CSS, então uma espessura em unidades engrossaria junto
  com a marca: `vector-effect: non-scaling-stroke` prende o traço no pixel da
  tela. O anel é maior que a espessura do desenho de propósito — menor que isso
  ele fica enterrado sob o próprio traço quando o ponto cai em cima de uma linha.
- **O que é gesto da identidade não vira slider.** Ponta reta, linhas cortadas
  no horizonte, abertura, grade de meridianos e paralelos, amplitude e inércia do
  seguir-o-cursor: tudo fixo em `landing.js`, porque tem de sair igual em toda
  peça. No painel seriam jeitos de desenhar o logo errado.
- **A cor do texto e a tinta da marca não são escolhidas, são deduzidas.** Saem
  da luminância das cores em vigor, com peso maior para a âncora do centro —
  onde a marca pousa. É o que faz uma paleta montada à mão continuar legível.
- **Grão sempre ligado, mesmo em 0.** Há um dither fixo de meio nível de 8 bits
  no shader: sem ele, um gradiente desta suavidade sai em faixas na maioria das
  telas. O slider é o grão de cima disso.
- **O hash do ruído não usa `sin()`.** O `fract(sin(dot(p, k)))` clássico depende
  de a precisão aguentar um argumento enorme, e a coordenada de pixel de uma tela
  cheia já é grande demais: o seno satura em degraus e o ruído vira uma grade de
  retângulos escorrendo na diagonal — pior no grão, alimentado direto com
  `gl_FragCoord`. O hash que está lá é só `fract` e produto.
- **Resolução abaixo da tela.** O fundo é liso, então é renderizado a 75% e
  esticado pelo CSS. É de longe o maior botão de desempenho da página.
- **A marca fica no centro e quem se ajusta é o tamanho.** O lockup é medido
  depois de montado (`offsetWidth`, que não sofre com a transição em curso) e
  encolhe só o quanto precisar para não passar por baixo do painel. Escondido o
  painel (`H`), volta ao tamanho cheio.
- **A cor do texto troca de uma vez com a paleta**, sem transição: o fundo muda
  no quadro seguinte, e um texto atravessando meio segundo de cor intermediária
  chegaria atrasado — num quadro só (uma captura, um vídeo), chegaria errado.
- **A chave do `localStorage` carrega a versão dos padrões** (`everblue-landing-3`).
  Mudou o padrão de fábrica, a chave muda junto: senão o valor salvo de ontem
  esconderia o padrão novo e ninguém veria a mudança.
- **Sem WebGL a página continua de pé**: o `body` já carrega um gradiente CSS com
  as cores em vigor, e é ele que aparece.
- **`prefers-reduced-motion`** derruba a velocidade do fundo nos padrões — quem
  quiser, sobe no painel.

## Conteúdo

Os links do topo são de rascunho, para o cabeçalho ter o que segurar. Trocar por
destinos de verdade antes de qualquer coisa pública.
#   E v e r b l u e _ O c e a n _ 
 
 #   E v e r b l u e _ O c e a n _ 
 
 