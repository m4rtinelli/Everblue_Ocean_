/* Everblue · núcleo do globo
   Geometria portada do gerador (pgm/Globe/everblue-globe.js), sem nada de DOM:
   projeta a esfera, corta as linhas no horizonte e devolve os "d" dos caminhos.
   Quem manda no formato da marca continua sendo o gerador — aqui é só o desenho,
   para que a landing não invente uma segunda versão do logo.

   Script clássico, não módulo: a página abre direto do disco (file://). */
(function (global) {
  const deg = (d) => (d * Math.PI) / 180;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  /* A geometria é sempre montada em raio 200; tamanho é escala do grupo, nunca
     raio novo — assim o traço encolhe junto e a marca muda de tamanho, não de peso. */
  const R = 200;

  function project(lat, lon, rotY, rotX, R) {
    const la = deg(lat),
      lo = deg(lon);
    const x = Math.cos(la) * Math.sin(lo),
      y = Math.sin(la),
      z = Math.cos(la) * Math.cos(lo);
    const x1 = x * Math.cos(rotY) + z * Math.sin(rotY);
    const z1 = -x * Math.sin(rotY) + z * Math.cos(rotY);
    const y2 = y * Math.cos(rotX) - z1 * Math.sin(rotX);
    const z2 = y * Math.sin(rotX) + z1 * Math.cos(rotX);
    return { x: x1 * R, y: -y2 * R, z: z2 };
  }

  /* Um anel fecha com Z, não repetindo o primeiro ponto: repetido, a costura vira
     duas pontas soltas em cima uma da outra em vez de uma junta. */
  function ptsToD(pts) {
    const eps = 1e-6,
      u = [];
    for (const p of pts) {
      const q = u[u.length - 1];
      if (q && Math.abs(p.x - q.x) < eps && Math.abs(p.y - q.y) < eps) continue;
      u.push(p);
    }
    const a = u[0],
      z = u[u.length - 1];
    const anel =
      u.length > 2 && Math.abs(z.x - a.x) < eps && Math.abs(z.y - a.y) < eps;
    if (anel) u.pop();
    return (
      u
        .map((p, i) => (i ? "L" : "M") + p.x.toFixed(2) + " " + p.y.toFixed(2))
        .join(" ") + (anel ? " Z" : "")
    );
  }

  const lerpPt = (a, b, t) => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  });
  // todo ponto de z = 0 está sobre a silhueta: reescalar para o raio põe o corte
  // exatamente em cima dela, que a corda interpolada cortaria por dentro
  function onRim(p, R) {
    const m = Math.hypot(p.x, p.y) || 1;
    return { x: (p.x * R) / m, y: (p.y * R) / m };
  }

  /* A curva some por trás do globo chegando tangente à silhueta — é assim que uma
     linha da esfera cruza o horizonte. A corda discreta chega torta e abriria uma
     cunha na junção; girar a corda final para a tangente põe as duas faixas de
     traço em cima uma da outra. */
  function alinhaTangente(a, e, R) {
    const dx = e.x - a.x,
      m = Math.hypot(dx, e.y - a.y);
    if (!m) return a;
    const dy = e.y - a.y;
    let tx = -e.y / R,
      ty = e.x / R;
    const dot = (dx / m) * tx + (dy / m) * ty;
    if (dot < 0) {
      tx = -tx;
      ty = -ty;
    }
    const w = Math.abs(dot),
      ux = dx / m,
      uy = dy / m;
    const vx = ux + w * (tx - ux),
      vy = uy + w * (ty - uy),
      vm = Math.hypot(vx, vy) || 1;
    return { x: e.x - (vx / vm) * m, y: e.y - (vy / vm) * m };
  }

  /* Sem "ver através", a linha é cortada no horizonte. O corte cai no cruzamento
     exato (z = 0) e o último trecho tem sempre o mesmo comprimento em parâmetro,
     senão a ponta trepida conforme a grade de amostras desliza sob o horizonte. */
  function lineToPaths(pts, seeThrough, R) {
    if (seeThrough) return [ptsToD(pts)];
    const n = pts.length;
    const at = (c) => {
      const i = Math.floor(c),
        f = c - i;
      return f > 0 ? lerpPt(pts[i], pts[i + 1], f) : pts[i];
    };
    const cruza = (i) => i - 1 + pts[i - 1].z / (pts[i - 1].z - pts[i].z);

    const vaos = [];
    let ini = null,
      cortou = false;
    for (let i = 0; i < n; i++) {
      if (pts[i].z >= 0) {
        if (ini === null) {
          ini = i ? cruza(i) : 0;
          cortou = i > 0;
        }
      } else if (ini !== null) {
        vaos.push([ini, cruza(i), cortou, true]);
        ini = null;
      }
    }
    if (ini !== null) vaos.push([ini, n - 1, cortou, false]);

    const linhas = [];
    for (const [c0, c1, corte0, corte1] of vaos) {
      const a = c0 + 1,
        b = c1 - 1;
      const cs = [c0];
      if (b - a > 1e-9) {
        cs.push(a);
        for (let k = Math.ceil(a + 1e-9); k < b; k++) cs.push(k);
        cs.push(b);
      } else if (c1 - c0 > 1e-9) {
        cs.push((c0 + c1) / 2); // vão curto demais para os passos inteiros
      } else continue;
      cs.push(c1);
      const l = cs.map(at);
      if (corte0) {
        l[0] = onRim(l[0], R);
        if (l.length > 1) l[1] = alinhaTangente(l[1], l[0], R);
      }
      if (corte1) {
        const u = l.length - 1;
        l[u] = onRim(l[u], R);
        if (u > 0) l[u - 1] = alinhaTangente(l[u - 1], l[u], R);
      }
      linhas.push(l);
    }
    // anel fechado: um corte no índice 0 parte um trecho contínuo em dois
    if (linhas.length > 1 && pts[0].z >= 0)
      linhas.push(linhas.pop().concat(linhas.shift().slice(1)));
    return linhas.map(ptsToD);
  }

  function meridian(lon, rotY, rotX, R) {
    const pts = [];
    // metade da frente: sul→norte em lon
    for (let i = 0; i <= 72; i++)
      pts.push(project(-90 + (180 * i) / 72, lon, rotY, rotX, R));
    // metade de trás: norte→sul em lon+180 (fecha o anel)
    for (let i = 1; i <= 72; i++)
      pts.push(project(90 - (180 * i) / 72, lon + 180, rotY, rotX, R));
    pts.push(pts[0]);
    return pts;
  }
  /* A projeção de um paralelo só depende de lon+rotY: amostrando já no ângulo
     girado, a grade acompanha a curva e o desenho não cintila sub-pixel. */
  function parallel(lat, rotY, rotX, R) {
    const pts = [],
      off = (rotY * 180) / Math.PI;
    for (let i = 0; i <= 96; i++)
      pts.push(project(lat, -180 + (360 * i) / 96 - off, rotY, rotX, R));
    return pts;
  }
  function meridianLons(m) {
    if (m <= 0) return [];
    if (m === 1) return [0];
    const a = [];
    for (let i = 0; i < m; i++) a.push(-70 + (140 * i) / (m - 1));
    return a;
  }
  function parallelLats(p) {
    if (p <= 0) return [];
    if (p === 1) return [0];
    const a = [];
    for (let i = 0; i < p; i++) a.push(-55 + (110 * i) / (p - 1));
    return a;
  }

  function silhouette(R, ap, gapC, anchorTop) {
    const span = ap * 144; // abertura total, em graus
    if (span <= 1) {
      const pts = [];
      for (let i = 0; i <= 120; i++) {
        const a = deg((360 * i) / 120);
        pts.push({ x: R * Math.cos(a), y: R * Math.sin(a) });
      }
      return { d: ptsToD(pts), stub: null }; // anel fechado não tem ponta
    }
    // ângulo 0 = vértice horizontal (3h): onde o equador projetado toca a silhueta,
    // qualquer que seja a rotação. Preso, a abertura nasce ali e desce.
    const s = anchorTop ? span : gapC + span / 2;
    const e = anchorTop ? 360 : gapC + 360 - span / 2;
    const pts = [];
    for (let i = 0; i <= 120; i++) {
      const a = deg(s + ((e - s) * i) / 120);
      pts.push({ x: R * Math.cos(a), y: R * Math.sin(a) });
    }
    /* O corte reto vale só na ponta de baixo da abertura. Como o linecap do SVG
       vale para as duas pontas do mesmo caminho, o arco vai reto nas duas e a
       ponta de cima é devolvida ao arredondado por um segmento à parte. */
    const u = pts.length - 1,
      cima = pts[0].y <= pts[u].y ? [pts[1], pts[0]] : [pts[u - 1], pts[u]];
    return { d: ptsToD(pts), stub: ptsToD(cima) };
  }

  function glyphPaths(p) {
    const rotY = deg(p.rotY),
      rotX = deg(p.rotX);
    const sil = silhouette(R, p.aperture, p.gapCenter, p.anchorTop);
    const out = [{ d: sil.d, papel: "aro" }];
    if (sil.stub) out.push({ d: sil.stub, papel: "ponta" });
    meridianLons(p.meridians).forEach((lon) =>
      lineToPaths(meridian(lon, rotY, rotX, R), p.seeThrough, R).forEach((d) =>
        out.push({ d, papel: "linha" }),
      ),
    );
    parallelLats(p.parallels).forEach((lat) =>
      lineToPaths(parallel(lat, rotY, rotX, R), p.seeThrough, R).forEach((d) =>
        out.push({ d, papel: "linha" }),
      ),
    );
    if (p.recorte != null) {
      const d = remate(bordaEquador(rotY, rotX, p.stroke / 2), p.stroke / 2);
      if (d) out.push({ d, papel: "remate" });
    }
    return out;
  }

  /* Seguir o cursor.

     Uma amplitude só, e não uma por eixo: com 45° na rotação e 28° na
     inclinação — que era o par do gerador — um círculo do mouse sai uma elipse
     deitada na tela, porque cada eixo é escalado pelo seu próprio teto.

     poseCircular resolve o caminho de trás para frente. O cruzamento dos eixos
     do globo (lat 0, lon 0) projeta em (R·sen rotY, R·cos rotY·sen rotX), então
     impor que ele caia em (nx, ny)·k·R e igualar componente a componente dá

       rotY = asen(k·nx)        sen rotX = k·ny / cos rotY

     e o cos rotY se cancela na vertical. O resultado é o mesmo deslocamento em
     qualquer direção do gesto — que é o que faz o movimento ler como circular. */
  const FOLLOW = { amp: 40 };
  function poseCircular(nx, ny, amp) {
    const k = Math.sin(deg(amp));
    const rY = Math.asin(clamp(k * nx, -1, 1));
    const rX = Math.asin(clamp((k * ny) / Math.cos(rY), -1, 1));
    return [(rY * 180) / Math.PI, (rX * 180) / Math.PI];
  }

  /* ---------- guias de leitura ----------
     Caminhos finos que mostram de onde sai cada número do rodapé. Não são a
     marca — moram aqui só porque a projeção é daqui, e ficam num objeto à parte
     justamente para não se misturarem com o que desenha o logo. */
  const guias = {
    // círculo de latitude e meridiano, em coordenadas da esfera, já projetados
    paralelo: (lat, rotY, rotX) =>
      ptsToD(parallel(lat, deg(rotY), deg(rotX), R)),
    meridiano: (lon, rotY, rotX) =>
      ptsToD(meridian(lon, deg(rotY), deg(rotX), R)),
    // o cruzamento dos eixos do desenho: é dele que saem azimute e desvio
    cruzamento: (rotY, rotX) => project(0, 0, deg(rotY), deg(rotX), R),
    anel: (cx, cy, r) => {
      const pts = [];
      for (let i = 0; i <= 36; i++) {
        const a = deg((360 * i) / 36);
        pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
      }
      return ptsToD(pts);
    },
    linha: (a, b) =>
      "M" + a.x.toFixed(2) + " " + a.y.toFixed(2) +
      " L" + b.x.toFixed(2) + " " + b.y.toFixed(2),
    rastro: (pts) => (pts.length > 1 ? ptsToD(pts) : ""),
  };

  /* Recorte do logo final. O motion da marca saiu do gerador (Everblue_Globe)
     com este mesmo desenho, e no After Effects levou dois recortes à mão, que
     são parte do logo final:
     · M1, fixo: apara a ponta de baixo da abertura (de 28,8° para ~32°, num
       corte inclinado);
     · um recorte animado nas 3h, que esconde a tampa redonda onde o equador
       encontra a ponta de cima do aro enquanto ele vem por cima.
     Os pontos são os da comp 958 em unidades do globo (R = 200). O animado está
     indexado pelo giro — graus de azimute desde a pose de repouso do logo
     (228,85°) — e não pelo tempo: assim acompanha a pose de verdade, inclusive
     quando o globo segue o cursor. Entre chaves, interpolação linear, como no AE;
     nas pontas da volta ele dá lugar à regra geométrica (ver recorte()). */
  const M1 = [
    [161.19, 73.98],
    [151.17, 95.31],
    [188.59, 120.12],
    [203.13, 99.71],
  ];
  const AZ_REPOUSO = 228.85;
  const RECORTE = [
    [30.82, [[227.31, 13.96], [220.28, 28.97], [216.03, 43.52], [226.49, 42.25], [227.43, 17.62]]],
    [53.47, [[227.31, 13.96], [182.43, 13.94], [177.07, 20.7], [204.78, 33.9], [227.43, 17.62]]],
    [72.01, [[228.01, 3.86], [179.2, 4.24], [177.07, 20.7], [204.78, 33.9], [227.43, 17.62]]],
    [122.94, [[225.23, -4.81], [178.6, -2.39], [177.07, 20.7], [204.78, 33.9], [227.43, 17.62]]],
    [149.05, [[225.23, -4.81], [178.6, -2.39], [177.07, 20.7], [204.78, 33.9], [227.43, 17.62]]],
    [186.08, [[234.51, 3.68], [179.52, 3.76], [188.41, 37.62], [227.47, 45.86], [237.33, 25.42]]],
    [205.02, [[239.6, 11.5], [180.14, 11.91], [194.56, 46.78], [239.77, 52.35], [242.7, 29.64]]],
    [214.84, [[235.37, 14.43], [182.21, 16.52], [194.56, 46.78], [239.77, 52.35], [242.7, 29.64]]],
    [216.65, [[235.37, 14.43], [187.36, 19.09], [202.07, 45.32], [239.77, 52.35], [242.7, 29.64]]],
    [218.45, [[235.37, 14.43], [190.2, 19.27], [209.58, 43.86], [239.77, 52.35], [242.7, 29.64]]],
    [220.86, [[235.37, 14.43], [195.31, 20.37], [217.08, 42.39], [239.77, 52.35], [242.7, 29.64]]],
  ];

  /* A borda de baixo do equador no logo final. Perto do vértice o equador dobra
     para encostar tangente na silhueta, e o traço que acompanha a dobra termina
     arredondado. No vetor da marca a borda de baixo não dobra: segue reta, com a
     inclinação que tem ao entrar na faixa do aro, até bater no contorno externo,
     num canto vivo. Chegando por cima, ela segue horizontal — é o corte que o
     recorte do AE faz. Devolve a reta y = yt + m·(x − xe), em unidades do globo. */
  function bordaEquador(rotY, rotX, hw) {
    const xe = R - hw * 0.8;
    const alt = (x) => {
      let ant = null;
      for (let lon = -180; lon <= 180; lon += 1) {
        const q = project(0, lon, rotY, rotX, R);
        if (q.z >= 0 && q.x > 0 && ant && (ant.x - x) * (q.x - x) <= 0 && ant.x !== q.x)
          return ant.y + ((q.y - ant.y) * (x - ant.x)) / (q.x - ant.x);
        ant = q.z >= 0 ? q : null;
      }
      return null;
    };
    const y0 = alt(xe),
      y1 = alt(xe - 8);
    if (y0 === null || y1 === null) return null;
    // a borda fica a meio traço na perpendicular: na vertical isso é hw·√(1+s²)
    const s = (y0 - y1) / 8;
    return { xe, yt: y0 + hw * Math.sqrt(1 + s * s), m: Math.min(s, 0), yc: y0 };
  }

  /* O canto vivo: o trecho do aro entre o corte das 3h (y = 0) e a borda reta,
     até o contorno externo. O que fica abaixo da borda some pelo recorte. */
  function remate(b, hw) {
    if (!b) return null;
    const ro = R + hw,
      L = (x) => b.yt + b.m * (x - b.xe);
    if (L(b.xe) <= 0.01) return null;
    const fora = (x) => x * x + L(x) * L(x) >= ro * ro || L(x) <= 0;
    let lo = b.xe,
      hi = ro;
    for (let k = 0; k < 40; k++) {
      const mid = (lo + hi) / 2;
      if (fora(mid)) hi = mid;
      else lo = mid;
    }
    const xf = hi,
      yf = Math.max(L(xf), 0);
    const pts = [
      { x: b.xe, y: 0 },
      { x: b.xe, y: L(b.xe) },
      { x: xf, y: yf },
    ];
    const af = Math.atan2(yf, xf);
    for (let i = 1; i <= 8; i++) {
      const a = af * (1 - i / 8);
      pts.push({ x: ro * Math.cos(a), y: ro * Math.sin(a) });
    }
    return ptsToD(pts) + " Z";
  }

  /* Giro e raio saem da pose pelo inverso de poseCircular: sen rotY = k·nx e
     sen rotX·cos rotY = k·ny.

     No miolo da volta (54°–210°) vale o recorte do AE, chave a chave. Nas pontas
     as chaves do AE ficam paradas (até 54°) ou já saíram (depois de 222°), e a
     tampa redonda aparecia antes do recorte subir. Ali o recorte segue a regra
     que as próprias chaves seguem no miolo: corta na altura da borda de baixo do
     equador, da entrada da faixa para fora. As duas versões se misturam em 6°
     para a troca não pular. Longe da volta (o globo seguindo o cursor, pouco
     inclinado) o azimute não quer dizer nada e vale só a regra, que serve para
     qualquer pose. */
  function recorte(rotYg, rotXg, amp, hw) {
    hw = hw || 20;
    const ry = deg(rotYg),
      rx = deg(rotXg);
    const sy = Math.sin(ry),
      sx = Math.sin(rx) * Math.cos(ry);
    const r = Math.hypot(sy, sx) / Math.sin(deg(amp));
    const az = (Math.atan2(sy, -sx) * 180) / Math.PI;
    const giro = (((az - AZ_REPOUSO) % 360) + 360) % 360;

    const bd = bordaEquador(ry, rx, hw);
    const xe = R - hw * 0.8;
    const L = (x) => (bd ? bd.yt + bd.m * (x - bd.xe) : hw);
    const xr = R + hw + 12;
    const xl = xe - 10; // um pouco antes da entrada: a dobra deixava um bico ali
    const geo = [
      [xr, L(xr)],
      [xl, L(xl)],
      [xl, L(xl) + 26],
      [R + 15, L(R + 15) + 34],
      [xr, L(xr) + 18],
    ];

    let i = 0;
    while (i < RECORTE.length - 1 && RECORTE[i + 1][0] <= giro) i++;
    const [g0, a] = RECORTE[i],
      [g1, b] = RECORTE[Math.min(i + 1, RECORTE.length - 1)];
    const u = g1 > g0 ? clamp((giro - g0) / (g1 - g0), 0, 1) : 0;
    const ae = a.map((q, j) => [
      q[0] + (b[j][0] - q[0]) * u,
      q[1] + (b[j][1] - q[1]) * u,
    ]);
    // o recorte do AE só vale perto da volta do logo; fora dela, a regra
    const w =
      Math.min(clamp((giro - 54) / 6, 0, 1), clamp((210 - giro) / 6, 0, 1)) *
      clamp((r - 0.5) / 0.4, 0, 1);
    return geo.map((q, j) => [
      q[0] + (ae[j][0] - q[0]) * w,
      q[1] + (ae[j][1] - q[1]) * w,
    ]);
  }

  /* Desenho num <svg> por pool de <path>: o número de caminhos muda a cada quadro
     quando o horizonte corta as linhas, então reescrever innerHTML jogaria fora e
     recriaria nós 60× por segundo. O pool só troca o "d" e esconde a sobra. */
  function makePainter(svgEl) {
    const NS = "http://www.w3.org/2000/svg";
    /* Os recortes entram como máscara do grupo: preto no que some, como o
       alfa invertido do AE. */
    const id = "recorte-" + Math.random().toString(36).slice(2, 8);
    const defs = document.createElementNS(NS, "defs");
    const mask = document.createElementNS(NS, "mask");
    mask.setAttribute("id", id);
    mask.setAttribute("maskUnits", "userSpaceOnUse");
    mask.setAttribute("x", "-1000");
    mask.setAttribute("y", "-1000");
    mask.setAttribute("width", "2000");
    mask.setAttribute("height", "2000");
    const fundo = document.createElementNS(NS, "rect");
    fundo.setAttribute("x", "-1000");
    fundo.setAttribute("y", "-1000");
    fundo.setAttribute("width", "2000");
    fundo.setAttribute("height", "2000");
    fundo.setAttribute("fill", "#fff");
    const m1 = document.createElementNS(NS, "polygon");
    m1.setAttribute("points", M1.map((q) => q.join(",")).join(" "));
    m1.setAttribute("fill", "#000");
    const anim = document.createElementNS(NS, "polygon");
    anim.setAttribute("fill", "#000");
    mask.append(fundo, m1, anim);
    defs.appendChild(mask);
    svgEl.appendChild(defs);
    let recorteAtual = null,
      animAtual = "";

    const g = document.createElementNS(NS, "g");
    g.setAttribute("fill", "none");
    g.setAttribute("stroke-linejoin", "round");
    g.setAttribute("stroke-linecap", "round");
    svgEl.appendChild(g);
    const pool = [];
    let inkAtual = "",
      swAtual = -1;

    return function paint(p) {
      const cs = glyphPaths(p);
      // p.recorte: amplitude do giro com que o logo final foi feito, ou nada
      const comRecorte = p.recorte != null;
      if (comRecorte !== recorteAtual) {
        if (comRecorte) g.setAttribute("mask", "url(#" + id + ")");
        else g.removeAttribute("mask");
        recorteAtual = comRecorte;
      }
      if (comRecorte) {
        const r = recorte(p.rotY, p.rotX, p.recorte, p.stroke / 2);
        const pts = r ? r.map((q) => q[0].toFixed(2) + "," + q[1].toFixed(2)).join(" ") : "";
        if (pts !== animAtual) {
          anim.setAttribute("points", pts);
          animAtual = pts;
        }
      }
      if (p.ink !== inkAtual) {
        g.setAttribute("stroke", p.ink);
        g.setAttribute("color", p.ink); // o remate pinta com currentColor
        inkAtual = p.ink;
      }
      // uma espessura para o desenho inteiro: aro e linhas com o mesmo peso
      if (p.stroke !== swAtual) {
        g.setAttribute("stroke-width", p.stroke);
        swAtual = p.stroke;
      }
      for (let i = 0; i < cs.length; i++) {
        let el = pool[i];
        if (!el) {
          el = document.createElementNS(NS, "path");
          g.appendChild(el);
          pool.push(el);
        }
        el.setAttribute("d", cs[i].d);
        // o corte reto vale só no arco da silhueta, e só quando pedido
        const cap = cs[i].papel === "aro" && p.pontaReta ? "butt" : "round";
        if (el.__cap !== cap) {
          el.setAttribute("stroke-linecap", cap);
          el.__cap = cap;
        }
        // o remate é área, não traço: preenche com a tinta do grupo
        const cheio = cs[i].papel === "remate";
        if (el.__cheio !== cheio) {
          if (cheio) {
            el.setAttribute("fill", "currentColor");
            el.setAttribute("stroke", "none");
          } else {
            el.removeAttribute("fill");
            el.removeAttribute("stroke");
          }
          el.__cheio = cheio;
        }
        if (el.__off) {
          el.removeAttribute("display");
          el.__off = false;
        }
      }
      for (let i = cs.length; i < pool.length; i++)
        if (!pool[i].__off) {
          pool[i].setAttribute("display", "none");
          pool[i].__off = true;
        }
    };
  }

  global.EBGlobe = {
    R,
    deg,
    clamp,
    glyphPaths,
    recorte,
    M1,
    makePainter,
    poseCircular,
    guias,
    FOLLOW,
  };
})(window);
