/* =========================================================
   STARFIELD — layered parallax stars + shooting stars
   Usage: Starfield.init(canvas, { density, shooting, motion })
========================================================= */
(function () {
    const DENSITY = { low: 0.5, normal: 1, high: 1.7 };
    const TINTS = ["255,255,255", "255,255,255", "255,255,255", "190,210,255", "255,226,190", "200,190,255"];
    const LAYERS = [
        { share: 0.62, size: [0.3, 0.9], speed: 0.015, alpha: [0.25, 0.6] },
        { share: 0.28, size: [0.6, 1.3], speed: 0.04,  alpha: [0.4, 0.85] },
        { share: 0.10, size: [1.0, 1.9], speed: 0.08,  alpha: [0.6, 1] }
    ];

    let canvas, ctx, w = 0, h = 0, dpr = 1;
    let stars = [], meteors = [];
    let opts = { density: "normal", shooting: true, motion: true };
    let rafId = null, running = false, nextMeteor = 0;
    let mouseX = 0, mouseY = 0, curX = 0, curY = 0;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

    const rand = (a, b) => a + Math.random() * (b - a);
    const animated = () => opts.motion && !reduced.matches;

    function resize() {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        w = window.innerWidth;
        h = window.innerHeight;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = w + "px";
        canvas.style.height = h + "px";
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        build();
        if (!animated()) drawFrame(0);
    }

    function build() {
        const total = Math.min(700, Math.round((w * h) / 3200 * (DENSITY[opts.density] || 1)));
        stars = [];
        LAYERS.forEach((layer, li) => {
            const n = Math.round(total * layer.share);
            for (let i = 0; i < n; i++) {
                stars.push({
                    x: Math.random() * w,
                    y: Math.random() * h,
                    r: rand(layer.size[0], layer.size[1]),
                    a: rand(layer.alpha[0], layer.alpha[1]),
                    tw: rand(0.4, 1.8),
                    ph: Math.random() * Math.PI * 2,
                    tint: TINTS[(Math.random() * TINTS.length) | 0],
                    layer: li
                });
            }
        });
    }

    function spawnMeteor(now) {
        const fromLeft = Math.random() < 0.5;
        const angle = rand(0.35, 0.65);
        const speed = rand(9, 15);
        meteors.push({
            x: fromLeft ? rand(-50, w * 0.6) : rand(w * 0.4, w + 50),
            y: rand(-40, h * 0.35),
            vx: Math.cos(angle) * speed * (fromLeft ? 1 : -1),
            vy: Math.sin(angle) * speed,
            len: rand(90, 180),
            life: 0,
            max: rand(45, 75)
        });
        nextMeteor = now + rand(2800, 7500);
    }

    function drawFrame(now) {
        ctx.clearRect(0, 0, w, h);
        const t = now / 1000;
        const scrollY = window.scrollY || 0;
        const anim = animated();
        curX += (mouseX - curX) * 0.05;
        curY += (mouseY - curY) * 0.05;

        for (let i = 0; i < stars.length; i++) {
            const s = stars[i];
            const L = LAYERS[s.layer];
            let y = s.y - (anim ? scrollY * L.speed : 0) + curY * (s.layer + 1) * 4;
            let x = s.x + curX * (s.layer + 1) * 4;
            y = ((y % h) + h) % h;
            x = ((x % w) + w) % w;
            const alpha = anim ? s.a * (0.65 + 0.35 * Math.sin(t * s.tw + s.ph)) : s.a;
            ctx.beginPath();
            ctx.arc(x, y, s.r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${s.tint},${alpha.toFixed(3)})`;
            ctx.fill();
            if (s.r > 1.5) {
                ctx.beginPath();
                ctx.arc(x, y, s.r * 3.2, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(${s.tint},${(alpha * 0.08).toFixed(3)})`;
                ctx.fill();
            }
        }

        if (!anim || !opts.shooting) { meteors = []; return; }
        if (now > nextMeteor) spawnMeteor(now);
        for (let i = meteors.length - 1; i >= 0; i--) {
            const m = meteors[i];
            m.life++;
            m.x += m.vx;
            m.y += m.vy;
            const fade = Math.sin((m.life / m.max) * Math.PI);
            const mag = Math.hypot(m.vx, m.vy);
            const tx = m.x - (m.vx / mag) * m.len;
            const ty = m.y - (m.vy / mag) * m.len;
            const g = ctx.createLinearGradient(m.x, m.y, tx, ty);
            g.addColorStop(0, `rgba(255,255,255,${0.9 * fade})`);
            g.addColorStop(0.3, `rgba(180,200,255,${0.35 * fade})`);
            g.addColorStop(1, "rgba(180,200,255,0)");
            ctx.strokeStyle = g;
            ctx.lineWidth = 1.4;
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(m.x, m.y);
            ctx.lineTo(tx, ty);
            ctx.stroke();
            if (m.life >= m.max) meteors.splice(i, 1);
        }
    }

    function loop(now) {
        if (!running) return;
        drawFrame(now);
        rafId = requestAnimationFrame(loop);
    }

    function start() {
        if (running || !animated()) return;
        running = true;
        nextMeteor = performance.now() + 1500;
        rafId = requestAnimationFrame(loop);
    }

    function stop() {
        running = false;
        if (rafId) cancelAnimationFrame(rafId);
    }

    function setOptions(next) {
        opts = Object.assign(opts, next || {});
        if (!canvas) return;
        build();
        stop();
        if (animated()) start(); else drawFrame(0);
    }

    function init(el, options) {
        canvas = el;
        if (!canvas) return;
        ctx = canvas.getContext("2d");
        opts = Object.assign(opts, options || {});
        resize();
        let t;
        window.addEventListener("resize", () => { clearTimeout(t); t = setTimeout(resize, 150); });
        window.addEventListener("pointermove", e => {
            if (e.pointerType !== "mouse") return;
            mouseX = (e.clientX / w - 0.5) * 2;
            mouseY = (e.clientY / h - 0.5) * 2;
        }, { passive: true });
        document.addEventListener("visibilitychange", () => document.hidden ? stop() : start());
        reduced.addEventListener && reduced.addEventListener("change", () => setOptions({}));
        start();
    }

    window.Starfield = { init, setOptions };
})();
