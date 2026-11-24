/* =========================================================
   PORTFOLIO — renders everything from window.PORTFOLIO
   (data/content.js), managed through admin.html
========================================================= */
(function () {
    "use strict";

    const params = new URLSearchParams(location.search);
    const PREVIEW = params.has("preview");
    const DRAFT_KEY = "portfolio:draft";

    let C = window.PORTFOLIO || {};
    if (PREVIEW) {
        try {
            const draft = localStorage.getItem(DRAFT_KEY);
            if (draft) C = JSON.parse(draft);
        } catch (e) { /* ignore broken drafts */ }
        document.documentElement.classList.add("is-preview");
    }

    /* ---------- helpers ---------- */
    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
    const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const md = s => esc(s)
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>")
        .replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:|#)[^)\s]*)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    const safeUrl = u => {
        u = String(u || "").trim();
        if (/^\s*javascript:/i.test(u)) return "#";
        return u || "#";
    };
    const ext = u => /^https?:\/\//i.test(u) ? ' target="_blank" rel="noopener"' : "";
    const SI_CDN = "https://cdn.jsdelivr.net/npm/simple-icons@13.21.0/icons/";
    const icon = cls => {
        if (!cls) return "";
        const si = String(cls).match(/^si:([a-z0-9]+)$/i);
        if (si) return `<i class="si" style="--si:url('${SI_CDN}${si[1].toLowerCase()}.svg')" aria-hidden="true"></i>`;
        return `<i class="${esc(cls)}" aria-hidden="true"></i>`;
    };
    const list = a => Array.isArray(a) ? a : [];
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const appMQ = window.matchMedia("(max-width: 768px)");
    const vibrate = () => { try { if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(8); } catch (e) { /* noop */ } };

    const app = $("#app");
    let VIEWS = [];
    let LIVE = {};
    let activeView = "home";
    let appMode = false;
    let typingToken = 0;
    let revealObserver = null;

    /* =====================================================
       THEME + META
    ===================================================== */
    function hexToRgb(hex) {
        const m = String(hex || "").replace("#", "").match(/^([0-9a-f]{3}|[0-9a-f]{6})$/i);
        if (!m) return null;
        let h = m[1];
        if (h.length === 3) h = h.split("").map(c => c + c).join("");
        const n = parseInt(h, 16);
        return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
    }

    function applyTheme() {
        const t = C.theme || {};
        const root = document.documentElement.style;
        [["accent", t.accent], ["accent-2", t.accent2], ["sun", t.sun]].forEach(([k, v]) => {
            const rgb = hexToRgb(v);
            if (rgb) { root.setProperty(`--${k}`, v); root.setProperty(`--${k}-rgb`, rgb); }
        });
        document.documentElement.classList.toggle("no-motion", t.motion === false);
        if (window.Starfield) {
            window.Starfield.setOptions({ density: t.stars || "normal", shooting: t.shootingStars !== false, motion: t.motion !== false });
        }
    }

    function applyMeta() {
        const m = C.meta || {};
        if (m.title) document.title = m.title;
        const d = $('meta[name="description"]');
        if (d && m.description) d.setAttribute("content", m.description);
    }

    /* =====================================================
       RENDERERS
    ===================================================== */
    const P = () => C.profile || {};
    const fullName = () => [P().firstName, P().lastName].filter(Boolean).join(" ");

    function socialLinks(cls = "social") {
        return list(C.socials).filter(s => s.url).map(s =>
            `<a href="${esc(safeUrl(s.url))}"${ext(s.url)} class="${cls}" aria-label="${esc(s.label)}" title="${esc(s.label)}">${icon(s.icon)}</a>`
        ).join("");
    }

    /* Hero: interactive 3D "skill sphere" — logos on a slowly tumbling globe
       around the avatar, with depth, spokes and a caption for the front logo. */
    function renderSphere() {
        const items = list(C.orbit);
        const nodes = items.map((it, i) => {
            const body = it.icon ? icon(it.icon) : `<b>${esc(it.short || (it.label || "").slice(0, 3))}</b>`;
            return `<button type="button" class="node" data-i="${i}" aria-label="${esc(it.label)}" title="${esc(it.label)}">${body}</button>`;
        }).join("");
        const lines = items.map(() => '<line x1="0" y1="0" x2="0" y2="0"/>').join("");
        return `<div class="sphere no-swipe" id="sphere">
                <svg class="sphere-lines" viewBox="-50 -50 100 100" aria-hidden="true">${lines}</svg>
                <div class="core">
                    <span class="core-ring"></span><span class="core-arc"></span>
                    <img src="${esc(P().avatar || "img/avatar.webp")}" alt="${esc(fullName())}" class="core-img">
                </div>
                ${nodes}
            </div>
            ${items.length ? `<div class="sphere-caption" aria-live="polite"><span class="sc-dot"></span><span class="sc-text" id="sphereLabel">${esc(items[0].label)}</span></div>` : ""}`;
    }

    let sphereToken = 0;
    function startSphere() {
        const token = ++sphereToken;
        const root = $("#sphere");
        if (!root) return;
        const nodes = $$(".node", root);
        const lines = $$(".sphere-lines line", root);
        const label = $("#sphereLabel");
        const n = nodes.length;
        if (!n) return;

        // even spread on a unit sphere (Fibonacci lattice) — logos never collide
        const pts = nodes.map((_, i) => {
            const y = 1 - (i + 0.5) * (2 / n);
            const r = Math.sqrt(1 - y * y);
            const t = i * Math.PI * (3 - Math.sqrt(5));
            return { x: Math.cos(t) * r, y, z: Math.sin(t) * r };
        });
        const rotate = (ax, ay) => {
            const cx = Math.cos(ax), sx = Math.sin(ax), cy = Math.cos(ay), sy = Math.sin(ay);
            pts.forEach(p => {
                const x = p.x * cy - p.z * sy;
                let z = p.x * sy + p.z * cy;
                const y = p.y * cx - z * sx;
                z = p.y * sx + z * cx;
                p.x = x; p.y = y; p.z = z;
            });
        };
        rotate(0.45, 0.3);

        const animated = !(reducedMotion.matches || (C.theme || {}).motion === false);
        const BASE_Y = 0.00022, BASE_X = 0.00005;      // rad per ms (~28s per turn + gentle tumble)
        let vx = BASE_X, vy = BASE_Y, tx = BASE_X, ty = BASE_Y;
        let hoverNode = -1, frontIdx = -1, drag = null, visible = true, last = performance.now();

        function draw() {
            const S = root.clientWidth;
            if (!S) return;
            const R = S * 0.42, coreR = S * 0.17;
            let best = -2, fi = 0;
            pts.forEach((p, i) => {
                const d = (p.z + 1) / 2;                         // 0 = back, 1 = front
                const px = p.x * R, py = p.y * R;
                let o = 0.18 + 0.82 * d;
                if (p.z > 0 && Math.hypot(px, py) < coreR * 1.05) o *= 0.4;   // don't hide the face
                const el = nodes[i];
                el.style.transform = `translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, 0) scale(${(0.58 + 0.52 * d).toFixed(3)})`;
                el.style.opacity = o.toFixed(3);
                el.style.zIndex = p.z > 0 ? 3 : 1;
                const ln = lines[i];
                ln.setAttribute("x2", (px / S * 100).toFixed(2));
                ln.setAttribute("y2", (py / S * 100).toFixed(2));
                ln.style.opacity = (0.04 + 0.3 * d * d).toFixed(3);
                if (p.z > best) { best = p.z; fi = i; }
            });
            const show = hoverNode >= 0 ? hoverNode : fi;
            if (show !== frontIdx) {
                frontIdx = show;
                nodes.forEach((el, i) => el.classList.toggle("is-front", i === show));
                if (label) {
                    label.textContent = nodes[show].getAttribute("aria-label");
                    label.classList.remove("swap");
                    void label.offsetWidth;
                    label.classList.add("swap");
                }
            }
        }

        function frame(now) {
            if (token !== sphereToken) return;
            const dt = Math.min(48, now - last);
            last = now;
            if (!drag) {
                const slow = hoverNode >= 0 ? 0.15 : 1;
                vx += (tx * slow - vx) * 0.04;
                vy += (ty * slow - vy) * 0.04;
                rotate(vx * dt, vy * dt);
            }
            if (visible) draw();
            requestAnimationFrame(frame);
        }

        // mouse steers the spin; drag / swipe spins it with inertia
        root.addEventListener("pointermove", e => {
            const r = root.getBoundingClientRect();
            if (drag) {
                const dx = e.clientX - drag.x, dy = e.clientY - drag.y, dt = Math.max(16, e.timeStamp - drag.t);
                rotate(-dy * 0.006, dx * 0.006);
                vy = (dx * 0.006) / dt;
                vx = (-dy * 0.006) / dt;
                drag = { x: e.clientX, y: e.clientY, t: e.timeStamp };
                if (!animated) draw();
                return;
            }
            if (e.pointerType !== "mouse") return;
            const mx = (e.clientX - r.left) / r.width * 2 - 1, my = (e.clientY - r.top) / r.height * 2 - 1;
            ty = BASE_Y + mx * 0.0007;
            tx = BASE_X - my * 0.0005;
        });
        root.addEventListener("pointerleave", () => { tx = BASE_X; ty = BASE_Y; });
        root.addEventListener("pointerdown", e => {
            drag = { x: e.clientX, y: e.clientY, t: e.timeStamp };
            root.classList.add("is-dragging");
            try { root.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
        });
        const endDrag = () => { drag = null; root.classList.remove("is-dragging"); };
        root.addEventListener("pointerup", endDrag);
        root.addEventListener("pointercancel", endDrag);
        nodes.forEach((el, i) => {
            el.addEventListener("pointerenter", () => { hoverNode = i; });
            el.addEventListener("pointerleave", () => { hoverNode = -1; });
            el.addEventListener("focus", () => { hoverNode = i; draw(); });
            el.addEventListener("blur", () => { hoverNode = -1; });
        });
        if ("IntersectionObserver" in window) {
            new IntersectionObserver(en => { visible = en[0].isIntersecting; }).observe(root);
        }

        draw();
        if (animated) requestAnimationFrame(frame);
        else window.addEventListener("resize", draw);
    }

    function renderHero(sections) {
        const p = P();
        const ctas = list(p.ctas).map(c =>
            `<a href="${esc(safeUrl(c.url))}"${ext(c.url)} class="btn ${c.style === "primary" ? "btn-primary" : "btn-ghost"}">
                ${c.style === "primary" ? "" : icon(c.icon)}<span>${esc(c.label)}</span>${c.style === "primary" ? icon(c.icon) : ""}
            </a>`).join("");
        const launcher = sections.map((s, i) =>
            `<a href="#${esc(s.id)}" class="launch-tile" style="--i:${i}">
                <span class="launch-icon">${icon(s.icon)}</span><span class="launch-label">${esc(s.label)}</span>
            </a>`).join("") + (p.resume ? `<a href="${esc(safeUrl(p.resume))}" class="launch-tile" download style="--i:${sections.length}">
                <span class="launch-icon">${icon("fas fa-file-arrow-down")}</span><span class="launch-label">Resume</span></a>` : "");

        return `<section id="home" class="view hero" data-view="home">
            <div class="container hero-grid">
                <div class="hero-copy">
                    ${p.available ? `<div class="status-badge reveal"><span class="status-dot"></span>${esc(p.availableText || "Available")}</div>` : ""}
                    <p class="hero-hello reveal" style="--i:1">Hello, I'm</p>
                    <h1 class="hero-name reveal" style="--i:2"><span>${esc(p.firstName)}</span> <span class="name-dim">${esc(p.lastName)}</span></h1>
                    <div class="hero-role reveal" style="--i:3"><span class="role-prompt">~/</span><span id="typed"></span><span class="caret"></span></div>
                    <p class="hero-bio reveal" style="--i:4">${md(p.bio)}</p>
                    <div class="hero-ctas reveal" style="--i:5">${ctas}</div>
                    <div class="hero-socials reveal" style="--i:6">${socialLinks()}</div>
                </div>
                <div class="hero-visual reveal" style="--i:2">${renderSphere()}</div>
            </div>
            <div class="container launcher">
                <p class="launcher-title">Explore</p>
                <div class="launcher-grid">${launcher}</div>
            </div>
            ${sections[0] ? `<a href="#${esc(sections[0].id)}" class="scroll-cue" aria-label="Scroll down"><span class="mouse"><i></i></span></a>` : ""}
        </section>`;
    }

    function wrapSection(s, n, body) {
        return `<section id="${esc(s.id)}" class="view section section-${esc(s.id)}" data-view="${esc(s.id)}">
            <div class="container">
                <header class="section-head reveal">
                    <span class="kicker"><span class="kicker-num">${String(n + 1).padStart(2, "0")}</span><span class="kicker-line"></span>${esc(s.kicker || s.label)}</span>
                    <h2 class="section-title">${esc(s.title || s.label)}</h2>
                </header>
                ${body}
            </div>
        </section>`;
    }

    const R = {};

    R.about = () => {
        const a = C.about || {};
        const paras = list(a.paragraphs).map(t => `<p>${md(t)}</p>`).join("");
        const tags = list(a.tags).map(t => `<span class="chip">${icon(t.icon)}${esc(t.text)}</span>`).join("");
        const nums = list(C.numbers).map((n, i) => {
            const live = n.source && n.source !== "static";
            return `<div class="num-tile glass spot reveal${live ? " is-loading" : ""}" style="--i:${i}"${live ? ` data-src="${esc(n.source.split(".")[0])}"` : ""}>
                <span class="num-value" data-target="${esc(n.value || (live ? "—" : "0"))}"${live ? ` data-live="${esc(n.source)}"` : ""}>${esc(n.value || "—")}</span>
                <span class="num-label">${esc(n.label)}</span>
                ${live ? '<span class="live-pip" title="Live data"></span>' : ""}
            </div>`;
        }).join("");
        if (!paras && !nums) return "";
        return `<div class="about-grid">
            <div class="about-copy glass spot reveal">
                ${paras}
                ${tags ? `<div class="chips">${tags}</div>` : ""}
            </div>
            ${nums ? `<div class="num-grid">${nums}</div>` : ""}
        </div>`;
    };

    R.skills = () => {
        const cards = list(C.skills).map((s, i) => `
            <article class="skill-card glass spot reveal" style="--i:${i}">
                <div class="skill-top">
                    <span class="orb-icon">${icon(s.icon)}</span>
                    <span class="skill-count">${list(s.items).length} skills</span>
                </div>
                <h3>${esc(s.title)}</h3>
                <div class="pills">${list(s.items).map(t => `<span class="pill">${esc(t)}</span>`).join("")}</div>
            </article>`).join("");
        return cards ? `<div class="skills-grid">${cards}</div>` : "";
    };

    R.stats = () => {
        const ig = C.integrations || {};
        const cards = [];
        if (ig.codeforces) {
            cards.push(`<article class="live-card glass spot reveal is-loading" data-src="codeforces">
                <div class="live-head">
                    <span class="orb-icon">${icon("si:codeforces")}</span>
                    <div><h3>Codeforces</h3><a href="https://codeforces.com/profile/${esc(encodeURIComponent(ig.codeforces))}" target="_blank" rel="noopener" class="handle">@${esc(ig.codeforces)}</a></div>
                    <span class="live-badge"><span class="live-pip"></span>Live</span>
                </div>
                <div class="cf-body">
                    <div class="gauge" data-cf-gauge>
                        <svg viewBox="0 0 120 120" aria-hidden="true">
                            <circle cx="60" cy="60" r="52" class="gauge-track"/>
                            <circle cx="60" cy="60" r="52" class="gauge-fill" pathLength="100"/>
                        </svg>
                        <div class="gauge-center">
                            <span class="gauge-value" data-live="codeforces.rating" data-target="—">—</span>
                            <span class="gauge-label">Rating</span>
                        </div>
                    </div>
                    <div class="live-stats">
                        <div><span class="lv" data-live="codeforces.maxRating" data-target="—">—</span><span class="ll">Max rating</span></div>
                        <div><span class="lv rank" data-live="codeforces.rankLabel">—</span><span class="ll">Rank</span></div>
                        <div><span class="lv" data-live="codeforces.contests" data-target="—">—</span><span class="ll">Contests</span></div>
                        <div><span class="lv small" data-live="codeforces.next">—</span><span class="ll">Next milestone</span></div>
                    </div>
                </div>
            </article>`);
        }
        if (ig.github) {
            cards.push(`<article class="live-card glass spot reveal is-loading" data-src="github" style="--i:1">
                <div class="live-head">
                    <span class="orb-icon">${icon("fab fa-github")}</span>
                    <div><h3>GitHub</h3><a href="https://github.com/${esc(encodeURIComponent(ig.github))}" target="_blank" rel="noopener" class="handle">@${esc(ig.github)}</a></div>
                    <span class="live-badge"><span class="live-pip"></span>Live</span>
                </div>
                <div class="gh-nums">
                    <div><span class="lv" data-live="github.repos" data-target="—">—</span><span class="ll">Repos</span></div>
                    <div><span class="lv" data-live="github.stars" data-target="—">—</span><span class="ll">Stars</span></div>
                    <div><span class="lv" data-live="github.followers" data-target="—">—</span><span class="ll">Followers</span></div>
                </div>
                <div class="langs" data-gh-langs><span class="ll">Top languages</span><div class="lang-bar"><span style="width:100%"></span></div><div class="lang-legend"></div></div>
            </article>`);
        }
        return cards.length ? `<div class="stats-grid">${cards.join("")}</div>` : "";
    };

    R.projects = () => {
        const items = list(C.projects);
        if (!items.length) return "";
        // filter chips only for tags shared by 2+ projects, most common first (keeps the bar short)
        const counts = new Map();
        items.forEach(p => new Set(list(p.tags).map(t => t.toLowerCase())).forEach(k => counts.set(k, (counts.get(k) || 0) + 1)));
        const label = new Map();
        items.flatMap(p => list(p.tags)).forEach(t => { if (!label.has(t.toLowerCase())) label.set(t.toLowerCase(), t); });
        const tags = [...counts].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]).map(([k]) => label.get(k));
        const chips = tags.length > 1 ? `<div class="filters no-swipe reveal" aria-label="Filter projects">
            <button class="filter is-on" data-filter="*" aria-pressed="true">All</button>
            ${tags.map(t => `<button class="filter" data-filter="${esc(t.toLowerCase())}" aria-pressed="false">${esc(t)}</button>`).join("")}
        </div>` : "";
        // featured first (wide "bento" cards), then the rest in their saved order
        const ordered = items.filter(p => p.featured).concat(items.filter(p => !p.featured));
        const MAX_TAGS = 4, COLLAPSE_AFTER = 9, SHOW = 6;
        const cards = ordered.map((p, i) => {
            const primary = p.live || p.github;
            const repo = (String(p.github || "").match(/github\.com\/([^/]+\/[^/#?]+)/i) || [])[1];
            const allTags = list(p.tags);
            const shown = allTags.slice(0, MAX_TAGS), more = allTags.slice(MAX_TAGS);
            const extra = ordered.length > COLLAPSE_AFTER && i >= SHOW ? " is-extra" : "";
            const addr = (() => {
                try { const u = new URL(p.live || p.github); return (u.host + u.pathname).replace(/\/$/, ""); }
                catch (e) { return String(p.title || "").toLowerCase().replace(/\s+/g, "-"); }
            })();
            const banner = p.banner ? esc(safeUrl(p.banner)) : "";
            return `
            <article class="project glass spot tilt reveal${p.featured ? " is-featured" : ""}${extra}" style="--i:${i % 3}" data-tags="${esc(allTags.map(t => t.toLowerCase()).join("|"))}">
                <div class="project-art">
                    <div class="mac">
                        <div class="mac-bar">
                            <span class="mac-dots" aria-hidden="true"><i></i><i></i><i></i></span>
                            <span class="mac-url"><i class="fas fa-lock" aria-hidden="true"></i><span>${esc(addr)}</span></span>
                        </div>
                        <div class="mac-view${banner ? "" : " no-banner"}">
                            <span class="p-icon">${icon(p.icon || "fas fa-folder")}</span>
                            ${banner ? `<img class="mac-bg" src="${banner}" alt="" aria-hidden="true" loading="lazy" decoding="async">
                            <img class="mac-img" src="${banner}" alt="${esc(p.title)} preview" loading="lazy" decoding="async">` : ""}
                        </div>
                    </div>
                </div>
                <div class="project-body">
                    ${p.featured ? '<span class="p-badge"><i class="fas fa-star"></i> Featured</span>' : ""}
                    <h3>${primary ? `<a href="${esc(safeUrl(primary))}"${ext(primary)} class="p-link">${esc(p.title)}</a>` : esc(p.title)}</h3>
                    ${repo ? `<div class="p-meta" data-repo="${esc(repo.toLowerCase().replace(/\.git$/, ""))}"></div>` : ""}
                    <p class="p-desc">${md(p.desc)}</p>
                    ${allTags.length ? `<div class="tags">${shown.map(t => `<span>${esc(t)}</span>`).join("")}${more.length ? `<span class="tag-more" title="${esc(more.join(", "))}">+${more.length}</span>` : ""}</div>` : ""}
                    <div class="project-links">
                        ${p.github ? `<a href="${esc(safeUrl(p.github))}" target="_blank" rel="noopener" class="icon-btn" aria-label="${esc(p.title)} source code" title="Source code">${icon("fab fa-github")}</a>` : "<span></span>"}
                        ${p.live ? `<a href="${esc(safeUrl(p.live))}" target="_blank" rel="noopener" class="link-arrow">Live demo ${icon("fas fa-arrow-up-right-from-square")}</a>` : ""}
                    </div>
                </div>
            </article>`;
        }).join("");
        const hidden = ordered.length > COLLAPSE_AFTER ? ordered.length - SHOW : 0;
        const gh = (C.integrations || {}).github;
        return `${chips}<div class="projects-grid${hidden ? " is-collapsed" : ""}">${cards}</div>
            <div class="center reveal more-row">
                ${hidden ? `<button class="btn btn-ghost" data-expand><i class="fas fa-chevron-down"></i><span>Show ${hidden} more</span></button>` : ""}
                ${gh ? `<a href="https://github.com/${esc(encodeURIComponent(gh))}" target="_blank" rel="noopener" class="btn btn-ghost">${icon("fab fa-github")}<span>View all on GitHub</span></a>` : ""}
            </div>`;
    };

    R.achievements = () => {
        const items = list(C.achievements);
        if (!items.length) return "";
        const years = [...new Set(items.map(a => a.year).filter(Boolean))];
        const hasHack = items.some(a => a.type === "hackathon");
        const hasContest = items.some(a => a.type !== "hackathon");
        const typeChips = hasHack && hasContest
            ? `<button class="filter" data-filter="contest"><i class="fas fa-trophy"></i>Contests</button><button class="filter" data-filter="hackathon"><i class="fas fa-laptop-code"></i>Hackathons</button>` : "";
        const yearChips = years.length > 1 ? years.map(y => `<button class="filter" data-filter="${esc(y)}">${esc(y)}</button>`).join("") : "";
        const chips = typeChips || yearChips ? `<div class="filters no-swipe reveal" aria-label="Filter achievements">
            <button class="filter is-on" data-filter="*" aria-pressed="true">All</button>${typeChips}${yearChips}
        </div>` : "";
        const rows = items.map((a, i) => {
            const hack = a.type === "hackathon";
            const bits = [
                a.team ? `Team <strong>${esc(a.team)}</strong>` : "",
                hack && a.role ? `Role <strong>${esc(a.role)}</strong>` : "",
                hack && a.project ? `Built <strong>${esc(a.project)}</strong>` : "",
                esc(a.note)
            ].filter(Boolean).join(" · ");
            const badge = hack && a.award
                ? `<div class="rank rank-award"><i class="fas fa-award"></i><strong>${esc(a.award)}</strong></div>`
                : a.rank ? `<div class="rank${/^\d+$/.test(a.rank) && +a.rank <= 30 ? " rank-top" : ""}"><span>Rank</span><strong>${esc(a.rank)}</strong></div>` : "";
            return `
            <li class="trail-item reveal${hack ? " is-hack" : ""}${i >= 5 ? " is-extra" : ""}" style="--i:${i % 4}" data-tags="${esc(a.year)}|${hack ? "hackathon" : "contest"}">
                <span class="trail-node"></span>
                <div class="trail-card glass spot">
                    <div class="trail-main">
                        <span class="trail-year">${hack ? '<span class="type-tag"><i class="fas fa-laptop-code"></i>Hackathon</span>' : ""}${esc(a.year)}</span>
                        <h3>${esc(a.title)}</h3>
                        ${bits ? `<p>${bits}</p>` : ""}
                        ${hack && a.link ? `<a href="${esc(safeUrl(a.link))}"${ext(a.link)} class="link-arrow">View project ${icon("fas fa-arrow-up-right-from-square")}</a>` : ""}
                    </div>
                    ${badge}
                </div>
            </li>`;
        }).join("");
        const SHOW = 5, hidden = items.length > SHOW + 1 ? items.length - SHOW : 0;
        return `${chips}<ol class="trail${hidden ? " is-collapsed" : ""}">${rows}</ol>
            ${hidden ? `<div class="center reveal more-row"><button class="btn btn-ghost" data-expand><i class="fas fa-chevron-down"></i><span>Show ${hidden} more</span></button></div>` : ""}`;
    };

    R.education = () => {
        const items = list(C.education);
        if (!items.length) return "";
        return `<div class="edu-grid">${items.map((e, i) => `
            <article class="edu-card glass spot reveal" style="--i:${i}">
                <div class="edu-top">
                    <span class="orb-icon">${icon(e.icon || "fas fa-graduation-cap")}</span>
                    ${e.badge ? `<span class="badge">${esc(e.badge)}</span>` : ""}
                </div>
                <span class="edu-period">${esc(e.period)}</span>
                <h3>${esc(e.degree)}</h3>
                <p>${esc(e.school)}</p>
            </article>`).join("")}</div>`;
    };

    R.contact = () => {
        const c = C.contact || {}, p = P();
        const rows = [];
        if (p.email) rows.push(`<div class="contact-row glass spot">
            <span class="orb-icon sm">${icon("fas fa-envelope")}</span>
            <a href="mailto:${esc(p.email)}" class="contact-val"><span class="ll">Email</span><span>${esc(p.email)}</span></a>
            <button class="icon-btn" data-copy="${esc(p.email)}" aria-label="Copy email"><i class="far fa-copy"></i></button>
        </div>`);
        if (p.phone) rows.push(`<div class="contact-row glass spot">
            <span class="orb-icon sm">${icon("fas fa-phone")}</span>
            <a href="tel:${esc(p.phone.replace(/\s+/g, ""))}" class="contact-val"><span class="ll">Phone</span><span>${esc(p.phone)}</span></a>
            <button class="icon-btn" data-copy="${esc(p.phone)}" aria-label="Copy phone"><i class="far fa-copy"></i></button>
        </div>`);
        if (p.location) rows.push(`<div class="contact-row glass spot">
            <span class="orb-icon sm">${icon("fas fa-location-dot")}</span>
            <div class="contact-val"><span class="ll">Based in</span><span>${esc(p.location)}</span></div>
        </div>`);
        const form = c.form !== false && p.email ? `
            <form class="contact-form glass reveal" style="--i:1" id="contactForm" novalidate>
                <div class="form-title"><span class="orb-icon sm">${icon("fas fa-pen-to-square")}</span><div><h3>Send a message</h3><p>Opens your mail app with everything filled in.</p></div></div>
                <label class="field"><span>Your name</span><input name="name" required autocomplete="name" placeholder="Jane Doe"></label>
                <label class="field"><span>Your email</span><input name="email" type="email" required autocomplete="email" placeholder="jane@example.com"></label>
                <label class="field"><span>Message</span><textarea name="message" rows="4" required placeholder="Tell me about your idea…"></textarea></label>
                <button class="btn btn-primary btn-block" type="submit"><span>Send message</span><i class="fas fa-paper-plane"></i></button>
            </form>` : `<div class="contact-form glass reveal center-col">
                <a href="mailto:${esc(p.email || "")}" class="btn btn-primary"><span>Say hello</span><i class="fas fa-paper-plane"></i></a>
                <div class="hero-socials">${socialLinks()}</div>
            </div>`;
        return `<div class="contact-grid">
            <div class="contact-info reveal">
                <h3 class="contact-heading">${esc(c.heading)}</h3>
                <p class="contact-text">${md(c.text)}</p>
                <div class="contact-rows">${rows.join("")}</div>
                <div class="hero-socials">${socialLinks()}</div>
            </div>
            ${form}
        </div>`;
    };

    /* =====================================================
       NAV / TABBAR / SHEET / FOOTER
    ===================================================== */
    function renderChrome() {
        const p = P();
        const sections = VIEWS.slice(1);
        $("#brandText").textContent = p.brand || (p.firstName || "Portfolio").split(" ").pop().toUpperCase();
        $("#topnavLinks").innerHTML = sections.map(s =>
            `<a href="#${esc(s.id)}" data-nav="${esc(s.id)}">${esc(s.label)}</a>`
        ).join("") + '<span class="nav-pill" id="navPill"></span>';

        ["#navResume", "#appbarResume"].forEach(sel => {
            const el = $(sel);
            el.hidden = !p.resume;
            if (p.resume) el.setAttribute("href", p.resume);
        });
        const av = $("#appbarAvatarImg");
        av.src = p.avatar || "img/avatar.webp";
        av.alt = fullName();

        // Tab bar: Home + flagged sections (max 3) + More
        let tabs = sections.filter(s => s.tab).slice(0, 3);
        let rest = sections.filter(s => !tabs.includes(s));
        if (rest.length === 1 && tabs.length < 4) { tabs.push(rest[0]); rest = []; }
        const tabHtml = [VIEWS[0], ...tabs].map(s =>
            `<button class="tab" data-go="${esc(s.id)}" aria-label="${esc(s.label)}">
                <span class="tab-icon">${icon(s.icon)}</span><span class="tab-label">${esc(s.label)}</span>
            </button>`).join("");
        const moreHtml = rest.length ? `<button class="tab" data-more aria-label="More">
                <span class="tab-icon"><i class="fas fa-grip"></i></span><span class="tab-label">More</span>
            </button>` : "";
        $("#tabbar").innerHTML = `<div class="tabbar-inner">${tabHtml}${moreHtml}</div>`;
        $("#tabbar").dataset.rest = rest.map(s => s.id).join(",");

        $("#moreSheetBody").innerHTML = `
            <div class="sheet-profile">
                <img src="${esc(p.avatar || "img/avatar.webp")}" alt="">
                <div><strong>${esc(fullName())}</strong><span>${esc(list(p.roles)[0] || "")}</span></div>
            </div>
            <div class="sheet-grid">${rest.map(s =>
                `<button class="sheet-item" data-go="${esc(s.id)}"><span class="launch-icon">${icon(s.icon)}</span><span>${esc(s.label)}</span></button>`
            ).join("")}${p.resume ? `<a class="sheet-item" href="${esc(p.resume)}" download><span class="launch-icon"><i class="fas fa-file-arrow-down"></i></span><span>Resume</span></a>` : ""}</div>
            <div class="hero-socials sheet-socials">${socialLinks()}</div>
            <p class="sheet-foot">© ${new Date().getFullYear()} ${esc(fullName())}</p>`;

        $("#footer").innerHTML = `<div class="container footer-inner">
            <a href="#home" class="brand"><span class="brand-mark"><img src="img/favicon.svg" alt="" width="32" height="32"></span><span class="brand-text">${esc($("#brandText").textContent)}</span></a>
            <p>© ${new Date().getFullYear()} <strong>${esc(fullName())}</strong>. ${esc((C.footer || {}).text || "")}</p>
            <div class="hero-socials">${socialLinks()}</div>
        </div>`;
    }

    /* =====================================================
       RENDER ALL
    ===================================================== */
    function renderAll() {
        applyTheme();
        applyMeta();
        const bodies = [];
        list(C.sections).forEach(s => {
            if (s.visible === false || !R[s.id]) return;
            const body = R[s.id](s);
            if (body) bodies.push({ s, body });
        });
        const sections = bodies.map(b => b.s);
        VIEWS = [{ id: "home", label: "Home", icon: "fas fa-house", kicker: "Portfolio", title: "Home" }, ...sections];
        app.innerHTML = renderHero(sections) + bodies.map((b, i) => wrapSection(b.s, i, b.body)).join("");
        renderChrome();
        observeReveal();
        startTyping();
        startSphere();
        bindBanners();
        applyLive();
        if (!VIEWS.some(v => v.id === activeView)) activeView = "home";
        if (appMode) showView(activeView, null);
        else updateScrollUI();
    }

    function bindBanners() {
        $$(".mac-img").forEach(img => {
            const view = img.parentElement;
            const done = () => {
                if (!img.naturalWidth) { view.classList.add("no-banner"); return; }
                const r = img.naturalWidth / img.naturalHeight;
                const v = view.clientWidth && view.clientHeight ? view.clientWidth / view.clientHeight : 2;
                view.classList.toggle("is-wide", r > v * 1.3);
                view.classList.add("is-loaded");
            };
            if (img.complete) done();
            else {
                img.addEventListener("load", done, { once: true });
                img.addEventListener("error", () => view.classList.add("no-banner"), { once: true });
            }
        });
    }

    /* =====================================================
       TYPING EFFECT
    ===================================================== */
    function startTyping() {
        const token = ++typingToken;
        const el = $("#typed");
        const roles = list(P().roles).filter(Boolean);
        if (!el || !roles.length) return;
        if (reducedMotion.matches || (C.theme || {}).motion === false) { el.textContent = roles[0]; return; }
        let ri = 0, ci = 0, del = false;
        const tick = () => {
            if (token !== typingToken) return;
            const cur = roles[ri];
            ci += del ? -1 : 1;
            el.textContent = cur.slice(0, ci);
            let d = del ? 45 : 95;
            if (!del && ci === cur.length) { del = true; d = 1900; }
            else if (del && ci === 0) { del = false; ri = (ri + 1) % roles.length; d = 350; }
            setTimeout(tick, d);
        };
        setTimeout(tick, 700);
    }

    /* =====================================================
       REVEAL + COUNTERS
    ===================================================== */
    function countUp(el) {
        const target = el.dataset.target;
        if (target == null) return;
        if (!/^\d+$/.test(target) || reducedMotion.matches || PREVIEW) { el.textContent = target; return; }
        const end = parseInt(target, 10), dur = 1300;
        let start = null;
        const step = ts => {
            if (start === null) start = ts;
            const t = Math.min((ts - start) / dur, 1);
            el.textContent = Math.round(end * (1 - Math.pow(1 - t, 3)));
            if (t < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }

    const isRevealed = el => PREVIEW || !el.closest(".reveal") || el.closest(".reveal").classList.contains("in");

    function setValue(el, v) {
        if (el.hasAttribute("data-target")) {
            el.dataset.target = v;
            if (isRevealed(el)) countUp(el);
            else el.textContent = /^\d+$/.test(String(v)) ? "0" : v;
        } else {
            el.textContent = v;
        }
    }

    function observeReveal() {
        if (revealObserver) revealObserver.disconnect();
        const els = $$(".reveal");
        if (PREVIEW || !("IntersectionObserver" in window)) {
            els.forEach(el => el.classList.add("in"));
            return;
        }
        revealObserver = new IntersectionObserver(entries => {
            entries.forEach(en => {
                if (!en.isIntersecting) return;
                en.target.classList.add("in");
                $$("[data-target]", en.target).forEach(countUp);
                revealObserver.unobserve(en.target);
            });
        }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
        els.forEach(el => revealObserver.observe(el));
    }

    /* =====================================================
       LIVE DATA (Codeforces + GitHub) with session cache
    ===================================================== */
    const CF_TIERS = [
        [0, "Newbie", "#a3a9b8"], [1200, "Pupil", "#4ade80"], [1400, "Specialist", "#2dd4bf"],
        [1600, "Expert", "#60a5fa"], [1900, "Candidate Master", "#c084fc"], [2100, "Master", "#fb923c"],
        [2300, "International Master", "#fb923c"], [2400, "Grandmaster", "#f87171"],
        [2600, "International Grandmaster", "#f87171"], [3000, "Legendary Grandmaster", "#ef4444"]
    ];

    async function getJSON(url) {
        const r = await fetch(url);
        if (!r.ok) throw new Error(r.status);
        return r.json();
    }

    async function cached(key, fetcher, ttl = 20 * 60 * 1000) {
        try {
            const raw = sessionStorage.getItem(key);
            if (raw) {
                const o = JSON.parse(raw);
                if (Date.now() - o.t < ttl) return o.d;
            }
        } catch (e) { /* noop */ }
        const d = await fetcher();
        try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), d })); } catch (e) { /* noop */ }
        return d;
    }

    function loadLive() {
        const ig = C.integrations || {};
        if (ig.codeforces) {
            const h = encodeURIComponent(ig.codeforces);
            cached("cf:" + ig.codeforces, async () => {
                const [info, hist] = await Promise.all([
                    getJSON(`https://codeforces.com/api/user.info?handles=${h}`),
                    getJSON(`https://codeforces.com/api/user.rating?handle=${h}`).catch(() => null)
                ]);
                if (info.status !== "OK") throw new Error("cf");
                const u = info.result[0];
                return {
                    rating: u.rating != null ? String(u.rating) : "—",
                    maxRating: u.maxRating != null ? String(u.maxRating) : "—",
                    contests: hist && hist.status === "OK" ? String(hist.result.length) : "—"
                };
            }).then(d => {
                const r = parseInt(d.rating, 10);
                let tier = CF_TIERS[0], next = null;
                if (!isNaN(r)) {
                    CF_TIERS.forEach((t, i) => { if (r >= t[0]) { tier = t; next = CF_TIERS[i + 1] || null; } });
                }
                LIVE.codeforces = Object.assign({}, d, {
                    rankLabel: isNaN(r) ? "Unrated" : tier[1],
                    rankColor: tier[2],
                    next: isNaN(r) ? "First contest" : next ? `+${next[0] - r} → ${next[1]}` : "Top tier",
                    progress: isNaN(r) ? 0 : next ? (r - tier[0]) / (next[0] - tier[0]) : 1
                });
                applyLive();
            }).catch(() => liveFailed("codeforces"));
        }
        if (ig.github) {
            const u = encodeURIComponent(ig.github);
            cached("gh2:" + ig.github, async () => {
                const [user, repos] = await Promise.all([
                    getJSON(`https://api.github.com/users/${u}`),
                    getJSON(`https://api.github.com/users/${u}/repos?per_page=100&type=owner`).catch(() => [])
                ]);
                const langs = {}, meta = {};
                let stars = 0;
                list(repos).forEach(r => {
                    stars += r.stargazers_count || 0;
                    meta[String(r.full_name).toLowerCase()] = { stars: r.stargazers_count || 0, lang: r.language || "", pushed: r.pushed_at };
                    if (r.language && !r.fork) langs[r.language] = (langs[r.language] || 0) + 1;
                });
                return {
                    repos: String(user.public_repos ?? "—"),
                    followers: String(user.followers ?? "—"),
                    stars: String(stars),
                    langs: Object.entries(langs).sort((a, b) => b[1] - a[1]).slice(0, 5),
                    meta
                };
            }).then(d => { LIVE.github = d; applyLive(); }).catch(() => liveFailed("github"));
        }
    }

    const LANG_COLORS = ["#fafafa", "var(--accent)", "#a1a1aa", "#71717a", "#52525b"];

    function liveFailed(src) {
        $$(`[data-src="${src}"]`).forEach(el => el.classList.remove("is-loading"));
    }

    function ago(date) {
        const d = (Date.now() - new Date(date).getTime()) / 86400000;
        if (d < 1) return "today";
        if (d < 2) return "yesterday";
        if (d < 30) return Math.floor(d) + " days ago";
        if (d < 365) return Math.floor(d / 30) + (Math.floor(d / 30) === 1 ? " month ago" : " months ago");
        return Math.floor(d / 365) + (Math.floor(d / 365) === 1 ? " year ago" : " years ago");
    }

    function applyLive() {
        Object.keys(LIVE).forEach(liveFailed);
        const metaMap = LIVE.github && LIVE.github.meta;
        if (metaMap) {
            $$(".p-meta[data-repo]").forEach(el => {
                const m = metaMap[el.dataset.repo];
                if (!m) return;
                el.innerHTML = [
                    m.lang ? `<span><i class="lang-dot"></i>${esc(m.lang)}</span>` : "",
                    m.stars ? `<span><i class="far fa-star"></i>${m.stars}</span>` : "",
                    m.pushed ? `<span><i class="far fa-clock"></i>Updated ${ago(m.pushed)}</span>` : ""
                ].join("");
                el.classList.add("is-on");
            });
        }
        $$("[data-live]").forEach(el => {
            const [src, key] = el.dataset.live.split(".");
            const v = LIVE[src] && LIVE[src][key];
            if (v != null) setValue(el, v);
        });
        const cf = LIVE.codeforces;
        if (cf) {
            $$("[data-cf-gauge]").forEach(g => {
                g.style.setProperty("--rank", cf.rankColor);
                const p = Math.max(0.03, Math.min(1, cf.progress));
                const fill = $(".gauge-fill", g);
                requestAnimationFrame(() => { fill.style.strokeDashoffset = (100 - p * 100).toFixed(1); });
            });
            $$('[data-live="codeforces.rankLabel"]').forEach(el => el.style.color = cf.rankColor);
        }
        const gh = LIVE.github;
        if (gh && gh.langs && gh.langs.length) {
            const total = gh.langs.reduce((s, l) => s + l[1], 0);
            $$("[data-gh-langs]").forEach(box => {
                $(".lang-bar", box).innerHTML = gh.langs.map((l, i) =>
                    `<span style="width:${(l[1] / total * 100).toFixed(1)}%;background:${LANG_COLORS[i]}"></span>`).join("");
                $(".lang-legend", box).innerHTML = gh.langs.map((l, i) =>
                    `<span><i style="background:${LANG_COLORS[i]}"></i>${esc(l[0])}</span>`).join("");
            });
        }
    }

    /* =====================================================
       DESKTOP: scroll spy, progress, nav pill
    ===================================================== */
    let scrollTicking = false;
    function updateScrollUI() {
        scrollTicking = false;
        const y = window.scrollY;
        const max = document.documentElement.scrollHeight - window.innerHeight;
        $("#scrollProgress").style.transform = `scaleX(${max > 0 ? y / max : 0})`;
        $("#topnav").classList.toggle("is-scrolled", y > 30);
        $("#toTop").classList.toggle("is-visible", !appMode && y > 700);
        if (appMode) return;
        let current = "home";
        const line = window.innerHeight * 0.35;
        VIEWS.forEach(v => {
            const el = document.getElementById(v.id);
            if (el && el.getBoundingClientRect().top <= line) current = v.id;
        });
        if (y + window.innerHeight >= document.documentElement.scrollHeight - 4 && VIEWS.length) current = VIEWS[VIEWS.length - 1].id;
        setNavActive(current);
    }

    function setNavActive(id) {
        activeView = id;
        const pill = $("#navPill");
        let found = null;
        $$("#topnavLinks a").forEach(a => {
            const on = a.dataset.nav === id;
            a.classList.toggle("is-active", on);
            if (on) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
            if (on) found = a;
        });
        if (pill) {
            if (found) {
                pill.style.opacity = "1";
                pill.style.width = found.offsetWidth + "px";
                pill.style.transform = `translateX(${found.offsetLeft}px)`;
            } else pill.style.opacity = "0";
        }
    }

    window.addEventListener("scroll", () => {
        if (!scrollTicking) { scrollTicking = true; requestAnimationFrame(updateScrollUI); }
    }, { passive: true });
    window.addEventListener("resize", () => setNavActive(activeView));

    function scrollToId(id) {
        const el = document.getElementById(id);
        if (!el) return;
        if (id === "home") window.scrollTo({ top: 0, behavior: reducedMotion.matches ? "auto" : "smooth" });
        else el.scrollIntoView({ behavior: reducedMotion.matches ? "auto" : "smooth", block: "start" });
    }

    /* =====================================================
       MOBILE APP MODE: views, tabs, swipe, sheet
    ===================================================== */
    const scrollMem = {};
    function showView(id, dir) {
        const view = VIEWS.find(v => v.id === id) || VIEWS[0];
        if (dir) scrollMem[activeView] = window.scrollY;
        id = view.id;
        activeView = id;
        $$(".view").forEach(sec => {
            const on = sec.dataset.view === id;
            sec.classList.toggle("is-active", on);
            sec.classList.remove("enter-left", "enter-right", "enter-up");
            if (on && dir) {
                void sec.offsetWidth;
                sec.classList.add(dir === 1 ? "enter-right" : dir === -1 ? "enter-left" : "enter-up");
            }
        });
        window.scrollTo({ top: dir ? (scrollMem[id] || 0) : 0, behavior: "instant" });
        const rest = ($("#tabbar").dataset.rest || "").split(",");
        $$("#tabbar .tab").forEach(t => {
            const on = t.dataset.go === id || (t.hasAttribute("data-more") && rest.includes(id));
            t.classList.toggle("is-active", on);
        });
        const title = $("#appbarTitle"), kicker = $("#appbarKicker");
        title.textContent = id === "home" ? fullName() || "Home" : (view.title || view.label);
        kicker.textContent = id === "home" ? "Portfolio" : (view.kicker || view.label);
        $("#appbar").classList.remove("title-anim");
        void title.offsetWidth;
        $("#appbar").classList.add("title-anim");
    }

    function go(id, push) {
        if (!VIEWS.some(v => v.id === id)) return;
        closeSheet();
        if (!appMode) { scrollToId(id); if (push) history.replaceState(null, "", "#" + id); return; }
        if (id === activeView) { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
        const from = VIEWS.findIndex(v => v.id === activeView);
        const to = VIEWS.findIndex(v => v.id === id);
        showView(id, to > from ? 1 : -1);
        if (push) history.pushState({ view: id }, "", "#" + id);
    }

    function setMode() {
        const next = appMQ.matches;
        if (next === appMode && document.documentElement.classList.contains("mode-set")) return;
        const prev = activeView;
        appMode = next;
        document.documentElement.classList.toggle("app-mode", appMode);
        document.documentElement.classList.add("mode-set");
        if (appMode) showView(prev, null);
        else {
            $$(".view").forEach(s => s.classList.remove("is-active", "enter-left", "enter-right", "enter-up"));
            requestAnimationFrame(() => { scrollToId(prev); updateScrollUI(); });
        }
    }

    const sheet = $("#moreSheet");
    function openSheet() {
        sheet.classList.add("is-open");
        sheet.setAttribute("aria-hidden", "false");
        document.documentElement.classList.add("sheet-open");
    }
    function closeSheet() {
        if (!sheet.classList.contains("is-open")) return;
        sheet.classList.remove("is-open");
        sheet.setAttribute("aria-hidden", "true");
        document.documentElement.classList.remove("sheet-open");
        $(".sheet-panel", sheet).style.transform = "";
    }

    // Drag sheet down to dismiss
    (function () {
        const panel = $(".sheet-panel", sheet);
        let y0 = null, dy = 0;
        panel.addEventListener("touchstart", e => {
            if (panel.scrollTop > 0) return;
            y0 = e.touches[0].clientY; dy = 0;
            panel.style.transition = "none";
        }, { passive: true });
        panel.addEventListener("touchmove", e => {
            if (y0 === null) return;
            dy = Math.max(0, e.touches[0].clientY - y0);
            panel.style.transform = `translateY(${dy}px)`;
        }, { passive: true });
        panel.addEventListener("touchend", () => {
            if (y0 === null) return;
            panel.style.transition = "";
            if (dy > 90) closeSheet(); else panel.style.transform = "";
            y0 = null;
        });
    })();

    // Horizontal swipe between views
    (function () {
        let sx = 0, sy = 0, st = 0, track = false;
        app.addEventListener("touchstart", e => {
            if (!appMode || e.touches.length > 1 || e.target.closest(".no-swipe, input, textarea")) { track = false; return; }
            track = true;
            sx = e.touches[0].clientX; sy = e.touches[0].clientY; st = Date.now();
        }, { passive: true });
        app.addEventListener("touchend", e => {
            if (!track) return;
            track = false;
            const t = e.changedTouches[0];
            const dx = t.clientX - sx, dy = t.clientY - sy;
            if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.6 || Date.now() - st > 700) return;
            const idx = VIEWS.findIndex(v => v.id === activeView);
            const next = VIEWS[idx + (dx < 0 ? 1 : -1)];
            if (next) { vibrate(); go(next.id, true); }
        }, { passive: true });
    })();

    /* =====================================================
       EVENTS (delegated)
    ===================================================== */
    document.addEventListener("click", e => {
        const goBtn = e.target.closest("[data-go]");
        if (goBtn) { e.preventDefault(); vibrate(); go(goBtn.dataset.go, true); return; }
        if (e.target.closest("[data-more]")) { vibrate(); openSheet(); return; }
        if (e.target.closest("[data-close]")) { closeSheet(); return; }
        if (e.target.closest("#appbarAvatar")) { go("home", true); return; }
        if (e.target.closest("#toTop")) { window.scrollTo({ top: 0, behavior: "smooth" }); return; }

        const copy = e.target.closest("[data-copy]");
        if (copy) {
            const text = copy.dataset.copy;
            (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject())
                .then(() => {
                    toast("Copied to clipboard");
                    const i = copy.querySelector("i");
                    if (i) { i.className = "fas fa-check"; copy.classList.add("is-done"); }
                    setTimeout(() => { if (i) i.className = "far fa-copy"; copy.classList.remove("is-done"); }, 1600);
                })
                .catch(() => toast(text));
            return;
        }

        const more = e.target.closest("[data-expand]");
        if (more) { expand(more.closest(".container")); return; }

        const filter = e.target.closest(".filter");
        if (filter) {
            const box = filter.parentElement;
            $$(".filter", box).forEach(f => { f.classList.toggle("is-on", f === filter); f.setAttribute("aria-pressed", f === filter); });
            const f = filter.dataset.filter;
            const scope = box.parentElement;
            if (f !== "*") expand(scope);
            $$("[data-tags]", scope).forEach(card => {
                const show = f === "*" || card.dataset.tags.split("|").includes(f);
                card.classList.toggle("is-hidden", !show);
            });
            return;
        }

        const a = e.target.closest('a[href^="#"]');
        if (a) {
            const id = a.getAttribute("href").slice(1);
            if (VIEWS.some(v => v.id === id)) { e.preventDefault(); go(id, true); }
        }
    });

    document.addEventListener("submit", e => {
        if (e.target.id !== "contactForm") return;
        e.preventDefault();
        const f = e.target;
        if (!f.checkValidity()) { f.reportValidity(); return; }
        const name = f.name.value.trim(), from = f.email.value.trim(), msg = f.message.value.trim();
        const subject = `Portfolio inquiry from ${name}`;
        const body = `${msg}\n\n— ${name} (${from})`;
        location.href = `mailto:${P().email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        toast("Opening your mail app…");
        f.reset();
    });

    document.addEventListener("keydown", e => { if (e.key === "Escape") closeSheet(); });

    window.addEventListener("popstate", () => {
        const id = location.hash.slice(1) || "home";
        if (appMode) {
            const from = VIEWS.findIndex(v => v.id === activeView);
            const to = VIEWS.findIndex(v => v.id === id);
            closeSheet();
            showView(id, to > from ? 1 : -1);
        }
    });

    // Spotlight + tilt on cards (mouse only)
    document.addEventListener("pointermove", e => {
        if (e.pointerType !== "mouse") return;
        const card = e.target.closest(".spot");
        if (!card) return;
        const r = card.getBoundingClientRect();
        const x = e.clientX - r.left, y = e.clientY - r.top;
        card.style.setProperty("--mx", x + "px");
        card.style.setProperty("--my", y + "px");
        if (card.classList.contains("tilt") && !reducedMotion.matches) {
            const rx = ((y / r.height) - 0.5) * -6, ry = ((x / r.width) - 0.5) * 6;
            card.style.transform = `perspective(900px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) translateY(-4px)`;
        }
    }, { passive: true });
    document.addEventListener("pointerout", e => {
        const card = e.target.closest && e.target.closest(".tilt");
        if (card && !card.contains(e.relatedTarget)) card.style.transform = "";
    });

    function expand(scope) {
        if (!scope) return;
        $$(".is-collapsed", scope).forEach(el => el.classList.remove("is-collapsed"));
        $$("[data-expand]", scope).forEach(b => b.remove());
    }

    let toastTimer;
    function toast(msg) {
        const t = $("#toast");
        t.textContent = msg;
        t.classList.add("is-on");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => t.classList.remove("is-on"), 2200);
    }

    /* =====================================================
       ADMIN LIVE PREVIEW BRIDGE
    ===================================================== */
    if (PREVIEW) {
        window.addEventListener("message", e => {
            if (e.origin !== location.origin && location.origin !== "null") return;
            const d = e.data || {};
            if (d.type === "portfolio:content" && d.content) {
                const y = window.scrollY;
                C = d.content;
                renderAll();
                if (!appMode) window.scrollTo(0, y);
            } else if (d.type === "portfolio:goto" && d.id) {
                if (VIEWS.some(v => v.id === d.id)) go(d.id, false);
            }
        });
    }

    /* =====================================================
       BOOT
    ===================================================== */
    if (window.Starfield) {
        const t = C.theme || {};
        window.Starfield.init($("#starfield"), { density: t.stars || "normal", shooting: t.shootingStars !== false, motion: t.motion !== false });
    }

    const initial = location.hash.slice(1);
    if (initial) activeView = initial;
    renderAll();
    // the desktop scroll-spy in renderAll() resets activeView; restore the deep link before choosing a mode
    if (initial && VIEWS.some(v => v.id === initial)) activeView = initial;
    setMode();
    appMQ.addEventListener ? appMQ.addEventListener("change", setMode) : appMQ.addListener(setMode);
    loadLive();

    const hidePreloader = () => {
        const pl = $("#preloader");
        if (!pl || pl.classList.contains("is-done")) return;
        pl.classList.add("is-done");
        document.documentElement.classList.add("is-loaded");
        setTimeout(() => pl.remove(), 700);
        if (!appMode && initial && initial !== "home" && VIEWS.some(v => v.id === initial)) {
            setTimeout(() => scrollToId(initial), 50);
        }
    };
    if (PREVIEW) hidePreloader();
    else {
        const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
        Promise.race([fontsReady, new Promise(r => setTimeout(r, 700))]).then(() => setTimeout(hidePreloader, 60));
    }

    if ("serviceWorker" in navigator && location.protocol === "https:" && !PREVIEW) {
        window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
    }
})();
