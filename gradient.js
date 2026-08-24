/* Everblue · fundo de gradiente
   Um mesh gradient em WebGL: cinco âncoras de cor pairando devagar, misturadas
   por peso gaussiano e amassadas por um domain warp de ruído. O cursor não pinta
   nada — ele deforma o campo antes da mistura, então todo efeito sai como
   deslocamento de coordenada, não como mancha colada por cima.

   O laço de quadro é de fora (landing.js): um rAF só para o fundo e o globo. */
(function (global) {
  const VERT = `
attribute vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

  const FRAG = `
precision highp float;

uniform vec2  uRes;
uniform float uTime;
uniform vec2  uMouse;     // espaço de tela, lado menor = -1..1
uniform vec2  uVel;       // velocidade do ponteiro, suavizada
uniform float uPulseT;    // segundos desde o último clique
uniform float uField;     // tempo do campo, já integrado com a velocidade

/* movimento contínuo do fundo, o que ele faz sozinho sem ninguém no mouse */
uniform float uMov;       // padrão do caminho de cada âncora
uniform float uAmp;       // o quanto ela se afasta da própria casa
uniform float uGiro;      // ângulo do campo inteiro, já integrado
uniform float uResp;      // respiro: pulso de escala do campo

uniform float uInfl;      // influência mestra do cursor
uniform float uReach;     // alcance do cursor, em unidades de tela
uniform float uScale, uWarp, uContrast, uGrain, uVig;

uniform float uAttract, uRepel, uSwirl, uRipple, uGlow, uParallax, uTurb;

uniform vec3 uC0, uC1, uC2, uC3, uC4;
uniform vec3 uFundo;      // cor funda da paleta: piso do campo e vinheta
uniform float uR0, uR1, uR2, uR3, uR4;

/* Ruído de valor + fbm. Três oitavas bastam: o campo já é suave por construção,
   o ruído só serve para tirar a simetria das bolhas.

   O hash não usa sin(). O sin(dot(p, k)) clássico depende de a precisão aguentar
   um argumento enorme, e a coordenada de pixel de uma tela cheia já é grande
   demais: o seno satura em degraus, pedaços inteiros passam a devolver o mesmo
   valor e o ruído vira uma grade de retângulos escorrendo na diagonal — pior no
   grão, que é alimentado direto com gl_FragCoord. Este aqui é só fract e
   produto, então se comporta igual perto da origem e a mil pixels dela. */
float hash(vec2 p){
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p){
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++){
    s += a * noise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return s;
}

// cor sRGB → linear e volta: misturar em linear evita o meio-tom lavado que
// aparece ao interpolar azul forte com azul claro direto no espaço da tela
vec3 lin(vec3 c){ return c * c; }
vec3 srgb(vec3 c){ return sqrt(max(c, 0.0)); }

/* Âncora: uma casa fixa mais um passeio lento em volta dela. O padrão escolhe o
   caminho, a amplitude diz o quanto ela se afasta.

   Amplitude 0 congela a composição sem parar o resto — o giro e o respiro
   continuam valendo — e é por isso que ela é um controle à parte da velocidade:
   velocidade 0 para o tempo do campo inteiro, amplitude 0 só prende as âncoras. */
vec2 anc(vec2 home, float ph, float sp, float t){
  float a = t * sp + ph;
  vec2 d;
  if (uMov < 0.5) d = vec2(0.0);                                    // parado
  else if (uMov < 1.5) d = vec2(sin(a), cos(t * sp * 0.83 + ph * 1.7)); // deriva
  else if (uMov < 2.5) d = vec2(cos(a), sin(a));                    // órbita
  else if (uMov < 3.5) d = vec2(sin(a), sin(2.0 * a) * 0.3);        // vaivém
  else d = vec2(sin(a * 0.7), cos(a * 0.7)) * (0.45 + 0.55 * sin(t * 0.4 + ph)); // maré
  return home + d * uAmp;
}
float peso(vec2 f, vec2 a, float r){
  vec2 d = f - a;
  return exp(-dot(d, d) / (r * r));
}
vec2 rot(vec2 v, float a){
  float c = cos(a), s = sin(a);
  return vec2(v.x * c - v.y * s, v.x * s + v.y * c);
}

void main(){
  float mn = min(uRes.x, uRes.y);
  float asp = uRes.x / uRes.y;
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / mn * 2.0;
  /* O tempo do campo chega integrado de fora, não multiplicado aqui: mexer no
     slider de velocidade só muda o passo daqui para frente, em vez de reescalar
     todo o tempo passado e fazer o gradiente saltar de fase. */
  float t = uField;

  /* ---- efeitos do cursor, em espaço de tela ----
     Todos deslocam a coordenada de amostragem; a queda gaussiana em torno do
     ponteiro é a mesma para todos, então "alcance" quer dizer a mesma coisa
     seja qual for o efeito ligado. */
  vec2 q = p;
  vec2 d = p - uMouse;
  float dist = length(d);
  float fall = exp(-(dist * dist) / (uReach * uReach));
  vec2 dir = d / max(dist, 1e-4);
  float vel = min(length(uVel), 3.0);

  // paralaxe: o campo inteiro escorrega com o ponteiro, sem foco local
  q -= uMouse * uParallax * 0.35 * uInfl;

  // atrair: amostrar mais perto do ponteiro amplia o que está ali — a cor se
  // junta em volta dele, como uma lente
  q -= d * fall * uAttract * 0.9 * uInfl;

  // repelir: o inverso, empurrando a cor para fora e abrindo um vazio
  q += d * fall * uRepel * 0.7 * uInfl;

  // redemoinho: gira o campo em torno do ponteiro, e gira mais quando o mouse
  // corre — a velocidade entra como torque
  q = uMouse + rot(q - uMouse, fall * uSwirl * 1.6 * uInfl * (0.35 + vel));

  /* ondas: um trem de cristas concentrico saindo do ponteiro, mais um estouro
     por clique — o clique não cria outro sistema de ondas, só empurra a mesma
     crista para fora com amplitude que decai. */
  float ondaC = sin(dist * 16.0 - uTime * 3.2);
  float idade = uPulseT;
  float anelR = idade * 1.30;
  float estouro = exp(-idade * 1.7) * exp(-pow((dist - anelR) * 3.2, 2.0));
  q += dir * (ondaC * fall * 0.035 + estouro * 0.10) * uRipple * uInfl;

  /* ---- campo de cor ---- */
  vec2 f = q / uScale;

  /* Giro e respiro valem para a composição inteira, e não para o caminho de cada
     âncora: giram e inflam o campo como quem move a câmera, não como quem
     empurra as manchas. O ângulo chega integrado de fora pelo mesmo motivo do
     tempo — mexer no slider muda o passo daqui para frente, não a fase toda. */
  f = rot(f, uGiro);
  f /= 1.0 + uResp * 0.20 * sin(t * 0.6);

  // domain warp: dois campos de ruído desencontrados no tempo. A velocidade do
  // ponteiro entra aqui como turbulência, então gesto rápido embaralha o fundo
  float w = uWarp + vel * uTurb * 0.5 * uInfl;
  vec2 warp = vec2(
    fbm(f * 1.10 + vec2(0.0, t * 0.11)),
    fbm(f * 1.10 + vec2(4.7, 1.3) - t * 0.09)
  ) - 0.5;
  f += warp * w;

  /* As âncoras moram numa composição fixa — clara em cima à esquerda, elétrica
     embaixo à esquerda, funda embaixo à direita, clarão no meio — e a casa de
     cada uma é esticada pela proporção da tela. Sem isso, numa tela larga elas
     ficam todas no terço do meio e as laterais viram cor chapada. */
  vec2 esp = vec2(max(asp, 1.0), max(1.0 / asp, 1.0));
  vec2 a0 = anc(vec2(-0.62,  0.58) * esp, 0.0, 0.21 , t);
  vec2 a1 = anc(vec2( 0.74,  0.30) * esp, 1.7, 0.17 , t);
  vec2 a2 = anc(vec2(-0.80, -0.52) * esp, 3.1, 0.245, t);
  vec2 a3 = anc(vec2( 0.66, -0.74) * esp, 4.6, 0.19 , t);
  vec2 a4 = anc(vec2( 0.02,  0.06) * esp, 2.2, 0.275, t);

  float w0 = peso(f, a0, uR0);
  float w1 = peso(f, a1, uR1);
  float w2 = peso(f, a2, uR2);
  float w3 = peso(f, a3, uR3);
  float w4 = peso(f, a4, uR4);

  vec3 acc = lin(uC0) * w0 + lin(uC1) * w1 + lin(uC2) * w2
           + lin(uC3) * w3 + lin(uC4) * w4;
  float sum = w0 + w1 + w2 + w3 + w4;

  /* Piso de cor: longe de todas as âncoras a soma vai a zero e a divisão
     explodiria. O piso é a cor funda da paleta, com peso pequeno — é o fundo do
     fundo, e some onde qualquer âncora tem algo a dizer. */
  acc += lin(uFundo) * 0.05;
  sum += 0.05;

  vec3 col = acc / sum;

  // brilho: o único efeito que mexe na cor e não na coordenada — levanta a
  // exposição em volta do cursor, como se ele fosse uma fonte de luz
  col = mix(col, lin(uC4), fall * uGlow * 0.55 * uInfl);

  col = srgb(col);

  // contraste em torno do meio, para o gradiente poder ficar mais ou menos seco
  col = clamp((col - 0.5) * uContrast + 0.5, 0.0, 1.0);

  // vinheta: escurece as bordas puxando para a cor mais funda da paleta
  float r = length((gl_FragCoord.xy - 0.5 * uRes) / mn * 2.0);
  col = mix(col, col * 0.55 + uFundo * 0.18, clamp(r * r * uVig * 0.30, 0.0, 1.0));

  /* Grão + dither. O dither é fixo e mínimo (meio nível de 8 bits): sem ele um
     gradiente desta suavidade sai em faixas em qualquer tela. O grão é o mesmo
     ruído, animado e a gosto do usuário. */
  float g = hash(gl_FragCoord.xy + vec2(fract(uTime * 13.0) * 137.0,
                                        fract(uTime * 7.0) * 271.0)) - 0.5;
  col += g * (uGrain * 0.10 + 0.0022);

  gl_FragColor = vec4(col, 1.0);
}`;

  function compile(gl, tipo, src) {
    const s = gl.createShader(tipo);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn("[everblue] shader:", gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      return null;
    }
    return s;
  }

  const hexRGB = (hex) => {
    const n = parseInt(String(hex).replace("#", ""), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  };

  /* Cria o renderizador. Devolve null quando não há WebGL — quem chama cai no
     gradiente CSS que já está pintado atrás do canvas, e a página continua de pé. */
  function create(canvas) {
    const opts = {
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false,
    };
    const gl =
      canvas.getContext("webgl", opts) ||
      canvas.getContext("experimental-webgl", opts);
    if (!gl) return null;

    const vs = compile(gl, gl.VERTEX_SHADER, VERT),
      fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return null;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.bindAttribLocation(prog, 0, "aPos");
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn("[everblue] link:", gl.getProgramInfoLog(prog));
      return null;
    }
    gl.useProgram(prog);

    // um triângulo só cobrindo a tela: menos vértices e sem costura na diagonal
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const U = {};
    const nomes = [
      "uRes", "uTime", "uField", "uMouse", "uVel", "uPulseT",
      "uMov", "uAmp", "uGiro", "uResp",
      "uInfl", "uReach", "uScale", "uWarp", "uContrast", "uGrain", "uVig",
      "uAttract", "uRepel", "uSwirl", "uRipple", "uGlow", "uParallax", "uTurb",
      "uC0", "uC1", "uC2", "uC3", "uC4", "uFundo",
      "uR0", "uR1", "uR2", "uR3", "uR4",
    ];
    for (const n of nomes) U[n] = gl.getUniformLocation(prog, n);

    let W = 0,
      H = 0,
      qual = 1;

    /* Sem tamanho forçado, o canvas é renderizado abaixo da tela e esticado pelo
       CSS — o gradiente é liso por natureza e não precisa de pixel físico, e essa
       é de longe a maior alavanca de desempenho da página. A gravação passa o
       tamanho de saída e a qualidade sai da conta: ali o que vale é o pixel do
       arquivo, não o da tela. */
    function resize(qualidade, forcaW, forcaH) {
      if (qualidade != null) qual = qualidade;
      const w = forcaW
        ? Math.max(2, Math.round(forcaW))
        : Math.max(2, Math.round(canvas.clientWidth * qual));
      const h = forcaH
        ? Math.max(2, Math.round(forcaH))
        : Math.max(2, Math.round(canvas.clientHeight * qual));
      if (w === W && h === H) return;
      W = canvas.width = w;
      H = canvas.height = h;
      gl.viewport(0, 0, W, H);
    }

    function draw(st, tempo, campo, giro, mouse, vel, pulseT) {
      gl.uniform2f(U.uRes, W, H);
      gl.uniform1f(U.uTime, tempo);
      gl.uniform1f(U.uField, campo);
      gl.uniform1f(U.uGiro, giro);
      gl.uniform1f(U.uMov, st.mov.padrao);
      gl.uniform1f(U.uAmp, st.mov.amp);
      gl.uniform1f(U.uResp, st.mov.respiro);
      gl.uniform2f(U.uMouse, mouse[0], mouse[1]);
      gl.uniform2f(U.uVel, vel[0], vel[1]);
      gl.uniform1f(U.uPulseT, pulseT);

      gl.uniform1f(U.uInfl, st.infl);
      gl.uniform1f(U.uReach, st.reach);
      gl.uniform1f(U.uScale, st.scale);
      gl.uniform1f(U.uWarp, st.warp);
      gl.uniform1f(U.uContrast, st.contrast);
      gl.uniform1f(U.uGrain, st.grain);
      gl.uniform1f(U.uVig, st.vig);

      gl.uniform1f(U.uAttract, st.fx.atrair);
      gl.uniform1f(U.uRepel, st.fx.repelir);
      gl.uniform1f(U.uSwirl, st.fx.redemoinho);
      gl.uniform1f(U.uRipple, st.fx.ondas);
      gl.uniform1f(U.uGlow, st.fx.brilho);
      gl.uniform1f(U.uParallax, st.fx.paralaxe);
      gl.uniform1f(U.uTurb, st.fx.turbulencia);

      const c = st.cores,
        r = st.raios;
      gl.uniform3fv(U.uC0, hexRGB(c[0]));
      gl.uniform3fv(U.uC1, hexRGB(c[1]));
      gl.uniform3fv(U.uC2, hexRGB(c[2]));
      gl.uniform3fv(U.uC3, hexRGB(c[3]));
      gl.uniform3fv(U.uC4, hexRGB(c[4]));
      gl.uniform3fv(U.uFundo, hexRGB(st.fundo));
      gl.uniform1f(U.uR0, r[0]);
      gl.uniform1f(U.uR1, r[1]);
      gl.uniform1f(U.uR2, r[2]);
      gl.uniform1f(U.uR3, r[3]);
      gl.uniform1f(U.uR4, r[4]);

      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    return { gl, resize, draw };
  }

  global.EBGradient = { create, hexRGB };
})(window);
