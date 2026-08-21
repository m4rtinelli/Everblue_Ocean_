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

  /* Desenho num <svg> por pool de <path>: o número de caminhos muda a cada quadro
     quando o horizonte corta as linhas, então reescrever innerHTML jogaria fora e
     recriaria nós 60× por segundo. O pool só troca o "d" e esconde a sobra. */
  function makePainter(svgEl) {
    const NS = "http://www.w3.org/2000/svg";
    const g = document.createElementNS(NS, "g");
    g.setAttribute("fill", "none");
    g.setAttribute("stroke-linejoin", "round");
    g.setAttribute("stroke-linecap", "round");
    svgEl.appendChild(g);
    const pool = [];
    let inkAtual = "";

    return function paint(p) {
      const cs = glyphPaths(p);
      if (p.ink !== inkAtual) {
        g.setAttribute("stroke", p.ink);
        inkAtual = p.ink;
      }
      /* Duas espessuras: o aro carrega o peso da marca e os meridianos e
         paralelos podem ir mais finos que ele. A razão é relativa de propósito —
         mexer no traço engrossa o desenho inteiro sem desfazer o contraste
         escolhido entre a borda e as linhas. */
      const swLinha = p.stroke * (p.linhas == null ? 1 : p.linhas);
      for (let i = 0; i < cs.length; i++) {
        let el = pool[i];
        if (!el) {
          el = document.createElementNS(NS, "path");
          g.appendChild(el);
          pool.push(el);
        }
        el.setAttribute("d", cs[i].d);
        const sw = cs[i].papel === "linha" ? swLinha : p.stroke;
        if (el.__sw !== sw) {
          el.setAttribute("stroke-width", sw);
          el.__sw = sw;
        }
        // o corte reto vale só no arco da silhueta, e só quando pedido
        const cap = cs[i].papel === "aro" && p.pontaReta ? "butt" : "round";
        if (el.__cap !== cap) {
          el.setAttribute("stroke-linecap", cap);
          el.__cap = cap;
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
    makePainter,
    poseCircular,
    guias,
    FOLLOW,
  };
})(window);
