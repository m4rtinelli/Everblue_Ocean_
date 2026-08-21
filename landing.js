/* Everblue · landing
   Junta as três peças: o fundo (gradient.js), a marca (globe-core.js) e o painel
   flutuante que pilota as duas. Um rAF só para tudo — o fundo e o globo leem o
   mesmo ponteiro no mesmo quadro, senão um chega atrasado do outro e a marca
   parece descolar do fundo.

   Ordem do arquivo: paletas → estado → ponteiro → laço → painel → atalhos. */
(function () {
  const { clamp, FOLLOW, poseCircular, makePainter } = window.EBGlobe;
  const $ = (id) => document.getElementById(id);

  /* ---------- paletas ----------
     As cinco cores não são uma rampa: são uma composição, na ordem em que o
     shader distribui as âncoras — alto-esquerda, direita, baixo-esquerda,
     baixo-direita e o clarão do meio. "fundo" é a cor funda que faz o piso do
     campo e a vinheta.

     Uma paleta é ponto de partida, não estado: escolher uma copia as cores para
     o estado, e dali em diante cada cor é editável no painel. Tinta da marca,
     cor do texto e véu não moram aqui — saem da luminância das cores em vigor, e
     por isso continuam certos numa paleta montada à mão. */
  const PALETAS = {
    everblue: {
      nome: "Everblue",
      // o clarão elétrico no meio, azul fundo em volta e o canto de baixo à
      // esquerda quase preto — a foto de referência da marca
      cores: ["#10286F", "#1B4AD8", "#01030F", "#0A1A5E", "#2C72FF"],
      raios: [0.9, 0.95, 0.9, 0.95, 0.95],
      fundo: "#01030F",
    },
    abismo: {
      nome: "Abismo",
      cores: ["#1B3FA0", "#2E8BFF", "#071A4D", "#01050F", "#7FB0FF"],
      raios: [0.95, 0.7, 1.1, 1.15, 0.6],
      fundo: "#01050F",
    },
    aurora: {
      nome: "Aurora",
      cores: ["#5FE2E0", "#2E8BFF", "#1338C9", "#04123B", "#EAF8FF"],
      raios: [0.8, 0.9, 0.95, 1.05, 0.62],
      fundo: "#04123B",
    },
    papel: {
      nome: "Papel",
      cores: ["#DCE9FA", "#C6DAF6", "#A8C4EE", "#8FB3EA", "#FFFFFF"],
      raios: [1.0, 0.9, 0.95, 1.0, 0.75],
      fundo: "#8FB3EA",
    },
  };
  // rotulos das ancoras, na mesma ordem das cores
  const CORES = ["Alto · esq.", "Direita", "Baixo · esq.", "Baixo · dir.", "Centro"];

  /* Hex livre: aceita com ou sem #, e na forma de tres digitos. Devolve null no
     que nao for cor — serve ao campo digitado e ao estado salvo, que e arquivo
     de fora e pode trazer qualquer coisa dentro. */
  function normHex(v) {
    const t = String(v == null ? "" : v)
      .trim()
      .replace(/^#/, "");
    if (!/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(t)) return null;
    return "#" + (t.length === 3 ? t.replace(/./g, (c) => c + c) : t).toUpperCase();
  }
  // luminancia relativa, so para a pagina saber se o fundo ficou escuro
  const lumin = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return (
      (0.2126 * ((n >> 16) & 255) +
        0.7152 * ((n >> 8) & 255) +
        0.0722 * (n & 255)) /
      255
    );
  };

  /* Efeitos do cursor. A ordem aqui é a ordem do painel; a chave é a mesma que o
     shader recebe, então acrescentar um efeito é acrescentar uma linha aqui, um
     uniforme lá e nada no meio. */
  const EFEITOS = [
    {
      chave: "atrair",
      nome: "Atrair",
      dica: "A cor se junta em volta do cursor, como uma lente.",
    },
    {
      chave: "repelir",
      nome: "Repelir",
      dica: "Empurra a cor para fora e abre um vazio em volta do cursor.",
    },
    {
      chave: "redemoinho",
      nome: "Redemoinho",
      dica: "Gira o campo em torno do cursor — e gira mais quando o mouse corre.",
    },
    {
      chave: "ondas",
      nome: "Ondas",
      dica: "Cristas concêntricas saindo do cursor. Clicar dá um estouro.",
    },
    {
      chave: "brilho",
      nome: "Brilho",
      dica: "Levanta a exposição em volta do cursor, como uma fonte de luz.",
    },
    {
      chave: "paralaxe",
      nome: "Paralaxe",
      dica: "O fundo inteiro escorrega com o ponteiro, sem foco local.",
    },
    {
      chave: "turbulencia",
      nome: "Turbulência",
      dica: "A velocidade do gesto embaralha o ruído que amassa o gradiente.",
    },
  ];

  /* Movimento contínuo do fundo. A chave é do estado e do painel; o número é o
     que o shader entende, e a ordem dos dois tem de bater. */
  const MOVFUNDO = [
    ["nenhum", "Nenhum"],
    ["deriva", "Deriva"],
    ["orbita", "Órbita"],
    ["vaivem", "Vaivém"],
    ["mare", "Maré"],
  ];
  const MOVID = { nenhum: 0, deriva: 1, orbita: 2, vaivem: 3, mare: 4 };

  const TINTAS = [
    ["#0B1F4D", "Abismo"],
    ["#1B3FA0", "Marinho"],
    ["#2E8BFF", "Pulso"],
    ["#BCD4F5", "Céu"],
    ["#FFFFFF", "Papel"],
  ];

  /* ---------- estado ---------- */
  const menosMovimento = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const PADRAO = {
    paleta: "everblue", // memoria de qual chip acendeu; "custom" quando editado
    cores: {
      anc: PALETAS.everblue.cores.slice(),
      // o raio de cada âncora anda junto com a cor: editar uma cor não pode
      // mudar o tamanho da mancha por baixo do pano
      raios: PALETAS.everblue.raios.slice(),
      fundo: PALETAS.everblue.fundo,
    },
    grad: {
      infl: 1,
      reach: 0.8,
      suav: 0.12, // inércia do ponteiro no fundo
      scale: 1,
      warp: 0.42,
      contrast: 1.08,
      grain: 0.28,
      vig: 0.5,
      qual: 0.75,
      fx: {
        atrair: { on: true, v: 0.7 },
        repelir: { on: false, v: 0.5 },
        redemoinho: { on: true, v: 0.45 },
        ondas: { on: true, v: 0.6 },
        brilho: { on: true, v: 0.5 },
        paralaxe: { on: true, v: 0.4 },
        turbulencia: { on: true, v: 0.5 },
      },
    },
    // o que o fundo faz sozinho, sem ninguém no mouse
    mov: {
      padrao: "deriva",
      vel: menosMovimento ? 0.2 : 1,
      amp: 0.3,
      giro: 0,
      respiro: 0,
    },
    globo: {
      infl: 1,
      inercia: 0.14,
      // a marca abre sozinha; o logotipo é opcional e entra pelo painel
      lettering: false,
      tam: 26, // em vmin, limitado pela largura em aplicarTamanho()
      stroke: 20,
      aperture: 0.15,
      meridians: 1,
      parallels: 1,
      tinta: "auto", // "auto" = a tinta que a paleta pede
    },
    // em tela estreita o painel é gaveta e nasce recolhido: aberto de saída, ele
    // cobriria justamente a marca que veio ver
    hud: { aberto: true, min: innerWidth < 780, x: null, y: null },
  };

  /* A chave carrega a versão dos padrões: mudou o padrão de fábrica, a chave
     muda junto e o que estava salvo é ignorado em vez de esconder o padrão novo
     atrás de um valor antigo. */
  const CHAVE = "everblue-landing-2";
  const clone = (o) => JSON.parse(JSON.stringify(o));

  /* Mescla o que estava salvo por cima do padrão, campo a campo: um arquivo
     antigo (ou mexido na mão) não pode apagar chave nova nem trocar o tipo de
     uma existente — o padrão manda na forma, o salvo só nos valores. */
  function fundir(base, salvo) {
    if (!salvo || typeof salvo !== "object") return base;
    for (const k of Object.keys(base)) {
      const b = base[k],
        s = salvo[k];
      if (s === undefined) continue;
      if (Array.isArray(b)) {
        // lista so entra inteira e do mesmo feitio: meia lista salva viraria uma
        // paleta com buraco no meio
        if (
          Array.isArray(s) &&
          s.length === b.length &&
          s.every((v, i) => typeof v === typeof b[i])
        )
          base[k] = s.slice();
      } else if (b !== null && typeof b === "object") fundir(b, s);
      // padrão nulo é campo ainda sem valor (posição do painel): aceita número
      else if (b === null) {
        if (s === null || typeof s === "number") base[k] = s;
      } else if (typeof b === typeof s) base[k] = s;
    }
    return base;
  }

  const S = fundir(clone(PADRAO), ler());
  sanear();

  /* Estado que veio de fora — do disco ou de um arquivo de preset — pode trazer
     qualquer coisa dentro. A forma quem garante é o fundir; aqui cai o que a
     forma não pega: cor que não é cor e chave de lista que não existe. */
  function sanear() {
    if (S.paleta !== "custom" && !PALETAS[S.paleta]) S.paleta = "everblue";
    S.cores.anc = S.cores.anc.map(
      (c, i) => normHex(c) || PALETAS.everblue.cores[i],
    );
    S.cores.fundo = normHex(S.cores.fundo) || PALETAS.everblue.fundo;
    if (!(S.mov.padrao in MOVID)) S.mov.padrao = "deriva";
  }

  function ler() {
    try {
      return JSON.parse(localStorage.getItem(CHAVE) || "null");
    } catch (e) {
      return null;
    }
  }
  let salvarT = 0;
  function salvar() {
    clearTimeout(salvarT);
    salvarT = setTimeout(() => {
      try {
        localStorage.setItem(CHAVE, JSON.stringify(S));
      } catch (e) {
        /* modo privado: a página funciona igual, só não lembra */
      }
    }, 250);
  }

  const caminho = (p) => p.split(".").reduce((o, k) => o[k], S);
  function porCaminho(p, v) {
    const ks = p.split("."),
      ult = ks.pop();
    ks.reduce((o, k) => o[k], S)[ult] = v;
  }

  /* ---------- peças da tela ---------- */
  const canvas = $("bg");
  const svg = $("globo");
  const lockup = document.querySelector(".lockup");
  const heroi = document.querySelector(".heroi");
  const pintar = makePainter(svg);
  const grad = window.EBGradient.create(canvas);
  if (!grad) document.body.classList.add("sem-webgl");

  // parâmetros do globo: um objeto só, mutado no lugar. A pose de repouso é a do
  // preset da marca (everblue-presets-globe.json), não zero — o logo tem uma
  // inclinação própria e o cursor é desvio em cima dela.
  const REPOUSO = { rotY: 14, rotX: -6 };
  const G = {
    meridians: 1,
    parallels: 1,
    aperture: 0.15,
    rotY: REPOUSO.rotY,
    rotX: REPOUSO.rotX,
    gapCenter: 40,
    anchorTop: true,
    stroke: 20,
    /* Feitio da marca, e não preferência: a abertura termina reta embaixo e as
       linhas somem atrás do globo. Ficam fixos aqui de propósito — no painel
       seriam dois jeitos de desenhar o logo errado. */
    pontaReta: true,
    seeThrough: false,
    ink: "#0B1F4D",
  };

  // estado efetivo do fundo, reaproveitado quadro a quadro para não gerar lixo
  const stGrad = {
    infl: 1,
    reach: 0.8,
    scale: 1,
    warp: 0.4,
    contrast: 1,
    grain: 0.3,
    vig: 0.5,
    fx: {},
    mov: { padrao: 1, amp: 0.3, respiro: 0 },
    cores: PALETAS.everblue.cores,
    raios: PALETAS.everblue.raios,
    fundo: PALETAS.everblue.fundo,
  };

  /* ---------- ponteiro ----------
     Duas leituras da mesma mão: a do fundo é em espaço de tela (lado menor
     -1..1, y para cima como no shader) e a do globo é relativa ao centro da
     marca, como no gerador. Guardar as duas evita converter uma na outra a cada
     quadro e deixa o globo continuar centrado quando a marca sai do meio. */
  const pt = {
    x: 0, y: 0, // suavizado, espaço do fundo
    ax: 0, ay: 0, // alvo
    vx: 0, vy: 0, // velocidade suavizada
    gx: 0, gy: 0, // alvo do globo, -1..1
    dentro: false,
    ultimo: -1e4,
    pulso: -1e4,
  };
  let caixaGlobo = null;

  function medir() {
    caixaGlobo = svg.getBoundingClientRect();
  }
  // enquanto o lockup desliza, a caixa da marca muda a cada quadro; remedir no
  // fim da transição basta, e é o que mantém o alvo do cursor no centro certo
  lockup.addEventListener("transitionend", medir);
  heroi.addEventListener("transitionend", medir);

  /* Quanta largura a marca pode ocupar ficando no centro da tela. Como ela é
     centrada, o espaço é simétrico: o painel come dos dois lados ao mesmo tempo,
     e o lado que sobra do outro não conta. Painel em cima do meio não deixa
     simetria nenhuma para preservar, e aí a conta desiste e devolve a tela. */
  function larguraLivre() {
    let meia = innerWidth / 2 - 40;
    if (S.hud.aberto && innerWidth > 780) {
      const r = hud.getBoundingClientRect(),
        meio = innerWidth / 2;
      if (r.left > meio) meia = Math.min(meia, r.left - 20 - meio);
      else if (r.right < meio) meia = Math.min(meia, meio - (r.right + 20));
    }
    return Math.max(meia * 2, 260);
  }

  /* O logotipo é texto, e a largura dele depende da fonte que a máquina tiver —
     apostar num número dá marca cortada em metade das máquinas. Então a marca
     mede o que montou e encolhe só o quanto precisar para caber, sem sair do
     centro da tela. Escondido o painel (H), ela volta ao tamanho cheio.

     A medida sai de offsetWidth, não de getBoundingClientRect: o rect já vem com
     a escala aplicada e, com a transição correndo, devolveria um valor no meio
     do caminho — a conta realimentaria a si mesma a cada chamada. */
  function ajustarLockup() {
    /* Em tela estreita o painel é gaveta e ocupa o rodapé: aberto, ele empurra a
       marca para cima pela metade da própria altura. Recolhido, a barra de
       título é fina e a marca fica onde deve ficar — no meio. */
    let dy = 0;
    if (innerWidth <= 780 && S.hud.aberto && !S.hud.min)
      dy = -Math.min(hud.getBoundingClientRect().height, innerHeight * 0.5) / 2;
    heroi.style.transform = dy < -1 ? "translateY(" + dy.toFixed(1) + "px)" : "";

    const nat = lockup.offsetWidth;
    if (!nat) return;
    const k = clamp(larguraLivre() / nat, 0.3, 1);
    lockup.style.transform = k < 0.999 ? "scale(" + k.toFixed(3) + ")" : "";
    requestAnimationFrame(medir);
  }

  function lerPonteiro(e) {
    const w = innerWidth,
      h = innerHeight,
      mn = Math.min(w, h);
    pt.ax = ((e.clientX - w / 2) / mn) * 2;
    pt.ay = -((e.clientY - h / 2) / mn) * 2; // y do WebGL cresce para cima
    if (caixaGlobo) {
      /* Os dois eixos são divididos pelo mesmo raio, e o resultado é preso ao
         disco unitário: normalizar x por meia largura e y por meia altura faria
         o mesmo gesto valer menos na horizontal numa tela deitada — e o globo
         responderia mais a subir do que a andar de lado. */
      const raio = mn / 2;
      let dx = (e.clientX - (caixaGlobo.left + caixaGlobo.width / 2)) / raio,
        dy = (e.clientY - (caixaGlobo.top + caixaGlobo.height / 2)) / raio;
      const m = Math.hypot(dx, dy);
      if (m > 1) {
        dx /= m;
        dy /= m;
      }
      pt.gx = dx;
      pt.gy = dy;
    }
    pt.dentro = true;
    pt.ultimo = performance.now();
  }

  addEventListener("pointermove", lerPonteiro, { passive: true });
  addEventListener(
    "pointerdown",
    (e) => {
      // o clique no painel é do painel: não vira estouro no fundo
      if (e.target.closest && e.target.closest(".hud")) return;
      lerPonteiro(e);
      pt.pulso = performance.now();
    },
    { passive: true },
  );
  addEventListener("pointerleave", () => {
    pt.dentro = false;
  });
  addEventListener("blur", () => {
    pt.dentro = false;
  });
  addEventListener("resize", () => {
    aplicarTamanho(); // o teto de largura do lockup muda com a janela
    ajustarLockup();
  });

  /* ---------- laço ----------
     dt limitado a 50 ms: voltar de uma aba escondida não pode entregar meio
     segundo de uma vez, senão o fundo salta e o globo dá um giro do nada. */
  const anim = { cY: 0, cX: 0, tY: 0, tX: 0 };
  let tempo = 0, // relógio bruto: grão e ondas
    campo = 0, // relógio do campo, já com a velocidade integrada
    campoGiro = 0, // ângulo do campo, idem
    ultimo = performance.now(),
    raf = 0,
    fps = 60,
    pintadoY = 1e9,
    pintadoX = 1e9,
    pintadoSel = "";

  function quadro(agora) {
    const dt = Math.min(0.05, (agora - ultimo) / 1000);
    ultimo = agora;
    tempo += dt;
    campo += dt * S.mov.vel;
    campoGiro += dt * S.mov.giro * 0.5;
    fps += (1 / Math.max(dt, 1e-4) - fps) * 0.06;

    passoPonteiro(dt);
    passoGlobo(dt);
    passoLeitura(agora, dt);
    passoFundo();

    raf = requestAnimationFrame(quadro);
  }

  /* Suavização exponencial normalizada pelo dt: o mesmo slider dá a mesma
     inércia a 60 ou a 120 Hz, em vez de o monitor rápido chegar mais rápido. */
  const suave = (k, dt) => 1 - Math.pow(1 - clamp(k, 0.001, 0.999), dt * 60);

  function passoPonteiro(dt) {
    const k = suave(S.grad.suav, dt);
    const px = pt.x,
      py = pt.y;
    pt.x += (pt.ax - px) * k;
    pt.y += (pt.ay - py) * k;
    // velocidade em unidades de tela por segundo, ela mesma amortecida — o valor
    // cru pisca a cada quadro e faria a turbulência tremer
    const kv = Math.min(1, dt * 7);
    pt.vx += ((pt.x - px) / Math.max(dt, 1e-3) - pt.vx) * kv;
    pt.vy += ((pt.y - py) / Math.max(dt, 1e-3) - pt.vy) * kv;
  }

  function passoGlobo(dt) {
    const gl = S.globo;

    /* Fora da janela, o globo volta ao repouso pela mesma suavização com que
       seguiu o cursor — some o alvo, não o movimento. */
    const [tY, tX] = pt.dentro
      ? poseCircular(pt.gx, pt.gy, FOLLOW.amp * gl.infl)
      : [0, 0];
    anim.tY = tY;
    anim.tX = tX;

    const k = suave(gl.inercia, dt);
    anim.cY += (anim.tY - anim.cY) * k;
    anim.cX += (anim.tX - anim.cX) * k;

    G.rotY = REPOUSO.rotY + anim.cY;
    G.rotX = REPOUSO.rotX + anim.cX;

    /* Só redesenha quando a pose mudou o bastante para aparecer: a tesselagem é
       a parte cara e, parado, ela sairia igual 60× por segundo. Meio décimo de
       grau é menos de um décimo de pixel na borda com o globo em tela cheia. */
    const sel = gl.stroke + "|" + gl.aperture + "|" + gl.meridians + "|" +
      gl.parallels + "|" + G.ink;
    if (
      Math.abs(G.rotY - pintadoY) > 0.05 ||
      Math.abs(G.rotX - pintadoX) > 0.05 ||
      sel !== pintadoSel
    ) {
      G.stroke = gl.stroke;
      G.aperture = gl.aperture;
      G.meridians = gl.meridians;
      G.parallels = gl.parallels;
      pintar(G);
      pintadoY = G.rotY;
      pintadoX = G.rotX;
      pintadoSel = sel;
    }
  }

  /* ---------- leitura ao vivo ----------
     Os cinco números do rodapé saem da pose em vigor, e não de um relógio à
     parte: param quando o globo para. lat/lon são do ponto da esfera que encara
     o observador — girar em Y anda na longitude, inclinar anda na latitude, e a
     longitude sai com o sinal trocado porque girar o globo para a direita traz
     para a frente o meridiano que estava à esquerda. */
  const LEIT = {
    lat: $("vLat"),
    lon: $("vLon"),
    az: $("vAz"),
    des: $("vDes"),
    vel: $("vVel"),
    rY: 0,
    rX: 0,
    w: 0,
    prox: 0,
  };
  const rad = (d) => (d * Math.PI) / 180;
  const fmtAng = (v) =>
    (v < 0 ? "−" : "+") + Math.abs(v).toFixed(1).padStart(4, "0") + "°";
  function escreve(el, txt) {
    if (el.__t !== txt) {
      el.textContent = txt;
      el.__t = txt;
    }
  }

  function passoLeitura(agora, dt) {
    // velocidade angular do desenho, não do mouse: é o que o olho vê girar
    const inst =
      Math.hypot(G.rotY - LEIT.rY, G.rotX - LEIT.rX) / Math.max(dt, 1e-3);
    LEIT.w = Math.max(0, LEIT.w + (inst - LEIT.w) * Math.min(1, dt * 6));
    LEIT.rY = G.rotY;
    LEIT.rX = G.rotX;
    // ~12 leituras por segundo: mais que isso o olho não lê e o DOM só sofre
    if (agora < LEIT.prox) return;
    LEIT.prox = agora + 80;

    const ry = rad(G.rotY),
      rx = rad(G.rotX);
    // o cruzamento dos eixos projeta em (sen rotY, cos rotY · sen rotX), em raios
    const nx = Math.sin(ry),
      ny = Math.cos(ry) * Math.sin(rx);
    const az = ((Math.atan2(nx, -ny) * 180) / Math.PI + 360) % 360;
    escreve(LEIT.lat, fmtAng(G.rotX));
    escreve(LEIT.lon, fmtAng(-G.rotY));
    escreve(LEIT.az, String(Math.round(az) % 360).padStart(3, "0") + "°");
    escreve(LEIT.des, String(Math.round(Math.hypot(nx, ny) * 100)) + "%");
    escreve(LEIT.vel, (LEIT.w < 10 ? LEIT.w.toFixed(1) : String(Math.round(LEIT.w))) + "°/s");
  }

  function passoFundo() {
    if (!grad) return;
    const g = S.grad;
    stGrad.infl = g.infl;
    stGrad.reach = g.reach;
    stGrad.scale = g.scale;
    stGrad.warp = g.warp;
    stGrad.contrast = g.contrast;
    stGrad.grain = g.grain;
    stGrad.vig = g.vig;
    stGrad.mov.padrao = MOVID[S.mov.padrao];
    stGrad.mov.amp = S.mov.amp;
    stGrad.mov.respiro = S.mov.respiro;
    stGrad.cores = S.cores.anc;
    stGrad.raios = S.cores.raios;
    stGrad.fundo = S.cores.fundo;
    for (const e of EFEITOS) {
      const f = g.fx[e.chave];
      stGrad.fx[e.chave] = f.on ? f.v : 0;
    }
    grad.resize(g.qual);
    grad.draw(
      stGrad,
      tempo,
      campo,
      campoGiro,
      [pt.x, pt.y],
      [pt.vx, pt.vy],
      (performance.now() - pt.pulso) / 1000,
    );
  }

  // aba escondida não desenha: o rAF já para sozinho na maioria dos navegadores,
  // mas o relógio continuaria correndo e voltaria com um salto de fase
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      cancelAnimationFrame(raf);
      raf = 0;
    } else if (!raf) {
      ultimo = performance.now();
      raf = requestAnimationFrame(quadro);
    }
  });

  /* ---------- painel ----------
     Construído a partir da mesma lista que descreve o estado: cada controle sabe
     ler e escrever um caminho, e devolve um sync() para a interface se refazer
     inteira quando o estado muda por fora (restaurar, atalho, importar). */
  const syncs = [];
  const hud = $("hud");

  const pct = (v) => Math.round(v * 100) + "%";
  const dois = (v) => v.toFixed(2);

  function el(tag, cls, txt) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }

  function secao(titulo) {
    const s = el("section", "grupo");
    s.appendChild(el("span", "lab", titulo));
    $("hudBody").appendChild(s);
    return s;
  }
  function hint(host, txt) {
    const p = el("p", "hint");
    p.innerHTML = txt; // texto nosso, fixo no arquivo — só o <b> das dicas
    host.appendChild(p);
  }

  function faixa(host, o) {
    const row = el("div", "row");
    const lb = el("label", null, o.nome);
    const inp = document.createElement("input");
    inp.type = "range";
    inp.min = o.min;
    inp.max = o.max;
    inp.step = o.step;
    const val = el("span", "val");
    const id = "c_" + o.caminho.replace(/\./g, "_");
    inp.id = id;
    lb.setAttribute("for", id);
    if (o.dica) row.title = o.dica;
    row.append(lb, inp, val);
    host.appendChild(row);

    const fmt = o.fmt || dois;
    inp.addEventListener("input", () => {
      porCaminho(o.caminho, parseFloat(inp.value));
      val.textContent = fmt(caminho(o.caminho));
      if (o.aoMudar) o.aoMudar();
      salvar();
    });
    const sync = () => {
      const v = caminho(o.caminho);
      inp.value = v;
      val.textContent = fmt(v);
    };
    syncs.push(sync);
    sync();
    return row;
  }

  function chips(host, o) {
    const box = el("div", "chips");
    const btns = o.opcoes.map(([v, nome]) => {
      const b = el("button", "chip", nome);
      b.type = "button";
      b.addEventListener("click", () => {
        porCaminho(o.caminho, v);
        if (o.aoMudar) o.aoMudar(v);
        syncs.forEach((f) => f());
        salvar();
      });
      box.appendChild(b);
      return [v, b];
    });
    host.appendChild(box);
    const sync = () => {
      const atual = caminho(o.caminho);
      btns.forEach(([v, b]) => {
        const on = v === atual;
        b.classList.toggle("on", on);
        b.setAttribute("aria-pressed", String(on));
      });
    };
    syncs.push(sync);
    sync();
    return box;
  }

  function interruptor(host, o) {
    const b = el("button", "toggle", o.nome);
    b.type = "button";
    if (o.dica) b.title = o.dica;
    b.addEventListener("click", () => {
      porCaminho(o.caminho, !caminho(o.caminho));
      if (o.aoMudar) o.aoMudar();
      syncs.forEach((f) => f());
      salvar();
    });
    host.appendChild(b);
    const sync = () => {
      const on = !!caminho(o.caminho);
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", String(on));
    };
    syncs.push(sync);
    sync();
    return b;
  }

  /* Linha de cor: a amostra abre o seletor do sistema e o hex aceita o que for
     digitado ou colado — os dois escrevem no mesmo lugar. Enquanto o campo esta
     sob o cursor de texto ele nao e reescrito, senao digitar "#0B1" viraria
     "#00BB11" no meio da palavra. */
  function cor(host, o) {
    const row = el("div", "row cor");
    const pick = document.createElement("input");
    pick.type = "color";
    pick.setAttribute("aria-label", "Cor · " + o.nome);
    const hex = document.createElement("input");
    hex.type = "text";
    hex.className = "hex";
    hex.maxLength = 7;
    hex.spellcheck = false;
    hex.autocomplete = "off";
    hex.setAttribute("aria-label", "Hex · " + o.nome);
    if (o.dica) row.title = o.dica;
    row.append(el("label", null, o.nome), pick, hex);
    host.appendChild(row);

    const ler = () => (o.fundo ? S.cores.fundo : S.cores.anc[o.i]);
    function escrever(v) {
      if (o.fundo) S.cores.fundo = v;
      else S.cores.anc[o.i] = v;
      S.paleta = "custom"; // cor na mao solta a paleta: nenhum chip fica aceso
      aplicarTema();
      syncs.forEach((f) => f());
      salvar();
    }
    pick.addEventListener("input", () => escrever(pick.value.toUpperCase()));
    hex.addEventListener("input", () => {
      const n = normHex(hex.value);
      if (n) escrever(n);
    });
    hex.addEventListener("blur", sync); // desistiu no meio: volta ao que vale
    function sync() {
      const v = ler();
      pick.value = v;
      if (document.activeElement !== hex) hex.value = v;
    }
    syncs.push(sync);
    sync();
  }

  /* Linha de efeito: o interruptor manda no ligado/desligado e o slider na dose.
     Desligado, o slider fica visível mas apagado — a dose que você deixou
     continua lá esperando, em vez de zerar e obrigar a reencontrar o ponto. */
  function linhaEfeito(host, e) {
    const row = el("div", "fx");
    row.title = e.dica;
    const b = el("button", "fx-tog");
    b.type = "button";
    b.append(el("i"), el("span", null, e.nome));
    const inp = document.createElement("input");
    inp.type = "range";
    inp.min = 0;
    inp.max = 1;
    inp.step = 0.01;
    inp.setAttribute("aria-label", "Intensidade · " + e.nome);
    const val = el("span", "val");
    row.append(b, inp, val);
    host.appendChild(row);

    const base = "grad.fx." + e.chave;
    b.addEventListener("click", () => {
      porCaminho(base + ".on", !caminho(base + ".on"));
      sync();
      salvar();
    });
    inp.addEventListener("input", () => {
      porCaminho(base + ".v", parseFloat(inp.value));
      // mexer na dose de um efeito desligado liga ele: é o que a mão quis dizer
      if (!caminho(base + ".on")) porCaminho(base + ".on", true);
      sync();
      salvar();
    });
    function sync() {
      const f = caminho(base);
      b.classList.toggle("on", f.on);
      b.setAttribute("aria-pressed", String(f.on));
      row.classList.toggle("off", !f.on);
      inp.value = f.v;
      val.textContent = pct(f.v);
    }
    syncs.push(sync);
    sync();
  }

  /* A paleta manda na tinta da marca, na cor do texto e no véu — trocar de
     paleta sem isso deixaria texto azul-escuro em cima de fundo azul-escuro. A
     tinta em "auto" é a que a paleta pede; escolher uma cor à mão passa a mandar. */
  /* Carregar uma paleta e copiar as cores dela para o estado. Dali em diante o
     estado e que manda, e o chip fica so como lembranca de onde comecou. */
  function carregarPaleta(k) {
    const pal = PALETAS[k];
    if (!pal) return;
    S.cores.anc = pal.cores.slice();
    S.cores.raios = pal.raios.slice();
    S.cores.fundo = pal.fundo;
    aplicarTema();
  }

  /* Tema derivado das cores, e nao guardado junto com elas: assim uma paleta
     montada a mao no painel continua legivel sem exigir que alguem escolha a cor
     do texto tambem. O peso e do meio da tela, onde a marca pousa — o clarao
     central conta mais que os cantos. */
  function aplicarTema() {
    const c = S.cores;
    const volta =
      (lumin(c.anc[0]) + lumin(c.anc[1]) + lumin(c.anc[2]) + lumin(c.anc[3])) / 4;
    const clara = 0.6 * lumin(c.anc[4]) + 0.4 * volta >= 0.5;
    const r = document.documentElement.style;
    r.setProperty("--texto", clara ? "#0B1F4D" : "#E9EFFB");
    r.setProperty("--veu", clara ? "0.2" : "0");
    r.setProperty("--css-a", c.anc[0]); // clarao de cima
    r.setProperty("--css-b", c.anc[2]); // cor de forca
    r.setProperty("--css-c", c.fundo);
    G.ink =
      S.globo.tinta === "auto" ? (clara ? "#0B1F4D" : "#DCEBFF") : S.globo.tinta;
    r.setProperty("--tinta", G.ink); // o logotipo pinta por currentColor
    document.body.classList.toggle("escuro", !clara);
  }

  /* O logotipo entra e sai do lockup, e a largura da peça muda com ele: quem
     mede o espaço é o ajustarLockup, então mostrar ou esconder pede uma medida
     nova na mesma hora. */
  function aplicarLettering() {
    lockup.classList.toggle("sem-letra", !S.globo.lettering);
    aplicarTamanho();
  }

  function aplicarTamanho() {
    /* O lockup mede cerca de 4,8 globos de ponta a ponta. Deixar o tamanho só em
       vmin estoura a linha em tela larga e baixa, então a largura entra como
       teto: o globo nunca passa de 14vw e o logotipo cabe sempre. */
    /* Só o símbolo cabe muito maior do que o lockup inteiro: o teto de largura
       existe por causa do logotipo ao lado, então some junto com ele. */
    const teto = !S.globo.lettering
      ? "46vmin"
      : innerWidth < 780
        ? "40vw"
        : "16vw";
    document.documentElement.style.setProperty(
      "--globo",
      "min(" + S.globo.tam + "vmin, " + teto + ")",
    );
    // o tamanho muda a caixa da marca, e é dela que sai o alvo do cursor
    requestAnimationFrame(ajustarLockup);
  }

  function montarPainel() {
    // ---- cursor
    const s1 = secao("Cursor");
    faixa(s1, {
      nome: "Influência",
      caminho: "grad.infl",
      min: 0,
      max: 2,
      step: 0.01,
      fmt: pct,
      dica: "Multiplica todos os efeitos de uma vez. Em 0 o fundo ignora o mouse e só respira sozinho.",
    });
    faixa(s1, {
      nome: "Alcance",
      caminho: "grad.reach",
      min: 0.15,
      max: 2.5,
      step: 0.01,
      dica: "Raio da zona que o cursor mexe, em fração da tela.",
    });
    faixa(s1, {
      nome: "Inércia",
      caminho: "grad.suav",
      min: 0.02,
      max: 0.5,
      step: 0.01,
      dica: "O quanto o fundo persegue o ponteiro. Baixo = arrasta atrás; alto = cola no cursor.",
    });
    hint(
      s1,
      "A influência é o botão mestre: ela pesa em cima da dose de cada efeito, então dá para calibrar os efeitos uma vez e depois só abrir ou fechar o conjunto.",
    );

    // ---- efeitos
    const s2 = secao("Efeitos do cursor");
    EFEITOS.forEach((e) => linhaEfeito(s2, e));
    hint(
      s2,
      "Nenhum deles pinta por cima do fundo: todos deformam a coordenada antes da mistura das cores — por isso podem se somar sem sujar. <b>Brilho</b> é a exceção, e é o único que mexe na luz.",
    );

    // ---- cores
    const sc = secao("Cores");
    chips(sc, {
      caminho: "paleta",
      opcoes: Object.keys(PALETAS).map((k) => [k, PALETAS[k].nome]),
      aoMudar: carregarPaleta,
    });
    CORES.forEach((nome, i) =>
      cor(sc, { nome, i, dica: "Âncora " + (i + 1) + " do campo · " + nome }),
    );
    cor(sc, {
      nome: "Fundo",
      fundo: true,
      dica: "Piso do campo e cor da vinheta — aparece onde nenhuma âncora alcança.",
    });
    hint(
      sc,
      "As cinco primeiras são a composição do campo, cada uma na posição que o nome diz; a do <b>centro</b> é o clarão que passa atrás da marca. Mexer numa cor solta a paleta — os chips voltam a valer como ponto de partida. A tinta da marca e a cor do texto acompanham sozinhas, pela luminância do que você escolher.",
    );

    // ---- movimento do fundo
    const sm = secao("Movimento do fundo");
    chips(sm, { caminho: "mov.padrao", opcoes: MOVFUNDO });
    faixa(sm, {
      nome: "Velocidade",
      caminho: "mov.vel",
      min: 0,
      max: 3,
      step: 0.05,
      dica: "Relógio do campo. Em 0 o fundo congela e só o cursor mexe nele.",
    });
    faixa(sm, {
      nome: "Amplitude",
      caminho: "mov.amp",
      min: 0,
      max: 0.9,
      step: 0.01,
      dica: "O quanto cada âncora se afasta da própria casa. Em 0 a composição fica presa, mas giro e respiro continuam.",
    });
    faixa(sm, {
      nome: "Giro",
      caminho: "mov.giro",
      min: -1,
      max: 1,
      step: 0.01,
      dica: "Rotação lenta da composição inteira. Negativo gira para o outro lado.",
    });
    faixa(sm, {
      nome: "Respiro",
      caminho: "mov.respiro",
      min: 0,
      max: 1,
      step: 0.01,
      fmt: pct,
      dica: "Pulso de escala do campo, como uma respiração.",
    });
    hint(
      sm,
      "É o que o fundo faz sozinho, sem ninguém no mouse — o cursor entra por cima disso. <b>Velocidade</b> manda no relógio; <b>amplitude</b>, no caminho. Zerar as duas deixa o fundo parado como uma arte fixa.",
    );

    // ---- gradiente
    const s3 = secao("Gradiente");
    faixa(s3, {
      nome: "Escala",
      caminho: "grad.scale",
      min: 0.4,
      max: 2.5,
      step: 0.01,
      dica: "Tamanho das manchas de cor.",
    });
    faixa(s3, {
      nome: "Deformação",
      caminho: "grad.warp",
      min: 0,
      max: 1.5,
      step: 0.01,
      dica: "Quanto o ruído amassa o campo. Em 0 as manchas ficam redondas demais.",
    });
    faixa(s3, {
      nome: "Contraste",
      caminho: "grad.contrast",
      min: 0.5,
      max: 1.8,
      step: 0.01,
    });
    faixa(s3, {
      nome: "Grão",
      caminho: "grad.grain",
      min: 0,
      max: 1,
      step: 0.01,
      fmt: pct,
    });
    faixa(s3, {
      nome: "Vinheta",
      caminho: "grad.vig",
      min: 0,
      max: 1.5,
      step: 0.01,
    });
    faixa(s3, {
      nome: "Resolução",
      caminho: "grad.qual",
      min: 0.35,
      max: 1.5,
      step: 0.05,
      fmt: pct,
      dica: "O fundo é liso, então roda abaixo da resolução da tela e é esticado. É o maior botão de desempenho da página.",
    });
    hint(
      s3,
      "Um pouco de grão não é enfeite: sem ele um gradiente desta suavidade sai em faixas na maioria das telas.",
    );

    // ---- globo
    const s4 = secao("Globo");
    faixa(s4, {
      nome: "Influência",
      caminho: "globo.infl",
      min: 0,
      max: 2,
      step: 0.01,
      fmt: pct,
      dica: "Amplitude do desvio que o cursor impõe sobre a pose de repouso da marca.",
    });
    faixa(s4, {
      nome: "Inércia",
      caminho: "globo.inercia",
      min: 0.02,
      max: 0.6,
      step: 0.01,
    });
    faixa(s4, {
      nome: "Tamanho",
      caminho: "globo.tam",
      min: 12,
      max: 46,
      step: 0.5,
      fmt: (v) => v + "vmin",
      aoMudar: aplicarTamanho,
    });
    faixa(s4, {
      nome: "Traço",
      caminho: "globo.stroke",
      min: 2,
      max: 40,
      step: 0.5,
      fmt: (v) => String(v),
    });
    faixa(s4, {
      nome: "Abertura",
      caminho: "globo.aperture",
      min: 0,
      max: 1,
      step: 0.01,
      dica: "0 fecha o globo; alta abre o terminal e a marca lê como “e”.",
    });
    interruptor(s4, {
      nome: "Mostrar logotipo",
      caminho: "globo.lettering",
      dica: "O símbolo sozinho é o padrão; ligado, entra o logotipo ao lado.",
      aoMudar: aplicarLettering,
    });
    hint(
      s4,
      "A <b>influência</b> vira o globo na direção do cursor com o mesmo deslocamento em qualquer sentido — o gesto desenha um círculo, não uma elipse.",
    );

    const s6 = secao("Tinta da marca");
    chips(s6, {
      caminho: "globo.tinta",
      opcoes: [["auto", "Da paleta"]].concat(TINTAS.map(([h, n]) => [h, n])),
      aoMudar: aplicarTema,
    });
    hint(
      s6,
      "<b>H</b> esconde o painel · <b>M</b> minimiza · a barra de título arrasta · clicar na página dá um estouro nas ondas.",
    );

    // ---- presets: por último, porque guardam tudo que está acima
    montarPresets(secao("Presets"));
  }

  /* ---------- presets ----------
     Um preset guarda o desenho inteiro — paleta, cores, movimento do fundo,
     gradiente e globo — e deixa de fora a janela do painel: onde a janela está
     é do ambiente de quem ajusta, não da peça. Mora no localStorage, que é por
     navegador; daí exportar e importar para levar a peça para outra máquina. */
  const PRESET_KEY = "everblue-landing-presets";
  let presets = [];

  function lerPresets() {
    try {
      const v = JSON.parse(localStorage.getItem(PRESET_KEY));
      presets = Array.isArray(v) ? v : [];
    } catch (e) {
      presets = [];
    }
  }
  function gravarPresets() {
    try {
      localStorage.setItem(PRESET_KEY, JSON.stringify(presets));
    } catch (e) {
      aviso("O navegador não deixou gravar — modo privado ou espaço cheio.");
    }
  }
  const desenhoAtual = () =>
    clone({
      paleta: S.paleta,
      cores: S.cores,
      mov: S.mov,
      grad: S.grad,
      globo: S.globo,
    });

  /* Aplicar passa pelo mesmo fundir do estado salvo: um preset é arquivo de
     fora igual, e ganha a mesma desconfiança — o padrão manda na forma, o
     preset só nos valores que couberem. */
  function aplicarDesenho(e) {
    if (!e || typeof e !== "object") return false;
    if (typeof e.paleta === "string") S.paleta = e.paleta;
    fundir(
      { cores: S.cores, mov: S.mov, grad: S.grad, globo: S.globo },
      e,
    );
    sanear();
    aplicarTema();
    aplicarTamanho();
    syncs.forEach((f) => f());
    salvar();
    return true;
  }

  function montarPresets(host) {
    const box = el("div", "presets");
    const campo = el("div", "campo");
    const nome = document.createElement("input");
    nome.type = "text";
    nome.placeholder = "nome do preset";
    nome.maxLength = 40;
    nome.autocomplete = "off";
    nome.setAttribute("aria-label", "Nome do preset");
    const btSalvar = el("button", "pe-btn", "Salvar");
    btSalvar.type = "button";
    campo.append(nome, btSalvar);

    const par = el("div", "campo");
    const btExp = el("button", "pe-btn", "↓ Exportar");
    btExp.type = "button";
    const btImp = el("button", "pe-btn", "↑ Importar");
    btImp.type = "button";
    par.append(btExp, btImp);

    // o seletor de arquivo é do sistema: fica escondido e é acionado pelo botão,
    // que assim segue a mesma linguagem visual dos outros
    const arq = document.createElement("input");
    arq.type = "file";
    arq.accept = "application/json,.json";
    arq.className = "hide";

    host.append(box, campo, par, arq);
    hint(
      host,
      "Guarda cores, movimento, gradiente e globo — a janela do painel fica de fora. Os presets vivem neste navegador; exporte para levar para outra máquina. Salvar com um nome que já existe substitui aquele.",
    );

    function desenhar() {
      box.textContent = "";
      if (!presets.length) {
        const p = el("p", "hint", "Nenhum preset salvo ainda.");
        p.style.margin = "0";
        box.appendChild(p);
        return;
      }
      presets.forEach((pr, i) => {
        const b = el("button", "chip");
        b.type = "button";
        // nome entra como texto, nunca como markup: ele vem de arquivo de fora
        b.appendChild(document.createTextNode(pr.nome));
        const x = el("span", "x", "×");
        x.title = "Excluir";
        b.appendChild(x);
        b.addEventListener("click", (ev) => {
          if (ev.target === x) {
            presets.splice(i, 1);
            gravarPresets();
            desenhar();
            aviso("“" + pr.nome + "” excluído.");
          } else if (aplicarDesenho(pr.estado)) {
            aviso("“" + pr.nome + "” aplicado.");
          }
        });
        box.appendChild(b);
      });
    }

    function guardar() {
      const n = nome.value.trim() || "preset " + (presets.length + 1);
      const i = presets.findIndex((p) => p.nome === n);
      const item = { nome: n, estado: desenhoAtual() };
      if (i >= 0) presets[i] = item;
      else presets.push(item);
      gravarPresets();
      desenhar();
      nome.value = "";
      aviso("“" + n + "” salvo.");
    }
    btSalvar.addEventListener("click", guardar);
    nome.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") guardar();
    });

    btExp.addEventListener("click", () => {
      if (!presets.length) return aviso("Nada para exportar.");
      const txt = JSON.stringify(
        { everblue: 1, tipo: "landing", presets },
        null,
        2,
      );
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([txt], { type: "application/json" }));
      a.download = "everblue-landing-presets.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      aviso(presets.length + (presets.length > 1 ? " presets salvos em arquivo." : " preset salvo em arquivo."));
    });

    btImp.addEventListener("click", () => arq.click());
    arq.addEventListener("change", () => {
      const f = arq.files && arq.files[0];
      if (!f) return;
      const leitor = new FileReader();
      leitor.onload = () => {
        let d = null;
        try {
          d = JSON.parse(leitor.result);
        } catch (e) {
          /* cai no aviso abaixo */
        }
        /* O selo "tipo" existe porque o gerador de globo exporta um arquivo do
           mesmo feitio: sem ele, um preset de marca entraria aqui como cena e
           sairia um estado meio aplicado, que é pior que recusar. */
        const lista = d && Array.isArray(d.presets) ? d.presets : null;
        if (!lista || d.tipo !== "landing") {
          aviso("Este arquivo não é de presets da landing.");
          arq.value = "";
          return;
        }
        let n = 0;
        for (const pr of lista) {
          if (!pr || typeof pr.nome !== "string" || !pr.estado) continue;
          const item = { nome: pr.nome.slice(0, 40), estado: pr.estado };
          const i = presets.findIndex((p) => p.nome === item.nome);
          if (i >= 0) presets[i] = item;
          else presets.push(item);
          n++;
        }
        gravarPresets();
        desenhar();
        arq.value = "";
        aviso(
          n
            ? n + (n > 1 ? " presets importados." : " preset importado.")
            : "Nenhum preset válido no arquivo.",
        );
      };
      leitor.readAsText(f);
    });

    lerPresets();
    desenhar();
  }

  /* ---------- rodapé do painel ---------- */
  function montarRodape() {
    $("hudCopiar").addEventListener("click", async () => {
      const txt = JSON.stringify({ everblue: 1, landing: S }, null, 2);
      try {
        await navigator.clipboard.writeText(txt);
        aviso("Estado copiado.");
      } catch (e) {
        // file:// sem permissão de área de transferência: mostra para copiar na mão
        console.log(txt);
        aviso("Sem acesso à área de transferência — saiu no console.");
      }
    });
    $("hudReset").addEventListener("click", () => {
      // a posição do painel é a única coisa que sobrevive: mexer nos valores não
      // é motivo para a janela pular de canto embaixo da mão de quem clicou
      fundir(S, clone(PADRAO));
      aplicarTema();
      aplicarTamanho();
      syncs.forEach((f) => f());
      salvar();
      aviso("Valores restaurados.");
    });
  }
  let avisoT = 0;
  function aviso(txt) {
    const n = $("hudNota");
    n.textContent = txt;
    clearTimeout(avisoT);
    avisoT = setTimeout(() => (n.textContent = ""), 2600);
  }

  /* ---------- janela do painel: minimizar, esconder, arrastar ---------- */
  function estadoHud() {
    hud.classList.toggle("min", S.hud.min);
    hud.classList.toggle("oculto", !S.hud.aberto);
    $("hudMin").setAttribute("aria-expanded", String(!S.hud.min));
    $("hudMin").textContent = S.hud.min ? "+" : "–";
    $("hudAbrir").classList.toggle("on", !S.hud.aberto);
    if (S.hud.x != null) {
      hud.style.left = S.hud.x + "px";
      hud.style.top = S.hud.y + "px";
      hud.style.right = "auto";
    }
    // arrastando, a conta sairia a cada quadro do gesto: espera soltar
    if (!hud.classList.contains("arrastando")) ajustarLockup();
  }

  function montarJanela() {
    $("hudMin").addEventListener("click", () => {
      S.hud.min = !S.hud.min;
      estadoHud();
      salvar();
    });
    $("hudFechar").addEventListener("click", () => {
      S.hud.aberto = false;
      estadoHud();
      salvar();
    });
    $("hudAbrir").addEventListener("click", () => {
      S.hud.aberto = true;
      estadoHud();
      salvar();
    });

    // arrastar pela barra de título; o painel fica preso dentro da janela para
    // não sumir num canto e virar um controle que não dá para trazer de volta
    const barra = $("hudTop");
    let a = null;
    barra.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button")) return;
      const r = hud.getBoundingClientRect();
      a = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      barra.setPointerCapture(e.pointerId);
      hud.classList.add("arrastando");
    });
    barra.addEventListener("pointermove", (e) => {
      if (!a) return;
      const r = hud.getBoundingClientRect();
      S.hud.x = clamp(e.clientX - a.dx, 8, innerWidth - r.width - 8);
      S.hud.y = clamp(e.clientY - a.dy, 8, innerHeight - 44);
      estadoHud();
    });
    const solta = () => {
      if (!a) return;
      a = null;
      hud.classList.remove("arrastando");
      ajustarLockup();
      salvar();
    };
    barra.addEventListener("pointerup", solta);
    barra.addEventListener("pointercancel", solta);
  }

  /* ---------- atalhos ---------- */
  addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const alvo = e.target;
    if (alvo && /input|textarea|select/i.test(alvo.tagName)) return;
    const k = e.key.toLowerCase();
    if (k === "h") {
      S.hud.aberto = !S.hud.aberto;
      estadoHud();
      salvar();
    } else if (k === "m") {
      S.hud.min = !S.hud.min;
      estadoHud();
      salvar();
    }
  });

  /* ---------- partida ---------- */
  aplicarTema();
  aplicarLettering(); // chama aplicarTamanho() por dentro
  montarPainel();
  montarRodape();
  montarJanela();
  estadoHud();
  medir();
  ajustarLockup();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(ajustarLockup);
  pintar(G);
  if (grad) grad.resize(S.grad.qual);
  raf = requestAnimationFrame(quadro);

  // o medidor de fps é do painel, não do laço: uma leitura por segundo basta e
  // escrever no DOM a 60 Hz seria mais caro que o próprio fundo
  setInterval(() => {
    if (!document.hidden) $("hudFps").textContent = Math.round(fps) + " fps";
  }, 1000);

  // a marca só aparece depois do primeiro quadro pronto, para não piscar o SVG
  // sem estilo enquanto o WebGL ainda está compilando o shader
  requestAnimationFrame(() => document.body.classList.add("pronto"));
})();
