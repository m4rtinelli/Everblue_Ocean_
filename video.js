/* Everblue · gravação do fundo
   Grava só o canvas do gradiente — sem marca, sem painel, sem página — via
   captureStream + MediaRecorder. O laço de desenho é o mesmo da tela: o que a
   página está mostrando é o que entra no arquivo.

   Duas saídas, cada uma para um destino: **MP4/H.264 High** é a que abre em
   tudo, inclusive After Effects e Premiere, e é o padrão; **WebM/VP9** é a que
   rende mais por bit e serve à web. O código não promete codec nenhum — pergunta
   ao navegador (isTypeSupported), grava com o primeiro da lista que passar e
   devolve o nome do que foi usado, com a extensão certa no arquivo.

   O que o MediaRecorder não expõe é o tamanho do GOP: não há como pedir "um
   keyframe por segundo". Quem precisa de all-intra para edição recodifica
   depois — `ffmpeg -i a.mp4 -c:v prores_ks -profile:v 3 a.mov` entrega um
   arquivo que corta em qualquer quadro.                                      */
(function (global) {
  /* Escada de perfis, do melhor para o que sempre existe. High é o que interessa:
     tem CABAC e transformada 8×8, que é justamente o que segura gradiente sem
     abrir faixa — Baseline não tem nenhum dos dois. O nível vem junto porque
     define o teto de resolução e taxa: 5.2 para 4K a 60, 5.1 para 4K a 30, 4.2
     para 1080p. Pedir alto não custa: quem não aguenta responde "não" no
     isTypeSupported e a lista anda.

     VP9 em MP4 abre a lista porque seria o melhor arquivo, mas quase nenhum
     navegador oferece essa combinação na gravação — e um MP4 com VP9 dentro não
     abre no After Effects nem no Premiere, que é para onde estes vídeos vão. */
  const MP4 = [
    { mime: 'video/mp4;codecs="vp09.00.51.08"', ext: "mp4", nome: "VP9 · MP4" },
    { mime: 'video/mp4;codecs="avc1.640034"', ext: "mp4", nome: "H.264 High 5.2 · MP4" },
    { mime: 'video/mp4;codecs="avc1.640033"', ext: "mp4", nome: "H.264 High 5.1 · MP4" },
    { mime: 'video/mp4;codecs="avc1.64002A"', ext: "mp4", nome: "H.264 High 4.2 · MP4" },
    { mime: 'video/mp4;codecs="avc1.640028"', ext: "mp4", nome: "H.264 High 4.0 · MP4" },
    { mime: 'video/mp4;codecs="avc1.4D402A"', ext: "mp4", nome: "H.264 Main 4.2 · MP4" },
    { mime: 'video/mp4;codecs="avc1.42E01E"', ext: "mp4", nome: "H.264 Baseline · MP4" },
    { mime: "video/mp4", ext: "mp4", nome: "MP4" },
  ];
  const WEBM = [
    { mime: 'video/webm;codecs="vp09.00.51.08"', ext: "webm", nome: "VP9 · WebM" },
    { mime: "video/webm;codecs=vp9", ext: "webm", nome: "VP9 · WebM" },
    { mime: "video/webm;codecs=vp8", ext: "webm", nome: "VP8 · WebM" },
    { mime: "video/webm", ext: "webm", nome: "WebM" },
  ];

  /* O container escolhido manda na ordem, mas a outra lista continua no fim: é
     melhor entregar um WebM avisando do que recusar a gravar. */
  function escolher(container) {
    if (typeof MediaRecorder === "undefined") return null;
    const lista = container === "webm" ? WEBM.concat(MP4) : MP4.concat(WEBM);
    for (const c of lista)
      if (MediaRecorder.isTypeSupported(c.mime)) return c;
    return null;
  }

  // o que este navegador realmente aceita, para a interface poder dizer antes
  function disponiveis() {
    return MP4.concat(WEBM).filter(
      (c) =>
        typeof MediaRecorder !== "undefined" &&
        MediaRecorder.isTypeSupported(c.mime),
    );
  }

  function baixar(blob, nome) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = nome;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  const fmtBytes = (n) =>
    n > 1e6 ? (n / 1e6).toFixed(1) + " MB" : Math.round(n / 1e3) + " kB";

  /* Grava e devolve um controle com parar(). Quem chama cuida do tamanho do
     canvas: aqui a gravação só segue o que estiver sendo desenhado. */
  function gravar(o) {
    const c = escolher(o.container);
    if (!c) {
      o.aviso("Este navegador não grava vídeo.");
      return null;
    }
    let stream;
    try {
      stream = o.canvas.captureStream(o.fps);
    } catch (e) {
      o.aviso("O navegador não deixou capturar o canvas.");
      return null;
    }

    let rec;
    try {
      rec = new MediaRecorder(stream, {
        mimeType: c.mime,
        videoBitsPerSecond: o.bits,
      });
    } catch (e) {
      o.aviso("Falha ao iniciar: " + e.message);
      stream.getTracks().forEach((t) => t.stop());
      return null;
    }

    const pedacos = [];
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size) pedacos.push(e.data);
    };
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(pedacos, { type: c.mime });
      if (blob.size) baixar(blob, o.nome + "." + c.ext);
      o.aoFim(c, blob.size ? fmtBytes(blob.size) : null);
    };
    // fatias de 1 s: se a aba morrer no meio, o que já saiu não se perde
    rec.start(1000);

    const t0 = performance.now();
    let parado = false;
    const tick = () => {
      if (parado) return;
      const s = (performance.now() - t0) / 1000;
      if (s >= o.dur) return parar();
      o.aoTick(s);
      setTimeout(tick, 100);
    };
    function parar() {
      if (parado) return;
      parado = true;
      if (rec.state !== "inactive") rec.stop();
    }
    tick();
    return { parar, codec: c };
  }

  global.EBVideo = { gravar, escolher, disponiveis };
})(window);
