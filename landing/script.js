/* BR Budget landing — GSAP narrative + Three.js ink flow */

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const hasGsap = typeof window.gsap !== "undefined";

if (hasGsap) {
  gsap.registerPlugin(ScrollTrigger, SplitText);
}

/* ── helpers ── */
const plAmount = (v) =>
  v.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" }) + " zł";

/* ════════ Three.js — ink particles flowing like a sankey ════════ */
async function initInkFlow() {
  const canvas = document.getElementById("flow-canvas");
  if (!canvas || reduced) return;

  let THREE;
  try {
    THREE = await import("three");
  } catch {
    return; // offline / CDN down — page works without the canvas
  }

  const hero = canvas.parentElement;
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(DPR);

  const scene = new THREE.Scene();
  let W = hero.clientWidth, H = hero.clientHeight;
  const camera = new THREE.OrthographicCamera(0, W, 0, H, -10, 10);

  /* streams: vertical fan like the Flow view — ink, green savings, thin red leak */
  const STREAMS = [
    { y: 0.14, th: 0.085, color: [0.16, 0.16, 0.15], share: 0.24 },
    { y: 0.32, th: 0.06,  color: [0.34, 0.33, 0.30], share: 0.16 },
    { y: 0.50, th: 0.075, color: [0.16, 0.16, 0.15], share: 0.22 },
    { y: 0.66, th: 0.05,  color: [0.54, 0.53, 0.50], share: 0.14 },
    { y: 0.82, th: 0.055, color: [0.04, 0.49, 0.29], share: 0.17 },
    { y: 0.95, th: 0.016, color: [0.63, 0.12, 0.12], share: 0.07 },
  ];

  const COUNT = Math.min(2400, Math.max(900, Math.floor((W * H) / 700)));
  const positions = new Float32Array(COUNT * 3);
  const colors = new Float32Array(COUNT * 3);
  const sizes = new Float32Array(COUNT);
  const alphas = new Float32Array(COUNT);
  const meta = []; // {stream, t, speed, off, wobA, wobF, phase}

  let acc = 0;
  const cumulative = STREAMS.map((s) => (acc += s.share));
  for (let i = 0; i < COUNT; i++) {
    const r = Math.random();
    const si = cumulative.findIndex((c) => r <= c);
    const s = STREAMS[si === -1 ? STREAMS.length - 1 : si];
    meta.push({
      stream: STREAMS.indexOf(s),
      t: Math.random(),
      speed: 0.04 + Math.random() * 0.075,
      off: (Math.random() * 2 - 1),
      wobA: 1.5 + Math.random() * 3.5,
      wobF: 2 + Math.random() * 5,
      phase: Math.random() * Math.PI * 2,
    });
    colors[i * 3] = s.color[0];
    colors[i * 3 + 1] = s.color[1];
    colors[i * 3 + 2] = s.color[2];
    sizes[i] = (1.4 + Math.random() * 2.4) * DPR;
    alphas[i] = 0.18 + Math.random() * 0.3;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute("aAlpha", new THREE.BufferAttribute(alphas, 1));

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uFade: { value: 1 } },
    vertexShader: `
      attribute float aSize;
      attribute float aAlpha;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vColor = color;
        vAlpha = aAlpha;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize;
      }`,
    fragmentShader: `
      uniform float uFade;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        float a = smoothstep(0.5, 0.18, d) * vAlpha * uFade;
        if (a < 0.01) discard;
        gl_FragColor = vec4(vColor, a);
      }`,
    vertexColors: true,
  });

  const points = new THREE.Points(geo, mat);
  scene.add(points);

  /* cubic bezier per stream: source left-center → fan right */
  let curves = [];
  function buildCurves() {
    curves = STREAMS.map((s) => {
      const y0 = H * 0.55;
      const y1 = H * s.y;
      return {
        p0: [-W * 0.04, y0],
        p1: [W * 0.42, y0],
        p2: [W * 0.6, y1],
        p3: [W * 1.04, y1],
        th: H * s.th,
      };
    });
  }
  buildCurves();

  function bez(c, t, out) {
    const u = 1 - t;
    const a = u * u * u, b = 3 * u * u * t, d = 3 * u * t * t, e = t * t * t;
    out[0] = a * c.p0[0] + b * c.p1[0] + d * c.p2[0] + e * c.p3[0];
    out[1] = a * c.p0[1] + b * c.p1[1] + d * c.p2[1] + e * c.p3[1];
  }
  function bezTan(c, t, out) {
    const u = 1 - t;
    out[0] = 3 * u * u * (c.p1[0] - c.p0[0]) + 6 * u * t * (c.p2[0] - c.p1[0]) + 3 * t * t * (c.p3[0] - c.p2[0]);
    out[1] = 3 * u * u * (c.p1[1] - c.p0[1]) + 6 * u * t * (c.p2[1] - c.p1[1]) + 3 * t * t * (c.p3[1] - c.p2[1]);
  }

  const pt = [0, 0], tan = [0, 0];
  let elapsed = 0;
  function tick(dt) {
    elapsed += dt;
    const pos = geo.attributes.position.array;
    for (let i = 0; i < COUNT; i++) {
      const m = meta[i];
      m.t += m.speed * dt;
      if (m.t > 1) m.t -= 1;
      const c = curves[m.stream];
      bez(c, m.t, pt);
      bezTan(c, m.t, tan);
      const len = Math.hypot(tan[0], tan[1]) || 1;
      const nx = -tan[1] / len, ny = tan[0] / len;
      // taper: tight at source, full width mid-flight
      const spread = Math.min(1, m.t * 4) * c.th * 0.5;
      const wob = Math.sin(elapsed * m.wobF * 0.4 + m.phase) * m.wobA;
      const fadeEdge = Math.min(1, Math.min(m.t, 1 - m.t) * 14); // soft in/out
      pos[i * 3] = pt[0] + nx * (m.off * spread + wob);
      pos[i * 3 + 1] = pt[1] + ny * (m.off * spread + wob);
      pos[i * 3 + 2] = 0;
      geo.attributes.aAlpha.array[i] = (0.18 + (m.off + 1) * 0.12) * fadeEdge;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aAlpha.needsUpdate = true;
    renderer.render(scene, camera);
  }

  function resize() {
    W = hero.clientWidth;
    H = hero.clientHeight;
    renderer.setSize(W, H, false);
    camera.right = W;
    camera.bottom = H;
    camera.updateProjectionMatrix();
    buildCurves();
  }
  resize();
  window.addEventListener("resize", resize);

  /* subtle pointer parallax */
  if (hasGsap && window.matchMedia("(pointer: fine)").matches) {
    const qx = gsap.quickTo(points.position, "x", { duration: 0.9, ease: "power2.out" });
    const qy = gsap.quickTo(points.position, "y", { duration: 0.9, ease: "power2.out" });
    hero.addEventListener("pointermove", (e) => {
      qx(((e.clientX / W) - 0.5) * 18);
      qy(((e.clientY / H) - 0.5) * 12);
    });
  }

  /* render only when hero is on screen */
  let running = false;
  const loop = (t, deltaMS) => tick(Math.min(deltaMS / 1000, 0.05));
  const start = () => {
    if (running) return;
    running = true;
    if (hasGsap) gsap.ticker.add(loop);
  };
  const stop = () => {
    if (!running) return;
    running = false;
    if (hasGsap) gsap.ticker.remove(loop);
  };
  if (hasGsap) {
    new IntersectionObserver(([e]) => (e.isIntersecting ? start() : stop()), { threshold: 0 }).observe(hero);
    document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
    /* fade ink away as the story begins */
    gsap.to(mat.uniforms.uFade, {
      value: 0,
      ease: "none",
      scrollTrigger: { trigger: hero, start: "40% top", end: "bottom top", scrub: true },
    });
    start();
  } else {
    const raf = () => { tick(1 / 60); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
  }
  window.__heroFlowOk = true;
}

/* ════════ GSAP narrative ════════ */
function initNarrative() {
  if (!hasGsap) return;

  if (reduced) {
    /* no motion: just flip chips to their final state */
    document.querySelectorAll(".lr-chip").forEach((chip) => {
      chip.textContent = chip.dataset.cat;
      chip.classList.add("is-set");
    });
    document.querySelectorAll(".strip-num").forEach((el) => {
      const v = parseFloat(el.dataset.count || "0");
      el.textContent = (el.dataset.prefix || "") + plAmount(v);
    });
    return;
  }

  /* hero entrance */
  const heroTl = gsap.timeline({ defaults: { ease: "power3.out" } });
  const titleSplit = new SplitText(".hero-title", { type: "lines", mask: "lines" });
  heroTl
    .from(".hero-eyebrow", { y: 16, autoAlpha: 0, duration: 0.7 })
    .from(titleSplit.lines, { yPercent: 110, duration: 1.1, stagger: 0.12, ease: "power4.out" }, "-=0.35")
    .from(".hero-lead", { y: 24, autoAlpha: 0, duration: 0.8 }, "-=0.6")
    .from(".hero-actions .btn", { y: 18, autoAlpha: 0, duration: 0.6, stagger: 0.08 }, "-=0.5")
    .from(".hero-micro", { autoAlpha: 0, duration: 0.6 }, "-=0.3")
    .from(".hero-strip", { y: 20, autoAlpha: 0, duration: 0.8 }, "-=0.4");

  /* hero counters */
  document.querySelectorAll(".strip-num").forEach((el, i) => {
    const target = parseFloat(el.dataset.count || "0");
    const prefix = el.dataset.prefix || "";
    const state = { v: 0 };
    gsap.to(state, {
      v: target,
      duration: 1.8,
      delay: 0.9 + i * 0.15,
      ease: "power2.out",
      onUpdate: () => { el.textContent = prefix + plAmount(state.v); },
    });
  });

  /* chapter titles: masked line reveals */
  document.querySelectorAll(".split-lines").forEach((el) => {
    const split = new SplitText(el, { type: "lines", mask: "lines" });
    gsap.from(split.lines, {
      yPercent: 110,
      duration: 1,
      stagger: 0.1,
      ease: "power4.out",
      scrollTrigger: { trigger: el, start: "top 82%" },
    });
  });

  /* chapter heads + leads */
  document.querySelectorAll(".chapter").forEach((ch) => {
    const bits = ch.querySelectorAll(".chapter-head, .chapter-lead");
    gsap.from(bits, {
      y: 24,
      autoAlpha: 0,
      duration: 0.8,
      stagger: 0.12,
      ease: "power3.out",
      scrollTrigger: { trigger: ch, start: "top 78%" },
    });
  });

  /* 01 — mystery number + red scribble */
  const scribble = document.querySelector(".mystery-scribble path");
  if (scribble) {
    scribble.setAttribute("pathLength", "1");
    gsap.set(scribble, { strokeDasharray: 1, strokeDashoffset: 1 });
    const num = { v: 0 };
    const numEl = document.querySelector(".mystery-num");
    gsap.timeline({
      scrollTrigger: { trigger: ".mystery", start: "top 75%" },
    })
      .from(".mystery", { y: 30, autoAlpha: 0, duration: 0.7, ease: "power3.out" })
      .to(num, {
        v: 412.38,
        duration: 1.4,
        ease: "power3.out",
        onUpdate: () => { numEl.textContent = "−" + plAmount(num.v); },
      }, "-=0.3")
      .to(scribble, { strokeDashoffset: 0, duration: 0.9, ease: "power2.inOut" }, "-=0.5")
      .from(".mystery-caption", { autoAlpha: 0, y: 10, duration: 0.5 }, "-=0.2");
  }

  /* 02 — the inequality + mechanism rows */
  const ineq = document.querySelector(".ineq");
  if (ineq) {
    gsap.timeline({ scrollTrigger: { trigger: ineq, start: "top 80%" } })
      .from(".ineq-l", { x: -36, autoAlpha: 0, duration: 0.7, ease: "power3.out" })
      .from(".ineq-r", { x: 36, autoAlpha: 0, duration: 0.7, ease: "power3.out" }, "<")
      .from(".ineq-sign", { scale: 0, rotation: -90, autoAlpha: 0, duration: 0.6, ease: "back.out(2.2)" }, "-=0.25");
  }
  gsap.utils.toArray(".mech-row").forEach((row) => {
    gsap.from(row, {
      y: 36,
      autoAlpha: 0,
      duration: 0.7,
      ease: "power3.out",
      scrollTrigger: { trigger: row, start: "top 85%" },
    });
  });

  /* savings task card: rows, streak, rubber stamp */
  gsap.timeline({ scrollTrigger: { trigger: ".save-card", start: "top 78%" } })
    .from(".save-card .mc-row", { x: -16, autoAlpha: 0, duration: 0.4, stagger: 0.14, ease: "power2.out" }, 0.2)
    .from(".save-card .sd", { scale: 0, duration: 0.25, stagger: 0.07, ease: "back.out(3)" }, "-=0.1")
    .from(".save-card .stamp", { scale: 2.4, rotation: 10, autoAlpha: 0, duration: 0.4, ease: "power4.in" }, "+=0.25")
    .to(".save-card", { x: 2, y: -2, duration: 0.07, yoyo: true, repeat: 1, ease: "power1.inOut" }, "<0.36");

  /* pause card: lock bar fills, decision buttons wait */
  gsap.timeline({ scrollTrigger: { trigger: ".pause-card", start: "top 78%" } })
    .from(".pause-card .mc-q", { autoAlpha: 0, y: 8, duration: 0.5 }, 0.2)
    .from(".pause-card .mc-lockbar i", { width: 0, duration: 1.1, ease: "power2.out" }, "-=0.2")
    .from(".pause-card .mc-lock span", { autoAlpha: 0, duration: 0.4 }, "-=0.5")
    .from(".pause-card .mc-decide > *", { autoAlpha: 0, y: 6, duration: 0.3, stagger: 0.08 }, "-=0.2");

  /* plan card: cashflow curve draws, floor + ghosts appear, dots pop, rows follow */
  const planCurve = document.querySelector(".plan-card .pc-curve");
  const planGhost = document.querySelector(".plan-card .pc-ghostline");
  if (planCurve && planGhost) {
    [planCurve, planGhost].forEach((p) => p.setAttribute("pathLength", "1"));
    gsap.set(planCurve, { strokeDasharray: 1, strokeDashoffset: 1 });
    gsap.timeline({ scrollTrigger: { trigger: ".plan-card", start: "top 80%" } })
      .from(".plan-card .pc-assume", { autoAlpha: 0, y: 6, duration: 0.4 }, 0.15)
      .from(".plan-card .pc-floor, .plan-card .pc-floor-label", { autoAlpha: 0, duration: 0.4 }, "-=0.1")
      .to(planCurve, { strokeDashoffset: 0, duration: 1.1, ease: "power2.inOut" }, "-=0.15")
      .from(".plan-card .pc-dot-svg-pos", { scale: 0, transformOrigin: "50% 50%", duration: 0.3, ease: "back.out(3)" }, "-=0.55")
      .from(".plan-card .pc-dot-svg-neg", { scale: 0, transformOrigin: "50% 50%", duration: 0.3, ease: "back.out(3)" }, "-=0.3")
      .from(planGhost, { autoAlpha: 0, duration: 0.6 }, "-=0.1")
      .from(".plan-card .pc-row, .plan-card .pc-hint", { autoAlpha: 0, x: -10, duration: 0.35, stagger: 0.1 }, "-=0.4");
  }

  /* 03 — sankey draw, scrubbed (pinned on desktop) */
  const sankeyFlows = gsap.utils.toArray(".sankey [data-flow]");
  sankeyFlows.forEach((p) => p.setAttribute("pathLength", "1"));
  gsap.set(sankeyFlows, { strokeDasharray: 1, strokeDashoffset: 1 });
  gsap.set(".s-label", { autoAlpha: 0, x: -10 });

  const mm = gsap.matchMedia();
  mm.add("(min-width: 961px)", () => {
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: ".flow",
        start: "top top",
        end: "+=130%",
        pin: ".flow-pin",
        scrub: 0.6,
      },
    });
    tl.to(sankeyFlows, { strokeDashoffset: 0, stagger: 0.12, ease: "none", duration: 1.6 })
      .to(".s-label-src", { autoAlpha: 1, x: 0, duration: 0.25 }, 0.1)
      .to(".s-label:not(.s-label-src)", { autoAlpha: 1, x: 0, stagger: 0.1, duration: 0.3 }, 0.7)
      .to(".stage-caption", { autoAlpha: 1, duration: 0.3 }, ">-0.2");
    gsap.set(".stage-caption", { autoAlpha: 0 });
  });
  mm.add("(max-width: 960px)", () => {
    const tl = gsap.timeline({
      scrollTrigger: { trigger: ".sankey-stage", start: "top 75%" },
    });
    tl.to(sankeyFlows, { strokeDashoffset: 0, stagger: 0.1, ease: "power2.inOut", duration: 1.3 })
      .to(".s-label", { autoAlpha: 1, x: 0, stagger: 0.07, duration: 0.4 }, "-=0.6");
  });

  /* 03 — ledger rows + AI chips flipping in */
  const rows = gsap.utils.toArray(".ledger-row");
  gsap.from(".ledger-card", {
    y: 40,
    autoAlpha: 0,
    duration: 0.9,
    ease: "power3.out",
    scrollTrigger: { trigger: ".ledger-card", start: "top 80%" },
  });
  gsap.from(rows, {
    autoAlpha: 0,
    x: -18,
    duration: 0.5,
    stagger: 0.1,
    ease: "power2.out",
    scrollTrigger: { trigger: ".ledger-rows", start: "top 78%" },
  });
  const flipChip = (chip) => {
    gsap.timeline()
      .to(chip, { rotateX: 90, duration: 0.22, ease: "power2.in" })
      .call(() => {
        chip.textContent = chip.dataset.cat;
        chip.classList.add("is-set");
      })
      .to(chip, { rotateX: 0, duration: 0.3, ease: "back.out(2)" });
  };
  ScrollTrigger.create({
    trigger: ".ledger-rows",
    start: "top 75%",
    once: true,
    onEnter: () => {
      gsap.utils.toArray(".lr-chip").forEach((chip, i) => {
        gsap.delayedCall(0.7 + i * 0.28, () => flipChip(chip));
      });
    },
  });

  /* 04 — terminal lines */
  gsap.from(".terminal .t-line", {
    autoAlpha: 0,
    y: 10,
    duration: 0.45,
    stagger: 0.18,
    ease: "power2.out",
    scrollTrigger: { trigger: ".terminal", start: "top 75%" },
  });
  gsap.from(".agent-micro", {
    autoAlpha: 0,
    duration: 0.6,
    scrollTrigger: { trigger: ".agent-micro", start: "top 88%" },
  });

  /* 05 — detail cards */
  gsap.from(".detail-card", {
    y: 34,
    autoAlpha: 0,
    duration: 0.7,
    stagger: 0.12,
    ease: "power3.out",
    scrollTrigger: { trigger: ".details-grid", start: "top 80%" },
  });

  /* finale */
  const finaleSplit = new SplitText(".finale-title", { type: "chars" });
  gsap.from(finaleSplit.chars, {
    yPercent: 60,
    autoAlpha: 0,
    duration: 0.8,
    stagger: 0.035,
    ease: "back.out(1.6)",
    scrollTrigger: { trigger: ".finale", start: "top 70%" },
  });
  gsap.from(".finale .btn-big, .finale-micro", {
    y: 20,
    autoAlpha: 0,
    duration: 0.7,
    stagger: 0.12,
    ease: "power3.out",
    scrollTrigger: { trigger: ".finale", start: "top 55%" },
  });

  /* chapter rail */
  const railLinks = document.querySelectorAll(".rail a");
  ScrollTrigger.create({
    trigger: ".hero",
    start: "top top",
    end: "bottom 60%",
    onToggle: (self) => {
      if (self.isActive) railLinks.forEach((l) => l.classList.remove("is-active"));
    },
  });
  document.querySelectorAll("[data-chapter]").forEach((sec) => {
    ScrollTrigger.create({
      trigger: sec,
      start: "top 50%",
      end: "bottom 50%",
      onToggle: (self) => {
        if (!self.isActive) return;
        railLinks.forEach((l) =>
          l.classList.toggle("is-active", l.dataset.rail === sec.dataset.chapter)
        );
      },
    });
  });

  /* hide scroll cue once the story starts */
  gsap.to(".scroll-cue", {
    autoAlpha: 0,
    scrollTrigger: { trigger: ".problem", start: "top 90%", end: "top 60%", scrub: true },
  });
}

/* smooth anchor scrolling (CSS scroll-behavior would break ScrollTrigger pins) */
document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener("click", (e) => {
    const target = document.querySelector(a.getAttribute("href"));
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
  });
});

initNarrative();
initInkFlow();
