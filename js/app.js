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
    const icon = cls => cls ? `<i class="${esc(cls)}" aria-hidden="true"></i>` : "";
    const list = a => Array.isArray(a) ? a : [];
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const appMQ = window.matchMedia("(max-width: 768px)");
    const vibrate = () => { try { navigator.vibrate && navigator.vibrate(8); } catch (e) { /* noop */ } };

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

    function renderSolar() {
        const items = list(C.orbit);
        const rings = [[], [], []];
        items.forEach((it, i) => rings[i % 3].push(it));
        const conf = [
            { dur: 26, dir: "normal", off: 20 },
            { dur: 40, dir: "reverse", off: 70 },
            { dur: 58, dir: "normal", off: 0 }
        ];
        const ringsHtml = rings.map((ring, r) => {
            const planets = ring.map((it, k) => {
                const a = conf[r].off + (360 / ring.length) * k;
                const body = it.icon ? icon(it.icon) : `<b>${esc(it.short || (it.label || "").slice(0, 3))}</b>`;
                return `<div class="planet" style="--a:${a.toFixed(1)}deg">
                    <div class="planet-body" tabindex="0" aria-label="${esc(it.label)}">${body}<span class="planet-label">${esc(it.label)}</span></div>
                </div>`;
            }).join("");
            return `<div class="orbit orbit-${r + 1}" style="--dur:${conf[r].dur}s;--dir:${conf[r].dir}">${planets}</div>`;
        }).join("");
        return `<div class="solar" aria-hidden="false">
            ${ringsHtml}
            <div class="sun">
                <span class="sun-corona"></span>
                <span class="sun-ring"></span>
                <img src="${esc(P().avatar || "img/avater.png")}" alt="${esc(fullName())}" class="sun-img">
            </div>
        </div>`;
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
                    <h1 class="hero-name reveal" style="--i:2"><span>${esc(p.firstName)}</span> <span class="grad">${esc(p.lastName)}</span></h1>
                    <div class="hero-role reveal" style="--i:3"><span class="role-prompt">~/</span><span id="typed"></span><span class="caret"></span></div>
                    <p class="hero-bio reveal" style="--i:4">${md(p.bio)}</p>
                    <div class="hero-ctas reveal" style="--i:5">${ctas}</div>
                    <div class="hero-socials reveal" style="--i:6">${socialLinks()}</div>
                </div>
                <div class="hero-visual reveal" style="--i:2">${renderSolar()}</div>
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
                    <span class="kicker"><span class="kicker-num">${String(n + 1).padStart(2, "0")}</span><span class="kicker-planet"></span>${esc(s.kicker || s.label)}</span>
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
            return `<div class="num-tile glass spot reveal" style="--i:${i}">
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
            cards.push(`<article class="live-card glass spot reveal">
                <div class="live-head">
                    <span class="orb-icon">${icon("fas fa-code")}</span>
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
            cards.push(`<article class="live-card glass spot reveal" style="--i:1">
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
        const tags = [...new Set(items.flatMap(p => list(p.tags)))];
        const chips = tags.length > 1 ? `<div class="filters no-swipe reveal" role="tablist">
            <button class="filter is-on" data-filter="*">All</button>
            ${tags.map(t => `<button class="filter" data-filter="${esc(t.toLowerCase())}">${esc(t)}</button>`).join("")}
        </div>` : "";
        const cards = items.map((p, i) => `
            <article class="project glass spot tilt reveal" style="--i:${i % 3};--h:${(i * 57 + 230) % 360}" data-tags="${esc(list(p.tags).map(t => t.toLowerCase()).join("|"))}">
                <div class="project-art">
                    <span class="p-planet">${icon(p.icon || "fas fa-rocket")}</span>
                    <span class="p-ring"></span>
                    <span class="p-moon"></span>
                    ${p.featured ? '<span class="p-badge"><i class="fas fa-star"></i> Featured</span>' : ""}
                </div>
                <div class="project-body">
                    <h3>${esc(p.title)}</h3>
                    <p>${md(p.desc)}</p>
                    <div class="tags">${list(p.tags).map(t => `<span>${esc(t)}</span>`).join("")}</div>
                    <div class="project-links">
                        ${p.github ? `<a href="${esc(safeUrl(p.github))}" target="_blank" rel="noopener" class="icon-btn" aria-label="Source code">${icon("fab fa-github")}</a>` : ""}
                        ${p.live ? `<a href="${esc(safeUrl(p.live))}" target="_blank" rel="noopener" class="link-arrow">Live demo ${icon("fas fa-arrow-up-right-from-square")}</a>` : ""}
                    </div>
                </div>
            </article>`).join("");
        const gh = (C.integrations || {}).github;
        return `${chips}<div class="projects-grid">${cards}</div>
            ${gh ? `<div class="center reveal"><a href="https://github.com/${esc(encodeURIComponent(gh))}" target="_blank" rel="noopener" class="btn btn-ghost">${icon("fab fa-github")}<span>View all on GitHub</span></a></div>` : ""}`;
    };

    R.achievements = () => {
        const items = list(C.achievements);
        if (!items.length) return "";
        const years = [...new Set(items.map(a => a.year).filter(Boolean))];
        const chips = years.length > 1 ? `<div class="filters no-swipe reveal">
            <button class="filter is-on" data-filter="*">All</button>
            ${years.map(y => `<button class="filter" data-filter="${esc(y)}">${esc(y)}</button>`).join("")}
        </div>` : "";
        const rows = items.map((a, i) => `
            <li class="trail-item reveal" style="--i:${i % 4}" data-tags="${esc(a.year)}">
                <span class="trail-node"></span>
                <div class="trail-card glass spot">
                    <div class="trail-main">
                        <span class="trail-year">${esc(a.year)}</span>
                        <h3>${esc(a.title)}</h3>
                        <p>${a.team ? `Team <strong>${esc(a.team)}</strong>` : ""}${a.team && a.note ? " · " : ""}${esc(a.note)}</p>
                    </div>
                    ${a.rank ? `<div class="rank${/^\d+$/.test(a.rank) && +a.rank <= 30 ? " rank-top" : ""}"><span>Rank</span><strong>${esc(a.rank)}</strong></div>` : ""}
                </div>
            </li>`).join("");
        return `${chips}<ol class="trail">${rows}</ol>`;
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
                <div class="form-title"><span class="orb-icon sm">${icon("fas fa-satellite")}</span><div><h3>Send a transmission</h3><p>Opens your mail app with everything filled in.</p></div></div>
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
        av.src = p.avatar || "img/avater.png";
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
                <img src="${esc(p.avatar || "img/avater.png")}" alt="">
                <div><strong>${esc(fullName())}</strong><span>${esc(list(p.roles)[0] || "")}</span></div>
            </div>
            <div class="sheet-grid">${rest.map(s =>
                `<button class="sheet-item" data-go="${esc(s.id)}"><span class="launch-icon">${icon(s.icon)}</span><span>${esc(s.label)}</span></button>`
            ).join("")}${p.resume ? `<a class="sheet-item" href="${esc(p.resume)}" download><span class="launch-icon"><i class="fas fa-file-arrow-down"></i></span><span>Resume</span></a>` : ""}</div>
            <div class="hero-socials sheet-socials">${socialLinks()}</div>
            <p class="sheet-foot">© ${new Date().getFullYear()} ${esc(fullName())}</p>`;

        $("#footer").innerHTML = `<div class="container footer-inner">
            <a href="#home" class="brand"><span class="brand-mark"><i></i></span><span class="brand-text">${esc($("#brandText").textContent)}</span></a>
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
        applyLive();
        if (!VIEWS.some(v => v.id === activeView)) activeView = "home";
        if (appMode) showView(activeView, null);
        else updateScrollUI();
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
            }).catch(() => {});
        }
        if (ig.github) {
            const u = encodeURIComponent(ig.github);
            cached("gh:" + ig.github, async () => {
                const [user, repos] = await Promise.all([
                    getJSON(`https://api.github.com/users/${u}`),
                    getJSON(`https://api.github.com/users/${u}/repos?per_page=100&type=owner`).catch(() => [])
                ]);
                const langs = {};
                let stars = 0;
                list(repos).forEach(r => {
                    stars += r.stargazers_count || 0;
                    if (r.language && !r.fork) langs[r.language] = (langs[r.language] || 0) + 1;
                });
                return {
                    repos: String(user.public_repos ?? "—"),
                    followers: String(user.followers ?? "—"),
                    stars: String(stars),
                    langs: Object.entries(langs).sort((a, b) => b[1] - a[1]).slice(0, 5)
                };
            }).then(d => { LIVE.github = d; applyLive(); }).catch(() => {});
        }
    }

    const LANG_COLORS = ["var(--accent)", "var(--accent-2)", "var(--sun)", "#f472b6", "#4ade80"];

    function applyLive() {
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
    function showView(id, dir) {
        const view = VIEWS.find(v => v.id === id) || VIEWS[0];
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
        window.scrollTo(0, 0);
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
                .then(() => toast("Copied to clipboard"))
                .catch(() => toast(text));
            return;
        }

        const filter = e.target.closest(".filter");
        if (filter) {
            const box = filter.parentElement;
            $$(".filter", box).forEach(f => f.classList.toggle("is-on", f === filter));
            const f = filter.dataset.filter;
            const scope = box.parentElement;
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
        window.addEventListener("load", () => setTimeout(hidePreloader, 350));
        setTimeout(hidePreloader, 2500);
    }

    if ("serviceWorker" in navigator && location.protocol === "https:" && !PREVIEW) {
        window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
    }
})();
