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
| `video.js` | gravação do canvas do fundo em vídeo |
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
  por hex. As cinco vão de cima para baixo — *topo*, *alta*, *meio*, *baixa*,
  *base* —, e é nessa ordem que aparecem na tela. Mexer numa cor solta a paleta e
  nenhum chip fica aceso. As quatro paletas saem todas dos mesmos cinco valores
  da marca — ver abaixo.
- **Movimento do fundo** — o que ele faz sozinho, sem ninguém no mouse: padrão do
  caminho das âncoras, velocidade (o relógio), amplitude (o caminho), giro e
  respiro. O giro é o único que não se move: é a inclinação da rampa, um ângulo
  que fica onde for posto. Zerar velocidade e amplitude deixa o fundo parado como
  arte fixa.
- **Gradiente** — escala, deformação, contraste, grão, vinheta e resolução.
- **Globo** — tamanho, traço e amplitude. O traço é um só para o desenho inteiro
  (aro e linhas com a mesma espessura) e a amplitude é o quanto ele vira quando o
  cursor chega à borda, em graus — vale igual em qualquer direção. Abertura e
  grade de linhas não estão aqui: são feitio da marca.
- **Marca** — o interruptor do logotipo e a tinta. "Da paleta" deixa a
  luminância decidir; qualquer outra fixa a cor.
- **Vídeo do fundo** — grava só o canvas do gradiente, sem marca e sem painel:
  formato (tela, 16:9, 9:16, 1:1), altura (720p a 2160p), container, 24/30/60
  fps, qualidade, duração e um interruptor para ignorar o cursor e capturar só o
  movimento próprio do fundo. A qualidade é medida por pixel e por quadro e o
  slider mostra o resultado em Mb/s, que acompanha o tamanho e os fps escolhidos.
  Enquanto grava, o canvas assume a resolução de saída e o CSS o mostra
  enquadrado — o que se vê é o que vai para o arquivo.
- **Presets** — guardam o desenho inteiro (cores, movimento, gradiente e globo) e
  deixam de fora a janela do painel. Ficam neste navegador; **Exportar** grava um
  `.json` e **Importar** traz de volta. Salvar com um nome que já existe
  substitui aquele; o × no chip apaga.

## Detalhes que não são gosto

- **O gradiente só conhece cinco cores.** `#040B21` (abismo), `#0D2457`
  (marinho), `#024CCA` (cobalto), `#487BE0` (pulso) e `#DCE2FF` (papel) estão
  numa tabela só, o `MARCA` no alto de `landing.js`, e as mesmas cinco são tokens
  em `landing.css`. As quatro paletas não são quatro esquemas de cor: são quatro
  composições destes mesmos valores — o que muda de uma para outra é em que
  altura da rampa cada um entra e quanto espaço ocupa, nunca o matiz. Cor nova entra no `MARCA` e
  chega em todas de uma vez; cor fora dele só existe se alguém digitar no painel,
  e aí já é peça, não marca. A tinta da marca segue a mesma regra: os chips de
  *Marca · Tinta* são as quatro, e mais nada.
- **O campo é uma rampa vertical: funda em cima, clara embaixo.** As cinco
  âncoras não são cinco manchas espalhadas — são cinco faixas empilhadas, na
  ordem em que o painel as mostra (topo, alta, meio, baixa, base). As alturas são
  as paradas da folha de marca — 10%, 27%, 52%, 75% e 100% a contar do topo —, e
  não cinco passos iguais: é isso que faz o escuro segurar o terço de cima e o
  claro só encostar na borda de baixo. Para sair
  faixa e não bolha, o peso da âncora conta a distância horizontal por uma
  fração: cada uma se espalha de lado e fica curta na vertical. O desencontro
  pequeno no eixo x é o que impede a rampa de virar listra de régua.
- **O raio da faixa é lido em fração de meia-tela, não em unidades do quadro.**
  A escala do peso desconta a proporção antes de medir. Sem isso, a mesma paleta
  que cobre um monitor deitado abriria buraco entre as faixas num retrato, onde a
  altura é quase o dobro — e a ponta clara da rampa cairia para fora da tela.
- **O giro é ângulo, não velocidade.** Ele já foi rotação contínua, e era
  coerente quando a composição era cinco manchas espalhadas — girar não tirava
  nada do lugar. Numa rampa vertical, rotação que anda levaria o topo escuro para
  o lado e, mais adiante, para baixo: o desenho da marca deixaria de ser o
  desenho da marca em algum ponto da animação. O que o slider dá agora é o
  desaprumo, e o padrão (−0,03, uns 5°) é só o bastante para a rampa não parecer
  régua.
- **O brilho soma luz, não mistura branco.** Ele era um `mix` para a última cor
  da paleta; com a rampa vertical essa cor passou a ser a base, que é quase
  branca, e branco misturado em azul fundo dá cinza — o halo acinzentado em volta
  da marca. Agora ele entra em modo *screen* (nunca estoura de 1) e com a cor
  mais viva da paleta, escolhida por croma × brilho: o elétrico ganha tanto do
  quase-preto, que tem croma mas é escuro demais, quanto do papel, que é claro e
  quase sem croma. O efeito continua ligado e na mesma dose; o que mudou é que
  ele acende em vez de desbotar.
- **O rodapé tem tinta própria.** Ele mora na última faixa, que numa rampa é a
  ponta oposta do meio: com uma cor de texto só para a página inteira, ele sumiria
  toda vez que a base clareasse. A cor dele sai da luminância da faixa onde ele
  está (`--texto-pe`), enquanto o resto da página segue a do meio, que é onde a
  marca pousa.

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
- **Com o mouse parado, a marca se acomoda no azimute 245°.** O azimute é a
  direção em que o cruzamento dos eixos sai do centro (0° ao norte, 90° a leste),
  e a força da pose é uma fração do desvio máximo em vigor — então ela acompanha
  o slider de amplitude em vez de brigar com ele. Entra depois de um tempo parado
  e sai no primeiro movimento do mouse. É também a pose com que a página abre,
  antes de qualquer gesto.
- **A pose de repouso é frontal, e isso é o que centra o movimento.** Uma pose de
  partida girada — a marca tem 14° de rotação no preset — faria o desvio pender
  para um lado: o cruzamento dos eixos iria de −12% a +57% do raio em vez de ir
  de −36% a +36%. Com zero no repouso, esquerda e direita (e cima e baixo) são o
  mesmo movimento.
- **O que é gesto da identidade não vira slider.** Ponta reta, linhas cortadas
  no horizonte, abertura, grade de meridianos e paralelos e a inércia do
  seguir-o-cursor: tudo fixo em `landing.js`, porque tem de sair igual em toda
  peça. A amplitude é a exceção — ela é a força do gesto, não o feitio dele, e
  está no painel. No painel seriam jeitos de desenhar o logo errado.
- **A cor do texto e a tinta da marca não são escolhidas, são deduzidas.** Saem
  da luminância das cores em vigor, com peso maior para a âncora do centro —
  onde a marca pousa. É o que faz uma paleta montada à mão continuar legível.
- **MP4/H.264 High é o padrão porque é o que abre em tudo** — inclusive After
  Effects e Premiere, que é para onde estes vídeos vão. O perfil importa: High
  tem CABAC e transformada 8×8, que é o que segura gradiente sem abrir faixa, e
  Baseline não tem nenhum dos dois. A lista pede High 5.2 primeiro e desce até o
  que o navegador aceitar — quem não aguenta responde "não" no `isTypeSupported`.
  VP9 fica no WebM, que rende mais por bit e serve à web; VP9 dentro de MP4 quase
  nenhum navegador oferece na gravação, e não abriria nos programas de edição.
- **O tamanho do GOP não dá para escolher**: o `MediaRecorder` não expõe. Quem
  precisa cortar em qualquer quadro recodifica depois —
  `ffmpeg -i a.mp4 -c:v prores_ks -profile:v 3 a.mov`.
- **A taxa de bits sai por pixel e por quadro**, e não em Mb/s fixos: o mesmo
  número serviria mal a 720p e pior ainda a 4K. O padrão é folgado (0,3) e o teto
  é alto (240 Mb/s). Gradiente é o pior caso para o codec: área enorme de
  variação mínima, onde a compressão paga com faixas justamente no que a página
  tem de mais delicado.
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
- **A chave do `localStorage` carrega a versão dos padrões** (`everblue-landing-6`).
  Mudou o padrão de fábrica, a chave muda junto: senão o valor salvo de ontem
  esconderia o padrão novo e ninguém veria a mudança.
- **Sem WebGL a página continua de pé**: o `body` já carrega um gradiente CSS com
  as cores em vigor, e é ele que aparece.
- **`prefers-reduced-motion`** derruba a velocidade do fundo nos padrões — quem
  quiser, sobe no painel.

## Tipografia

A fonte do site é a **Trust**, de Jeremy Mickel (MCKL) — a subfamília 1A, no
token `--trust` no alto de `landing.css`. Os arquivos são licenciados e não moram
no repositório: entram em `fontes/`, que está no `.gitignore`, e
`fontes/LEIAME.md` diz quais são e com que nome. Sem eles a página continua de
pé: os `@font-face` não carregam e a pilha de trás assume.

O trial da MCKL não serve para web — o texto dele proíbe converter ou usar como
webfont. O que a página precisa é da licença de webfont da família.

## Conteúdo

Os itens do topo são os capítulos do manual da marca — Estratégia, Marca,
Linguagem e Exemplos. Ainda apontam para `#`: os destinos entram quando as
seções existirem.
#   E v e r b l u e _ O c e a n _ 
 
 #   E v e r b l u e _ O c e a n _ 
 
 