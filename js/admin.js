/* =========================================================
   MISSION CONTROL — portfolio admin panel
   - Edits everything in data/content.js through schema-driven forms
   - Live preview via index.html?preview (postMessage + localStorage draft)
   - Publishes to GitHub as ONE commit (Git Data API); Netlify redeploys
   - Offline mode: local draft + export/import
========================================================= */
(function () {
    "use strict";

    /* ---------- constants ---------- */
    const DRAFT_KEY = "portfolio:draft";
    const DRAFT_TIME_KEY = "portfolio:draft:time";
    const CONN_KEY = "portfolio:conn";
    const TOKEN_KEY = "portfolio:token";
    const UI_KEY = "portfolio:admin-ui";
    const CONTENT_PATH = "data/content.js";
    const DEFAULTS = { owner: "Yeamin-Talukder", repo: "Portfolio", branch: "main", siteUrl: "https://yh-am-in.netlify.app/" };

    /* ---------- helpers ---------- */
    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
    const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const clone = o => JSON.parse(JSON.stringify(o == null ? {} : o));
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const splitPath = p => String(p).split(".").filter(k => k !== "").map(k => /^\d+$/.test(k) ? +k : k);
    const join = (base, p) => [base, p].filter(x => x !== "" && x != null).join(".");
    const getPath = (obj, p) => splitPath(p).reduce((o, k) => (o == null ? undefined : o[k]), obj);
    function setPath(obj, p, v) {
        const ks = splitPath(p);
        let o = obj;
        ks.slice(0, -1).forEach((k, i) => {
            if (o[k] == null || typeof o[k] !== "object") o[k] = typeof ks[i + 1] === "number" ? [] : {};
            o = o[k];
        });
        o[ks[ks.length - 1]] = v;
    }
    const store = {
        get(k, d = null, s = localStorage) { try { const v = s.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
        set(k, v, s = localStorage) { try { s.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
        del(k, s = localStorage) { try { s.removeItem(k); } catch (e) { /* noop */ } }
    };
    const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
    const fmtBytes = n => n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB";
    const dataUrlBytes = u => Math.round((u.length - u.indexOf(",") - 1) * 0.75);
    const isData = v => typeof v === "string" && v.startsWith("data:");
    const timeAgo = d => {
        const s = (Date.now() - new Date(d).getTime()) / 1000;
        if (s < 60) return "just now";
        if (s < 3600) return Math.floor(s / 60) + "m ago";
        if (s < 86400) return Math.floor(s / 3600) + "h ago";
        return Math.floor(s / 86400) + "d ago";
    };
    const utf8ToB64 = str => {
        const bytes = new TextEncoder().encode(str);
        let bin = "";
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        return btoa(bin);
    };
    const b64ToUtf8 = b64 => {
        const bin = atob(b64.replace(/\s/g, ""));
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new TextDecoder().decode(bytes);
    };
    const serialize = obj => `window.PORTFOLIO = ${JSON.stringify(obj, null, 2)};\n`;
    function parseContent(text) {
        const a = text.indexOf("{"), b = text.lastIndexOf("}");
        if (a < 0 || b < a) return null;
        try { return JSON.parse(text.slice(a, b + 1)); } catch (e) { return null; }
    }

    /* ---------- state ---------- */
    let conn = null;                          // { mode, owner, repo, branch, token, siteUrl, user }
    let published = clone(window.PORTFOLIO);  // last loaded / published content
    let state = clone(published);             // working copy
    let remoteSha = null;
    let page = "dashboard";
    let ui = Object.assign({ preview: window.innerWidth >= 1280, device: "desktop" }, store.get(UI_KEY, {}));
    const openItems = new Set();
    const listSchemas = {};
    let iconTarget = null;
    let publishing = false;
    const uploadCache = {};                   // published upload path -> data URL (until Netlify has deployed it)
    const withUploads = obj => {
        const o = clone(obj);
        walkStrings(o, v => uploadCache[v]);
        return o;
    };

    /* =====================================================
       SCHEMA
    ===================================================== */
    const F = {
        text: (path, label, o = {}) => Object.assign({ type: "text", path, label }, o),
        area: (path, label, o = {}) => Object.assign({ type: "textarea", path, label }, o),
        url: (path, label, o = {}) => Object.assign({ type: "url", path, label, placeholder: "https://" }, o),
        toggle: (path, label, o = {}) => Object.assign({ type: "toggle", path, label }, o),
        select: (path, label, options, o = {}) => Object.assign({ type: "select", path, label, options }, o),
        icon: (path, label = "Icon", o = {}) => Object.assign({ type: "icon", path, label }, o),
        color: (path, label, o = {}) => Object.assign({ type: "color", path, label }, o),
        strings: (path, label, o = {}) => Object.assign({ type: "strings", path, label }, o),
        image: (path, label, o = {}) => Object.assign({ type: "image", path, label }, o),
        file: (path, label, o = {}) => Object.assign({ type: "file", path, label }, o),
        list: (path, label, o = {}) => Object.assign({ type: "list", path, label }, o),
        group: (title, fields, o = {}) => Object.assign({ type: "group", title, fields }, o)
    };
    const MD_HINT = "Supports **bold**, *italic* and [links](https://…).";
    const SOURCES = [
        { value: "static", label: "Static value" },
        { value: "codeforces.rating", label: "Live · Codeforces rating" },
        { value: "codeforces.maxRating", label: "Live · Codeforces max rating" },
        { value: "codeforces.contests", label: "Live · Codeforces contests" },
        { value: "github.repos", label: "Live · GitHub repos" },
        { value: "github.followers", label: "Live · GitHub followers" },
        { value: "github.stars", label: "Live · GitHub stars" }
    ];
    const THEME_PRESETS = [
        { name: "Nebula", accent: "#8b7bff", accent2: "#38d6f5", sun: "#ffb547" },
        { name: "Aurora", accent: "#2ecc71", accent2: "#38d6f5", sun: "#ffd166" },
        { name: "Mars", accent: "#ff6b6b", accent2: "#ffa36b", sun: "#ffd166" },
        { name: "Neptune", accent: "#4f8cff", accent2: "#38d6f5", sun: "#a5f3fc" },
        { name: "Saturn", accent: "#e0b354", accent2: "#f0d9a0", sun: "#ff9f43" },
        { name: "Pulsar", accent: "#f472b6", accent2: "#a78bfa", sun: "#fde68a" }
    ];

    const PAGES = [
        { id: "dashboard", label: "Dashboard", icon: "fas fa-gauge-high", desc: "Overview of your portfolio and recent activity.", render: renderDashboard },
        { group: "Content" },
        {
            id: "profile", label: "Profile & Hero", icon: "fas fa-user-astronaut", preview: "home",
            desc: "Your name, intro, avatar (the sun of your solar system) and résumé.",
            fields: [
                F.group("Identity", [
                    F.text("profile.firstName", "First name", { half: true }),
                    F.text("profile.lastName", "Last name", { half: true, hint: "Shown with the gradient." }),
                    F.text("profile.brand", "Logo text", { half: true, hint: "Shown in the navbar." }),
                    F.text("profile.location", "Location", { half: true })
                ]),
                F.group("Hero", [
                    F.strings("profile.roles", "Typed roles", { hint: "Press Enter to add. They type out one after another." }),
                    F.area("profile.bio", "Short bio", { rows: 3, hint: MD_HINT }),
                    F.toggle("profile.available", "Show availability badge", { half: true }),
                    F.text("profile.availableText", "Badge text", { half: true })
                ]),
                F.group("Media", [
                    F.image("profile.avatar", "Avatar", { hint: "Square image works best. Auto-resized to 900px." }),
                    F.file("profile.resume", "Résumé / CV", { accept: ".pdf,.doc,.docx", hint: "PDF or Word file." })
                ]),
                F.group("Contact details", [
                    F.text("profile.email", "Email", { half: true, input: "email" }),
                    F.text("profile.phone", "Phone", { half: true })
                ]),
                F.list("profile.ctas", "Hero buttons", {
                    addLabel: "Add button", titleKey: "label", subOf: i => i.url,
                    newItem: () => ({ label: "New button", url: "#contact", icon: "fas fa-arrow-right", style: "outline" }),
                    fields: [
                        F.text("label", "Label", { half: true }),
                        F.text("url", "Link", { half: true, hint: "URL or #section (e.g. #projects)." }),
                        F.icon("icon", "Icon", { half: true }),
                        F.select("style", "Style", [{ value: "primary", label: "Primary (filled)" }, { value: "outline", label: "Ghost (outline)" }], { half: true })
                    ]
                })
            ]
        },
        {
            id: "orbit", label: "Orbit Planets", icon: "fas fa-circle-nodes", preview: "home",
            desc: "The planets orbiting your avatar in the hero. They spread across three orbits automatically — 6 to 12 looks best.",
            fields: [
                F.list("orbit", "Planets", {
                    addLabel: "Add planet", titleKey: "label", iconOf: i => i.icon,
                    newItem: () => ({ label: "New skill", icon: "fas fa-star", short: "" }),
                    fields: [
                        F.text("label", "Name", { half: true, hint: "Shown on hover." }),
                        F.icon("icon", "Icon", { half: true }),
                        F.text("short", "Text instead of icon", { half: true, hint: "Used when no icon is set, e.g. C++." })
                    ]
                })
            ]
        },
        {
            id: "about", label: "About", icon: "fas fa-id-card", preview: "about",
            desc: "Your story, quick facts and the number tiles.",
            fields: [
                F.list("about.paragraphs", "Paragraphs", {
                    addLabel: "Add paragraph", itemLabel: "Paragraph", titleOf: t => String(t || "").slice(0, 70) || "Empty paragraph",
                    newItem: () => "", primitive: F.area("", "Text", { rows: 4, hint: MD_HINT })
                }),
                F.list("about.tags", "Quick facts", {
                    addLabel: "Add fact", titleKey: "text",
                    newItem: () => ({ icon: "fas fa-star", text: "New fact" }),
                    fields: [F.icon("icon", "Icon", { half: true }), F.text("text", "Text", { half: true })]
                }),
                F.list("numbers", "Number tiles", {
                    addLabel: "Add tile", titleKey: "label", subOf: i => i.source && i.source !== "static" ? "Live data" : i.value,
                    newItem: () => ({ label: "New stat", value: "0", source: "static" }),
                    fields: [
                        F.text("label", "Label", { half: true }),
                        F.select("source", "Source", SOURCES, { half: true }),
                        F.text("value", "Value", { half: true, hint: "Used for static tiles (and as fallback)." })
                    ]
                })
            ]
        },
        {
            id: "skills", label: "Skills", icon: "fas fa-meteor", preview: "skills",
            desc: "Skill categories and their items.",
            fields: [
                F.list("skills", "Categories", {
                    addLabel: "Add category", titleKey: "title", subOf: i => (i.items || []).join(", "),
                    newItem: () => ({ title: "New category", icon: "fas fa-star", items: [] }),
                    fields: [F.text("title", "Title", { half: true }), F.icon("icon", "Icon", { half: true }), F.strings("items", "Skills", { hint: "Press Enter to add." })]
                })
            ]
        },
        {
            id: "stats", label: "Live Stats", icon: "fas fa-satellite-dish", preview: "stats",
            desc: "Handles used to pull live data from Codeforces and GitHub. Leave both empty to hide the section.",
            fields: [
                F.group("Integrations", [
                    F.text("integrations.codeforces", "Codeforces handle", { half: true, placeholder: "tourist" }),
                    F.text("integrations.github", "GitHub username", { half: true, placeholder: "octocat" })
                ])
            ]
        },
        {
            id: "projects", label: "Projects", icon: "fas fa-rocket", preview: "projects",
            desc: "Your work. Tags become filter chips automatically.",
            fields: [
                F.list("projects", "Projects", {
                    addLabel: "Add project", titleKey: "title", iconOf: i => i.icon, subOf: i => (i.tags || []).join(" · "),
                    newItem: () => ({ title: "New project", desc: "", icon: "fas fa-rocket", tags: [], github: "", live: "", featured: false }),
                    fields: [
                        F.text("title", "Title", { half: true }),
                        F.icon("icon", "Icon", { half: true }),
                        F.area("desc", "Description", { rows: 3, hint: MD_HINT }),
                        F.strings("tags", "Tags"),
                        F.url("github", "Source code URL", { half: true }),
                        F.url("live", "Live demo URL", { half: true }),
                        F.toggle("featured", "Featured", { hint: "Adds a star badge." })
                    ]
                })
            ]
        },
        {
            id: "achievements", label: "Achievements", icon: "fas fa-trophy", preview: "achievements",
            desc: "Contest results. Ranks ≤ 30 glow gold; years become filters.",
            fields: [
                F.list("achievements", "Achievements", {
                    addLabel: "Add achievement", titleKey: "title", subOf: i => [i.year, i.rank && "Rank " + i.rank].filter(Boolean).join(" · "),
                    newItem: () => ({ year: String(new Date().getFullYear()), title: "New contest", team: "", note: "", rank: "" }),
                    fields: [
                        F.text("title", "Contest / title"),
                        F.text("year", "Year", { half: true }),
                        F.text("rank", "Rank", { half: true }),
                        F.text("team", "Team", { half: true }),
                        F.text("note", "Note", { half: true, placeholder: "Solved 3 problems" })
                    ]
                })
            ]
        },
        {
            id: "education", label: "Education", icon: "fas fa-graduation-cap", preview: "education",
            desc: "Degrees and schools.",
            fields: [
                F.list("education", "Education", {
                    addLabel: "Add entry", titleKey: "degree", iconOf: i => i.icon, subOf: i => i.school,
                    newItem: () => ({ degree: "New degree", school: "", period: "", badge: "", icon: "fas fa-graduation-cap" }),
                    fields: [
                        F.text("degree", "Degree"),
                        F.text("school", "School", { half: true }),
                        F.text("period", "Period", { half: true, placeholder: "2022 — Present" }),
                        F.text("badge", "Badge", { half: true, placeholder: "GPA 5.00" }),
                        F.icon("icon", "Icon", { half: true })
                    ]
                })
            ]
        },
        {
            id: "contact", label: "Contact & Socials", icon: "fas fa-paper-plane", preview: "contact",
            desc: "Contact section text and every social link on the site.",
            fields: [
                F.group("Contact section", [
                    F.text("contact.heading", "Heading"),
                    F.area("contact.text", "Text", { rows: 3, hint: MD_HINT }),
                    F.toggle("contact.form", "Show contact form", { hint: "Opens the visitor's mail app pre-filled." })
                ]),
                F.list("socials", "Social links", {
                    addLabel: "Add link", titleKey: "label", iconOf: i => i.icon, subOf: i => i.url,
                    newItem: () => ({ label: "New link", icon: "fas fa-link", url: "https://", handle: "" }),
                    fields: [
                        F.text("label", "Label", { half: true }),
                        F.icon("icon", "Icon", { half: true }),
                        F.url("url", "URL", { half: true }),
                        F.text("handle", "Handle", { half: true })
                    ]
                })
            ]
        },
        { group: "Site" },
        {
            id: "sections", label: "Sections & Nav", icon: "fas fa-bars-staggered", preview: null,
            desc: "Reorder, rename or hide sections. On phones, sections marked “Tab” appear in the bottom tab bar (max 3); the rest go under “More”.",
            fields: [
                F.list("sections", "Sections", {
                    fixed: true, titleKey: "label", iconOf: i => i.icon,
                    subOf: i => [i.visible === false ? "Hidden" : "Visible", i.tab ? "Tab" : ""].filter(Boolean).join(" · "),
                    fields: [
                        F.text("label", "Nav label", { half: true }),
                        F.icon("icon", "Icon", { half: true }),
                        F.text("kicker", "Kicker", { half: true }),
                        F.text("title", "Title", { half: true }),
                        F.toggle("visible", "Visible", { half: true }),
                        F.toggle("tab", "Mobile tab", { half: true })
                    ]
                })
            ]
        },
        { id: "theme", label: "Theme & Motion", icon: "fas fa-palette", preview: "home", desc: "Colors of your universe and how much it moves.", render: renderTheme },
        {
            id: "seo", label: "SEO & Footer", icon: "fas fa-magnifying-glass", preview: null,
            desc: "Search engine title/description and the footer line.",
            fields: [
                F.group("Search & sharing", [
                    F.text("meta.title", "Page title", { hint: "Shown in the browser tab and Google." }),
                    F.area("meta.description", "Meta description", { rows: 3, hint: "About 150 characters." })
                ]),
                F.group("Footer", [F.text("footer.text", "Footer text")])
            ]
        },
        { group: "System" },
        { id: "data", label: "Backup & Data", icon: "fas fa-database", desc: "Export, import or reset your content.", render: renderData },
        { id: "connection", label: "Connection", icon: "fas fa-plug", desc: "Repository and publishing settings.", render: renderConnection }
    ];
    const pageById = id => PAGES.find(p => p.id === id);

    /* =====================================================
       FIELD RENDERING
    ===================================================== */
    function hint(f) { return f.hint ? `<small class="hint">${esc(f.hint)}</small>` : ""; }
    function label(f) { return f.label ? `<span class="field-label">${esc(f.label)}</span>` : ""; }

    function fieldHTML(f, base) {
        const path = join(base, f.path);
        const v = getPath(state, path);
        const half = f.half ? " half" : "";
        const bind = `data-bind="${esc(path)}" data-key="${esc(path)}"`;
        switch (f.type) {
            case "group":
                return `<section class="card">
                    <header class="card-head"><h3>${esc(f.title)}</h3>${f.desc ? `<p>${esc(f.desc)}</p>` : ""}</header>
                    <div class="grid">${f.fields.map(x => fieldHTML(x, base)).join("")}</div>
                </section>`;
            case "text":
            case "url":
                return `<label class="field${half}">${label(f)}
                    <input class="input" type="${f.input || (f.type === "url" ? "url" : "text")}" ${bind} value="${esc(v == null ? "" : v)}" placeholder="${esc(f.placeholder || "")}" spellcheck="${f.type === "url" ? "false" : "true"}">
                    ${hint(f)}</label>`;
            case "textarea":
                return `<label class="field">${label(f)}
                    <textarea class="input" rows="${f.rows || 4}" ${bind} placeholder="${esc(f.placeholder || "")}">${esc(v == null ? "" : v)}</textarea>
                    ${hint(f)}</label>`;
            case "toggle":
                return `<label class="toggle-row${half}">
                    <span class="toggle-text"><b>${esc(f.label)}</b>${f.hint ? `<small>${esc(f.hint)}</small>` : ""}</span>
                    <input type="checkbox" class="switch" ${bind} ${v ? "checked" : ""}>
                </label>`;
            case "select":
                return `<label class="field${half}">${label(f)}
                    <div class="select-wrap"><select class="input" ${bind}>
                        ${f.options.map(o => `<option value="${esc(o.value)}" ${o.value === (v || f.options[0].value) ? "selected" : ""}>${esc(o.label)}</option>`).join("")}
                    </select><i class="fas fa-chevron-down"></i></div>${hint(f)}</label>`;
            case "color":
                return `<div class="field${half}">${label(f)}
                    <div class="color-input">
                        <input type="color" data-bind="${esc(path)}" value="${esc(/^#[0-9a-f]{6}$/i.test(v || "") ? v : "#8b7bff")}" aria-label="${esc(f.label)}">
                        <input class="input mono" ${bind} value="${esc(v || "")}" spellcheck="false">
                    </div>${hint(f)}</div>`;
            case "icon":
                return `<div class="field${half}">${label(f)}
                    <div class="icon-input">
                        <button type="button" class="icon-preview" data-act="pick-icon" data-path="${esc(path)}" title="Choose icon"><i class="${esc(v || "fas fa-icons")}" data-icon-for="${esc(path)}"></i></button>
                        <input class="input mono" ${bind} value="${esc(v || "")}" placeholder="fas fa-star" spellcheck="false">
                        <button type="button" class="input-btn" data-act="pick-icon" data-path="${esc(path)}" title="Browse icons"><i class="fas fa-table-cells"></i></button>
                    </div>${hint(f)}</div>`;
            case "image":
            case "file": {
                const isImg = f.type === "image";
                const pending = isData(v);
                const thumb = isImg
                    ? `<div class="media-thumb">${v ? `<img src="${esc(uploadCache[v] || v)}" alt="">` : '<i class="far fa-image"></i>'}</div>`
                    : `<div class="media-thumb file"><i class="far fa-file-lines"></i></div>`;
                const info = pending
                    ? `<b>New ${isImg ? "image" : "file"} · ${fmtBytes(dataUrlBytes(v))}</b><small>Uploads to GitHub when you publish.</small>`
                    : v ? `<b>${esc(String(v).split("/").pop())}</b><small>${esc(v)}</small>` : `<b>No ${isImg ? "image" : "file"}</b><small>Upload one or paste a path / URL below.</small>`;
                return `<div class="field media">${label(f)}
                    <div class="media-row">
                        ${thumb}
                        <div class="media-info">${info}</div>
                        <div class="media-actions">
                            <label class="btn btn-ghost btn-sm"><i class="fas fa-upload"></i><span>Upload</span>
                                <input type="file" hidden data-upload="${esc(path)}" data-kind="${f.type}" accept="${esc(f.accept || (isImg ? "image/*" : "*/*"))}">
                            </label>
                            ${v ? `<button type="button" class="icon-btn sm danger" data-act="clear" data-path="${esc(path)}" title="Remove"><i class="far fa-trash-can"></i></button>` : ""}
                        </div>
                    </div>
                    ${pending ? "" : `<input class="input mono sm" ${bind} value="${esc(v || "")}" placeholder="${isImg ? "img/avatar.png or https://…" : "downlode/cv.pdf"}" spellcheck="false">`}
                    ${hint(f)}</div>`;
            }
            case "strings": {
                const arr = Array.isArray(v) ? v : [];
                return `<div class="field">${label(f)}
                    <div class="chips-input" data-chips="${esc(path)}">
                        ${arr.map((t, i) => `<span class="chip-tag" draggable="false">${esc(t)}<button type="button" data-act="chip-del" data-path="${esc(path)}" data-index="${i}" aria-label="Remove ${esc(t)}"><i class="fas fa-xmark"></i></button></span>`).join("")}
                        <input class="chip-entry" data-chip-input="${esc(path)}" data-key="${esc(path)}#chip" placeholder="${arr.length ? "Add…" : "Type and press Enter"}">
                    </div>${hint(f)}</div>`;
            }
            case "list":
                return listHTML(f, path);
            default:
                return "";
        }
    }

    function itemTitle(f, item, i) {
        if (f.titleOf) return f.titleOf(item, i);
        const t = item && item[f.titleKey || "title"];
        return t || `${f.itemLabel || "Item"} ${i + 1}`;
    }

    function listHTML(f, path) {
        listSchemas[path] = f;
        const arr = Array.isArray(getPath(state, path)) ? getPath(state, path) : [];
        const items = arr.map((item, i) => {
            const ip = `${path}.${i}`;
            const ic = f.iconOf ? f.iconOf(item) : null;
            const sub = f.subOf ? f.subOf(item) : "";
            const body = f.primitive
                ? fieldHTML(Object.assign({}, f.primitive, { path: "" }), ip)
                : f.fields.map(x => fieldHTML(x, ip)).join("");
            return `<div class="list-item${openItems.has(ip) ? " is-open" : ""}" data-list="${esc(path)}" data-index="${i}">
                <div class="li-head">
                    <span class="li-handle" draggable="true" title="Drag to reorder"><i class="fas fa-grip-vertical"></i></span>
                    <button type="button" class="li-toggle" data-act="toggle" data-path="${esc(ip)}">
                        ${ic ? `<span class="li-icon"><i class="${esc(ic)}"></i></span>` : `<span class="li-num">${i + 1}</span>`}
                        <span class="li-text"><b>${esc(itemTitle(f, item, i))}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</span>
                        <i class="fas fa-chevron-down li-caret"></i>
                    </button>
                    <div class="li-actions">
                        <button type="button" class="icon-btn xs" data-act="up" data-path="${esc(path)}" data-index="${i}" title="Move up" ${i === 0 ? "disabled" : ""}><i class="fas fa-arrow-up"></i></button>
                        <button type="button" class="icon-btn xs" data-act="down" data-path="${esc(path)}" data-index="${i}" title="Move down" ${i === arr.length - 1 ? "disabled" : ""}><i class="fas fa-arrow-down"></i></button>
                        ${f.fixed ? "" : `<button type="button" class="icon-btn xs hide-xs" data-act="dup" data-path="${esc(path)}" data-index="${i}" title="Duplicate"><i class="far fa-copy"></i></button>
                        <button type="button" class="icon-btn xs danger" data-act="del" data-path="${esc(path)}" data-index="${i}" title="Delete"><i class="far fa-trash-can"></i></button>`}
                    </div>
                </div>
                <div class="li-body"><div class="grid">${body}</div></div>
            </div>`;
        }).join("");
        return `<section class="list-field" data-list-root="${esc(path)}">
            <div class="list-head">
                <div><h3>${esc(f.label)}</h3><small>${arr.length} ${arr.length === 1 ? "item" : "items"}${arr.length > 1 ? " · drag to reorder" : ""}</small></div>
                ${f.fixed ? "" : `<button type="button" class="btn btn-ghost btn-sm" data-act="add" data-path="${esc(path)}"><i class="fas fa-plus"></i><span>${esc(f.addLabel || "Add")}</span></button>`}
            </div>
            <div class="list-items">${items || `<div class="empty"><i class="fas fa-satellite"></i><p>Nothing here yet.</p>${f.fixed ? "" : `<button type="button" class="btn btn-primary btn-sm" data-act="add" data-path="${esc(path)}"><i class="fas fa-plus"></i><span>${esc(f.addLabel || "Add")}</span></button>`}</div>`}</div>
        </section>`;
    }

    /* =====================================================
       CUSTOM PAGES
    ===================================================== */
    function statCard(icon, value, label, go) {
        return `<button class="stat-card" ${go ? `data-act="goto" data-page="${go}"` : ""}>
            <span class="stat-icon"><i class="${icon}"></i></span>
            <span class="stat-value">${value}</span><span class="stat-label">${label}</span>
        </button>`;
    }

    function healthChecks() {
        const s = state, p = s.profile || {};
        const out = [];
        const add = (ok, text, go) => out.push({ ok, text, go });
        add(!!p.avatar, p.avatar ? "Avatar is set" : "Add an avatar — it's the sun of your solar system", "profile");
        add(!!(p.bio && p.bio.length > 30), p.bio ? "Hero bio looks good" : "Write a short hero bio", "profile");
        add(!!p.email, p.email ? "Email is set" : "Add an email so people can reach you", "profile");
        add(!!p.resume, p.resume ? "Résumé is attached" : "Attach your résumé / CV", "profile");
        const orbitN = (s.orbit || []).length;
        add(orbitN >= 3 && orbitN <= 14, `${orbitN} orbit planets${orbitN < 3 ? " — add a few more" : orbitN > 14 ? " — consider fewer for a cleaner look" : ""}`, "orbit");
        const noLink = (s.projects || []).filter(x => !x.github && !x.live).length;
        add(!noLink, noLink ? `${noLink} project(s) have no links` : "Every project has a link", "projects");
        const hidden = (s.sections || []).filter(x => x.visible === false).length;
        if (hidden) add(true, `${hidden} section(s) hidden`, "sections");
        return out;
    }

    function renderDashboard() {
        const s = state, u = conn.user;
        const skillCount = (s.skills || []).reduce((n, c) => n + (c.items || []).length, 0);
        const checks = healthChecks();
        const pending = countPendingUploads();
        const dirty = !same(state, published);
        return `
        <section class="hero-card">
            <div class="hero-card-text">
                <small>${conn.mode === "github" ? "Connected to GitHub" : "Offline mode"}</small>
                <h2>Hello${u ? ", " + esc(u.name || u.login) : ""} 👋</h2>
                <p>${dirty ? "You have unpublished changes. Review them in the preview, then publish when ready." : "Everything is in sync. Pick a section on the left to start editing."}</p>
                <div class="row">
                    <button class="btn btn-primary btn-sm" data-act="publish"><i class="fas fa-cloud-arrow-up"></i><span>${conn.mode === "github" ? "Publish" : "Export"}</span></button>
                    <a class="btn btn-ghost btn-sm" href="${esc(conn.siteUrl || "index.html")}" target="_blank" rel="noopener"><i class="fas fa-globe"></i><span>View site</span></a>
                </div>
            </div>
            <div class="mini-solar" aria-hidden="true"><span class="ms-sun">${s.profile && s.profile.avatar ? `<img src="${esc(uploadCache[s.profile.avatar] || s.profile.avatar)}" alt="">` : ""}</span><span class="ms-orbit o1"><i></i></span><span class="ms-orbit o2"><i></i></span><span class="ms-orbit o3"><i></i></span></div>
        </section>
        <div class="stat-grid">
            ${statCard("fas fa-rocket", (s.projects || []).length, "Projects", "projects")}
            ${statCard("fas fa-trophy", (s.achievements || []).length, "Achievements", "achievements")}
            ${statCard("fas fa-meteor", skillCount, "Skills", "skills")}
            ${statCard("fas fa-circle-nodes", (s.orbit || []).length, "Planets", "orbit")}
            ${statCard("fas fa-share-nodes", (s.socials || []).length, "Social links", "contact")}
            ${statCard("fas fa-cloud-arrow-up", pending, "Pending uploads", null)}
        </div>
        <div class="two-col">
            <section class="card">
                <header class="card-head"><h3>Content health</h3><p>Quick checks to keep your portfolio sharp.</p></header>
                <ul class="checks">${checks.map(c => `<li class="${c.ok ? "ok" : "warn"}"><i class="fas ${c.ok ? "fa-circle-check" : "fa-circle-exclamation"}"></i><span>${esc(c.text)}</span>${c.go ? `<button class="link" data-act="goto" data-page="${c.go}">Edit</button>` : ""}</li>`).join("")}</ul>
            </section>
            <section class="card">
                <header class="card-head"><h3>Recent publishes</h3><p>${conn.mode === "github" ? `Commits touching <code>${CONTENT_PATH}</code>.` : "Connect GitHub to see history."}</p></header>
                <ul class="commits" id="commitList">${conn.mode === "github" ? '<li class="muted"><span class="spinner sm"></span> Loading…</li>' : '<li class="muted">Offline mode — no history.</li>'}</ul>
            </section>
        </div>`;
    }

    async function loadCommits() {
        const box = $("#commitList");
        if (!box || conn.mode !== "github") return;
        try {
            const list = await gh(`/repos/${conn.owner}/${conn.repo}/commits?path=${encodeURIComponent(CONTENT_PATH)}&sha=${encodeURIComponent(conn.branch)}&per_page=6`);
            if (!$("#commitList")) return;
            $("#commitList").innerHTML = list.length ? list.map(c => `<li>
                <i class="fas fa-code-commit"></i>
                <a href="${esc(c.html_url)}" target="_blank" rel="noopener"><b>${esc(c.commit.message.split("\n")[0])}</b>
                <small>${esc((c.author && c.author.login) || c.commit.author.name)} · ${timeAgo(c.commit.author.date)}</small></a>
            </li>`).join("") : '<li class="muted">No publishes yet.</li>';
        } catch (e) {
            if ($("#commitList")) $("#commitList").innerHTML = `<li class="muted">Couldn't load history (${esc(e.message)}).</li>`;
        }
    }

    function renderTheme() {
        const t = state.theme || {};
        return `
        <section class="card">
            <header class="card-head"><h3>Presets</h3><p>One click to change the whole palette.</p></header>
            <div class="presets">${THEME_PRESETS.map(p => {
                const on = (t.accent || "").toLowerCase() === p.accent && (t.accent2 || "").toLowerCase() === p.accent2;
                return `<button class="preset${on ? " is-on" : ""}" data-act="preset" data-name="${esc(p.name)}">
                    <span class="preset-orb" style="--a:${p.accent};--b:${p.accent2};--c:${p.sun}"></span><span>${esc(p.name)}</span>
                </button>`;
            }).join("")}</div>
        </section>
        ${fieldHTML(F.group("Custom colors", [
            F.color("theme.accent", "Accent", { half: true }),
            F.color("theme.accent2", "Secondary", { half: true }),
            F.color("theme.sun", "Sun glow", { half: true })
        ]), "")}
        ${fieldHTML(F.group("Space & motion", [
            F.select("theme.stars", "Star density", [{ value: "low", label: "Low (calm)" }, { value: "normal", label: "Normal" }, { value: "high", label: "High (dense)" }], { half: true }),
            F.toggle("theme.shootingStars", "Shooting stars", { half: true }),
            F.toggle("theme.motion", "Animations", { hint: "Turn off to stop orbits, typing and reveal animations." })
        ]), "")}`;
    }

    function renderData() {
        const size = new Blob([serialize(state)]).size;
        return `
        <section class="card">
            <header class="card-head"><h3>Backup</h3><p>Download everything as JSON, or restore from a backup.</p></header>
            <div class="action-list">
                <div class="action-row"><span class="stat-icon"><i class="fas fa-file-export"></i></span><div><b>Export JSON</b><small>A full backup of your current draft (${fmtBytes(size)}).</small></div><button class="btn btn-ghost btn-sm" data-act="export-json"><i class="fas fa-download"></i><span>Export</span></button></div>
                <div class="action-row"><span class="stat-icon"><i class="fas fa-file-import"></i></span><div><b>Import JSON</b><small>Replace the draft with a backup file. You can review before publishing.</small></div><button class="btn btn-ghost btn-sm" data-act="import-json"><i class="fas fa-upload"></i><span>Import</span></button></div>
                <div class="action-row"><span class="stat-icon"><i class="fas fa-file-code"></i></span><div><b>Download content.js</b><small>For manual deploys: replace <code>${CONTENT_PATH}</code> in your repo.</small></div><button class="btn btn-ghost btn-sm" data-act="download-js"><i class="fas fa-download"></i><span>Download</span></button></div>
            </div>
        </section>
        <section class="card danger-zone">
            <header class="card-head"><h3>Danger zone</h3><p>These can't be undone.</p></header>
            <div class="action-list">
                <div class="action-row"><span class="stat-icon"><i class="fas fa-rotate-left"></i></span><div><b>Discard unpublished changes</b><small>Revert the draft to the last published version.</small></div><button class="btn btn-danger btn-sm" data-act="discard"><span>Discard</span></button></div>
            </div>
        </section>`;
    }

    function renderConnection() {
        const g = conn.mode === "github";
        return `
        <section class="card">
            <header class="card-head"><h3>Status</h3></header>
            <div class="conn-status ${g ? "on" : ""}">
                ${g && conn.user ? `<img src="${esc(conn.user.avatar)}" alt="">` : `<span class="stat-icon"><i class="fas ${g ? "fa-plug-circle-check" : "fa-plug-circle-xmark"}"></i></span>`}
                <div>
                    <b>${g ? "Connected" + (conn.user ? " as " + esc(conn.user.login) : "") : "Offline mode"}</b>
                    <small>${g ? `<a href="https://github.com/${esc(conn.owner)}/${esc(conn.repo)}/tree/${esc(conn.branch)}" target="_blank" rel="noopener">${esc(conn.owner)}/${esc(conn.repo)} · ${esc(conn.branch)}</a>` : "Edits are saved in this browser only. Connect GitHub to publish."}</small>
                </div>
                ${g ? `<button class="btn btn-ghost btn-sm" data-act="logout"><i class="fas fa-right-from-bracket"></i><span>Sign out</span></button>`
                    : `<button class="btn btn-primary btn-sm" data-act="to-login"><i class="fab fa-github"></i><span>Connect</span></button>`}
            </div>
        </section>
        <section class="card">
            <header class="card-head"><h3>Live site</h3><p>Used for the “View site” links.</p></header>
            <div class="grid"><label class="field"><span class="field-label">Site URL</span><input class="input" id="siteUrlInput" value="${esc(conn.siteUrl || "")}" placeholder="https://…"></label></div>
        </section>
        <section class="card">
            <header class="card-head"><h3>How publishing works</h3></header>
            <ol class="steps">
                <li>Your edits are auto-saved as a draft in this browser.</li>
                <li><b>Publish</b> creates one commit on <code>${esc(conn.branch || "main")}</code> with <code>${CONTENT_PATH}</code> and any uploaded files (under <code>uploads/</code>).</li>
                <li>Netlify sees the commit and redeploys — usually live in under a minute.</li>
            </ol>
        </section>`;
    }

    /* =====================================================
       PAGE RENDER
    ===================================================== */
    const editor = $("#editor");
    const editorScroll = $("#editorScroll");

    function renderNav() {
        $("#sideNav").innerHTML = PAGES.map(p => p.group
            ? `<span class="nav-group">${esc(p.group)}</span>`
            : `<button class="nav-item${p.id === page ? " is-active" : ""}" data-act="goto" data-page="${p.id}"><i class="${p.icon}"></i><span>${esc(p.label)}</span>${p.id === "dashboard" && !same(state, published) ? '<em class="dot"></em>' : ""}</button>`
        ).join("");
        const g = conn.mode === "github";
        $("#sideFoot").innerHTML = `
            <div class="side-user">
                ${g && conn.user ? `<img src="${esc(conn.user.avatar)}" alt="">` : `<span class="avatar-ph"><i class="fas ${g ? "fa-user" : "fa-plug-circle-xmark"}"></i></span>`}
                <div><b>${g ? esc(conn.user ? conn.user.login : "GitHub") : "Offline"}</b><small>${g ? esc(conn.owner + "/" + conn.repo) : "Local draft only"}</small></div>
                <button class="icon-btn sm" data-act="${g ? "logout" : "to-login"}" title="${g ? "Sign out" : "Connect GitHub"}"><i class="fas ${g ? "fa-right-from-bracket" : "fa-plug"}"></i></button>
            </div>`;
    }

    function captureFocus() {
        const a = document.activeElement;
        if (!a || !editor.contains(a) || !a.dataset.key) return null;
        return { key: a.dataset.key, s: a.selectionStart, e: a.selectionEnd };
    }
    function restoreFocus(f) {
        if (!f) return;
        const el = $$("[data-key]", editor).find(x => x.dataset.key === f.key);
        if (!el) return;
        el.focus({ preventScroll: true });
        try { if (f.s != null) el.setSelectionRange(f.s, f.e); } catch (e) { /* not a text input */ }
    }

    function renderPage(keepScroll) {
        const pg = pageById(page) || PAGES[0];
        const scroll = editorScroll.scrollTop;
        const focus = captureFocus();
        $("#pageTitle").textContent = pg.label;
        $("#pageKicker").textContent = conn.mode === "github" ? `${conn.owner}/${conn.repo}` : "Offline";
        const body = pg.render ? pg.render() : pg.fields.map(f => fieldHTML(f, "")).join("");
        editor.innerHTML = `
            <header class="page-head">
                <div class="page-icon"><i class="${pg.icon}"></i></div>
                <div><h2>${esc(pg.label)}</h2><p>${esc(pg.desc || "")}</p></div>
                ${pg.preview !== undefined && pg.preview !== null ? `<button class="btn btn-ghost btn-sm hide-sm" data-act="peek" data-target="${pg.preview}"><i class="fas fa-eye"></i><span>Show in preview</span></button>` : ""}
            </header>
            <div class="page-body">${body}</div>`;
        if (keepScroll) editorScroll.scrollTop = scroll;
        restoreFocus(focus);
        renderNav();
        if (page === "dashboard") loadCommits();
    }

    function goto(id) {
        if (!pageById(id)) return;
        page = id;
        editorScroll.scrollTop = 0;
        renderPage(false);
        closeSide();
        const pg = pageById(id);
        if (pg.preview) sendPreview({ type: "portfolio:goto", id: pg.preview });
        history.replaceState(null, "", "#" + id);
    }

    /* =====================================================
       CHANGE PIPELINE: dirty state, draft, preview
    ===================================================== */
    function countPendingUploads(obj = state) {
        let n = 0;
        walkStrings(clone(obj), v => { if (isData(v)) n++; });
        return n;
    }

    function updateStatus() {
        const pill = $("#statusPill");
        const dirty = !same(state, published);
        pill.className = "status-pill " + (dirty ? "is-dirty" : "is-clean");
        $("span", pill).textContent = dirty
            ? (conn.mode === "github" ? "Unpublished changes" : "Draft saved locally")
            : (conn.mode === "github" ? "Published" : "No local changes");
        $$('[data-act="publish"]').forEach(b => b.classList.toggle("has-changes", dirty));
        const dot = $('.nav-item[data-page="dashboard"] .dot');
        if (dirty && !dot) renderNav();
        else if (!dirty && dot) dot.remove();
    }

    const saveDraft = debounce(() => {
        if (same(state, published)) { store.del(DRAFT_KEY); store.del(DRAFT_TIME_KEY); return; }
        const ok = store.set(DRAFT_KEY, state);
        store.set(DRAFT_TIME_KEY, Date.now());
        if (!ok) toast("Draft is too large to auto-save in the browser (big uploads). Publish or export to keep it.", "warn");
    }, 400);

    const pushPreview = debounce(() => sendPreview({ type: "portfolio:content", content: withUploads(state) }), 200);

    function changed(rerender) {
        updateStatus();
        saveDraft();
        pushPreview();
        if (rerender) renderPage(true);
    }

    /* =====================================================
       EDITOR EVENTS
    ===================================================== */
    editor.addEventListener("input", e => {
        const el = e.target.closest("[data-bind]");
        if (!el) return;
        const path = el.dataset.bind;
        const v = el.type === "checkbox" ? el.checked : el.value;
        setPath(state, path, v);
        $$(`[data-bind="${CSS.escape(path)}"]`, editor).forEach(o => { if (o !== el && o.type !== "checkbox") o.value = v; });
        const ic = $(`[data-icon-for="${CSS.escape(path)}"]`, editor);
        if (ic) ic.className = v || "fas fa-icons";
        // live-update list item titles
        const li = el.closest(".list-item");
        if (li) {
            const f = listSchemas[li.dataset.list];
            const item = getPath(state, `${li.dataset.list}.${li.dataset.index}`);
            if (f) {
                $(".li-text b", li).textContent = itemTitle(f, item, +li.dataset.index);
                const sub = f.subOf ? f.subOf(item) : "";
                let small = $(".li-text small", li);
                if (sub && !small) { small = document.createElement("small"); $(".li-text", li).appendChild(small); }
                if (small) small.textContent = sub;
                const icEl = $(".li-icon i", li);
                if (icEl && f.iconOf) icEl.className = f.iconOf(item) || "";
            }
        }
        changed(false);
    });

    // chips (string arrays)
    editor.addEventListener("keydown", e => {
        const inp = e.target.closest("[data-chip-input]");
        if (!inp) return;
        const path = inp.dataset.chipInput;
        const arr = Array.isArray(getPath(state, path)) ? getPath(state, path) : [];
        if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            const vals = inp.value.split(",").map(s => s.trim()).filter(Boolean);
            if (!vals.length) return;
            setPath(state, path, arr.concat(vals));
            inp.value = "";
            changed(true);
        } else if (e.key === "Backspace" && !inp.value && arr.length) {
            setPath(state, path, arr.slice(0, -1));
            changed(true);
        }
    });
    editor.addEventListener("focusout", e => {
        const inp = e.target.closest && e.target.closest("[data-chip-input]");
        if (!inp || !inp.value.trim()) return;
        const path = inp.dataset.chipInput;
        const arr = Array.isArray(getPath(state, path)) ? getPath(state, path) : [];
        setPath(state, path, arr.concat(inp.value.split(",").map(s => s.trim()).filter(Boolean)));
        inp.value = "";
        changed(true);
    });
    editor.addEventListener("click", e => {
        const box = e.target.closest(".chips-input");
        if (box && e.target === box) $(".chip-entry", box).focus();
    });

    // uploads
    editor.addEventListener("change", async e => {
        const inp = e.target.closest("input[type=file][data-upload]");
        if (!inp || !inp.files[0]) return;
        const file = inp.files[0];
        const path = inp.dataset.upload;
        if (file.size > 15 * 1024 * 1024) { toast("File is larger than 15 MB.", "error"); return; }
        try {
            const url = inp.dataset.kind === "image" ? await resizeImage(file, 900) : await readDataUrl(file);
            setPath(state, path, url);
            changed(true);
            toast(conn.mode === "github" ? "Added — it uploads when you publish." : "Added to your local draft.", "success");
        } catch (err) {
            toast("Couldn't read that file.", "error");
        }
    });

    function readDataUrl(file) {
        return new Promise((res, rej) => {
            const r = new FileReader();
            r.onload = () => res(r.result);
            r.onerror = rej;
            r.readAsDataURL(file);
        });
    }

    async function resizeImage(file, max) {
        if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) return readDataUrl(file);
        const src = await readDataUrl(file);
        const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        if (scale === 1 && file.size < 400 * 1024) return src;
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        let out = c.toDataURL("image/webp", 0.88);
        if (!out.startsWith("data:image/webp")) out = c.toDataURL(file.type === "image/png" ? "image/png" : "image/jpeg", 0.88);
        return out.length < src.length ? out : src;
    }

    // drag & drop reorder of list items
    let drag = null;
    editor.addEventListener("dragstart", e => {
        const h = e.target.closest(".li-handle");
        if (!h) return;
        const li = h.closest(".list-item");
        drag = { list: li.dataset.list, from: +li.dataset.index };
        li.classList.add("is-dragging");
        e.dataTransfer.effectAllowed = "move";
        try { e.dataTransfer.setData("text/plain", ""); e.dataTransfer.setDragImage(li, 20, 20); } catch (err) { /* noop */ }
    });
    editor.addEventListener("dragover", e => {
        if (!drag) return;
        const li = e.target.closest(".list-item");
        if (!li || li.dataset.list !== drag.list) return;
        e.preventDefault();
        $$(".list-item.drop-before, .list-item.drop-after", editor).forEach(x => x.classList.remove("drop-before", "drop-after"));
        const r = li.getBoundingClientRect();
        li.classList.add(e.clientY < r.top + r.height / 2 ? "drop-before" : "drop-after");
    });
    editor.addEventListener("drop", e => {
        if (!drag) return;
        const li = e.target.closest(".list-item");
        if (!li || li.dataset.list !== drag.list) return;
        e.preventDefault();
        let to = +li.dataset.index + (li.classList.contains("drop-after") ? 1 : 0);
        if (to > drag.from) to--;
        moveItem(drag.list, drag.from, to);
    });
    editor.addEventListener("dragend", () => {
        drag = null;
        $$(".is-dragging, .drop-before, .drop-after", editor).forEach(x => x.classList.remove("is-dragging", "drop-before", "drop-after"));
    });

    function remapOpen(listPath, map) {
        const prefix = listPath + ".";
        const moved = [];
        [...openItems].forEach(p => {
            if (!p.startsWith(prefix)) return;
            const rest = p.slice(prefix.length);
            const idx = parseInt(rest, 10);
            if (String(idx) !== rest.split(".")[0]) return;
            openItems.delete(p);
            const n = map(idx);
            if (n != null) moved.push(prefix + n + rest.slice(String(idx).length));
        });
        moved.forEach(p => openItems.add(p));
    }

    function moveItem(listPath, from, to) {
        const arr = getPath(state, listPath);
        if (!Array.isArray(arr) || from === to || to < 0 || to >= arr.length) return;
        const [it] = arr.splice(from, 1);
        arr.splice(to, 0, it);
        remapOpen(listPath, i => {
            if (i === from) return to;
            if (from < to && i > from && i <= to) return i - 1;
            if (from > to && i >= to && i < from) return i + 1;
            return i;
        });
        changed(true);
    }

    /* =====================================================
       GLOBAL CLICK ACTIONS
    ===================================================== */
    document.addEventListener("click", async e => {
        const btn = e.target.closest("[data-act]");
        if (!btn) return;
        const act = btn.dataset.act;
        const path = btn.dataset.path;
        const idx = btn.dataset.index != null ? +btn.dataset.index : null;

        switch (act) {
            case "goto": goto(btn.dataset.page); break;
            case "open-side": openSide(); break;
            case "close-side": closeSide(); break;
            case "toggle-preview": togglePreview(); break;
            case "reload-preview": loadPreview(); break;
            case "peek":
                if (!previewVisible()) togglePreview(true);
                sendPreview({ type: "portfolio:goto", id: btn.dataset.target });
                break;
            case "publish": publish(); break;
            case "toggle": {
                const li = btn.closest(".list-item");
                const open = !li.classList.contains("is-open");
                li.classList.toggle("is-open", open);
                open ? openItems.add(path) : openItems.delete(path);
                break;
            }
            case "add": {
                const f = listSchemas[path];
                const arr = Array.isArray(getPath(state, path)) ? getPath(state, path) : [];
                arr.push(f && f.newItem ? f.newItem() : {});
                setPath(state, path, arr);
                const np = `${path}.${arr.length - 1}`;
                openItems.add(np);
                changed(true);
                const li = $(`.list-item[data-list="${CSS.escape(path)}"][data-index="${arr.length - 1}"]`, editor);
                if (li) {
                    li.scrollIntoView({ behavior: "smooth", block: "center" });
                    li.classList.add("flash");
                    const first = $("input.input, textarea.input", li);
                    if (first) setTimeout(() => { first.focus({ preventScroll: true }); first.select && first.select(); }, 250);
                }
                break;
            }
            case "del": {
                const f = listSchemas[path];
                const item = getPath(state, `${path}.${idx}`);
                const ok = await confirmDialog({
                    title: "Delete this item?",
                    text: `“${itemTitle(f || {}, item, idx)}” will be removed from your draft.`,
                    ok: "Delete", danger: true
                });
                if (!ok) return;
                getPath(state, path).splice(idx, 1);
                remapOpen(path, i => i === idx ? null : i > idx ? i - 1 : i);
                changed(true);
                toast("Item deleted", "info");
                break;
            }
            case "dup": {
                const arr = getPath(state, path);
                arr.splice(idx + 1, 0, clone(arr[idx]));
                remapOpen(path, i => i > idx ? i + 1 : i);
                openItems.add(`${path}.${idx + 1}`);
                changed(true);
                break;
            }
            case "up": moveItem(path, idx, idx - 1); break;
            case "down": moveItem(path, idx, idx + 1); break;
            case "chip-del": {
                const arr = getPath(state, path);
                arr.splice(idx, 1);
                changed(true);
                break;
            }
            case "clear":
                setPath(state, path, "");
                changed(true);
                break;
            case "pick-icon": openIconPicker(path); break;
            case "preset": {
                const p = THEME_PRESETS.find(x => x.name === btn.dataset.name);
                if (!p) return;
                state.theme = Object.assign({}, state.theme, { accent: p.accent, accent2: p.accent2, sun: p.sun });
                changed(true);
                break;
            }
            case "export-json": download(`portfolio-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(state, null, 2), "application/json"); break;
            case "import-json": $("#importFile").click(); break;
            case "download-js": download("content.js", serialize(state), "text/javascript"); break;
            case "discard": {
                const ok = await confirmDialog({ title: "Discard all unpublished changes?", text: "Your draft will be reset to the last published version.", ok: "Discard", danger: true });
                if (!ok) return;
                state = clone(published);
                store.del(DRAFT_KEY);
                changed(true);
                toast("Draft discarded", "info");
                break;
            }
            case "logout": {
                if (!same(state, published)) {
                    const ok = await confirmDialog({ title: "Sign out?", text: "Your unpublished draft stays saved in this browser.", ok: "Sign out" });
                    if (!ok) return;
                }
                store.del(TOKEN_KEY); store.del(TOKEN_KEY, sessionStorage); store.del(CONN_KEY);
                location.hash = "";
                location.reload();
                break;
            }
            case "to-login":
                store.del(CONN_KEY);
                showLogin();
                break;
        }
    });

    document.addEventListener("change", e => {
        if (e.target.id === "siteUrlInput") {
            conn.siteUrl = e.target.value.trim();
            saveConn();
            $("#liveLink").href = conn.siteUrl || "index.html";
            toast("Site URL saved", "success");
        }
    });

    $("#importFile").addEventListener("change", async e => {
        const file = e.target.files[0];
        e.target.value = "";
        if (!file) return;
        try {
            const data = JSON.parse(await file.text());
            if (!data || typeof data !== "object" || !data.profile) throw new Error("Not a portfolio backup");
            const ok = await confirmDialog({ title: "Import this backup?", text: "It replaces your current draft. Nothing is published until you click Publish.", ok: "Import" });
            if (!ok) return;
            state = data;
            changed(true);
            toast("Backup imported", "success");
        } catch (err) {
            toast("Invalid backup file: " + esc(err.message), "error");
        }
    });

    function download(name, text, type) {
        const url = URL.createObjectURL(new Blob([text], { type }));
        const a = Object.assign(document.createElement("a"), { href: url, download: name });
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    document.addEventListener("keydown", e => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && !$("#app").hidden) {
            e.preventDefault();
            publish();
        }
        if (e.key === "Escape") { closeModal(null); closeSide(); }
    });

    window.addEventListener("beforeunload", e => {
        if (conn && conn.mode === "github" && !same(state, published)) { e.preventDefault(); e.returnValue = ""; }
    });

    /* =====================================================
       SIDEBAR + PREVIEW
    ===================================================== */
    const appEl = $("#app");
    function openSide() { appEl.classList.add("side-open"); }
    function closeSide() { appEl.classList.remove("side-open"); }

    const iframe = $("#previewIframe");
    let previewReady = false;
    function previewVisible() { return appEl.classList.contains("preview-on"); }
    function togglePreview(force) {
        const on = force != null ? force : !previewVisible();
        appEl.classList.toggle("preview-on", on);
        ui.preview = on;
        store.set(UI_KEY, ui);
        if (on && !previewReady) loadPreview();
        requestAnimationFrame(fitPreview);
    }
    function loadPreview() {
        previewReady = false;
        iframe.src = "index.html?preview=1&t=" + Date.now();
    }
    iframe.addEventListener("load", () => {
        if (iframe.src === "about:blank") return;
        previewReady = true;
        sendPreview({ type: "portfolio:content", content: withUploads(state) });
        const pg = pageById(page);
        if (pg && pg.preview) setTimeout(() => sendPreview({ type: "portfolio:goto", id: pg.preview }), 120);
    });
    function sendPreview(msg) {
        if (!previewReady || !iframe.contentWindow) return;
        try { iframe.contentWindow.postMessage(JSON.parse(JSON.stringify(msg)), location.origin === "null" ? "*" : location.origin); } catch (e) { /* noop */ }
    }

    function setDevice(d) {
        ui.device = d;
        store.set(UI_KEY, ui);
        $$(".seg-btn").forEach(b => b.classList.toggle("is-on", b.dataset.device === d));
        fitPreview();
    }
    $$(".seg-btn").forEach(b => b.addEventListener("click", () => setDevice(b.dataset.device)));

    function fitPreview() {
        const stage = $("#previewStage"), frame = $("#previewFrame");
        if (!stage || !previewVisible()) return;
        const W = stage.clientWidth - 24, H = stage.clientHeight - 24;
        if (ui.device === "mobile") {
            const fw = 390, fh = 844;
            const s = Math.min(1, W / fw, H / fh);
            frame.className = "preview-frame is-mobile";
            Object.assign(frame.style, { width: fw + "px", height: fh + "px", transform: `scale(${s})` });
        } else {
            const fw = 1280;
            const s = Math.min(1, W / fw);
            frame.className = "preview-frame is-desktop";
            Object.assign(frame.style, { width: fw + "px", height: (H / s) + "px", transform: `scale(${s})` });
        }
    }
    if ("ResizeObserver" in window) new ResizeObserver(fitPreview).observe($("#previewStage"));
    window.addEventListener("resize", fitPreview);

    /* =====================================================
       MODALS, ICON PICKER, TOASTS
    ===================================================== */
    const modal = $("#modal"), modalCard = $("#modalCard");
    let modalResolve = null;

    function openModal(html, onMount) {
        return new Promise(res => {
            if (modalResolve) modalResolve(null);
            modalResolve = res;
            modalCard.innerHTML = html;
            modal.classList.add("is-open");
            modal.setAttribute("aria-hidden", "false");
            onMount && onMount(modalCard);
            const f = $("[autofocus]", modalCard) || $("button.btn-primary, button.btn-danger", modalCard);
            f && setTimeout(() => f.focus(), 50);
        });
    }
    function closeModal(value) {
        if (!modal.classList.contains("is-open")) return;
        modal.classList.remove("is-open");
        modal.setAttribute("aria-hidden", "true");
        iconTarget = null;
        const r = modalResolve;
        modalResolve = null;
        r && r(value);
    }
    modal.addEventListener("click", e => {
        if (e.target.closest("[data-modal-close]")) closeModal(null);
        const v = e.target.closest("[data-modal-value]");
        if (v) closeModal(v.dataset.modalValue);
    });

    function confirmDialog({ title, text, ok = "Confirm", danger = false }) {
        return openModal(`
            <div class="modal-head"><span class="modal-icon ${danger ? "danger" : ""}"><i class="fas ${danger ? "fa-triangle-exclamation" : "fa-circle-question"}"></i></span><h3>${esc(title)}</h3></div>
            <p class="modal-text">${esc(text)}</p>
            <div class="modal-actions">
                <button class="btn btn-ghost btn-sm" data-modal-close>Cancel</button>
                <button class="btn ${danger ? "btn-danger" : "btn-primary"} btn-sm" data-modal-value="ok">${esc(ok)}</button>
            </div>`).then(v => v === "ok");
    }

    function openIconPicker(path) {
        iconTarget = path;
        const current = getPath(state, path) || "";
        const grid = q => window.ICON_LIST
            .filter(c => !q || c.toLowerCase().includes(q.toLowerCase().replace(/\s+/g, "-")))
            .map(c => `<button class="icon-cell${c === current ? " is-on" : ""}" data-icon="${c}" title="${c}"><i class="${c}"></i><span>${c.replace(/^fa[bsr] fa-/, "")}</span></button>`)
            .join("") || '<p class="muted pad">No match — type a custom class below.</p>';
        openModal(`
            <div class="modal-head"><span class="modal-icon"><i class="fas fa-icons"></i></span><h3>Choose an icon</h3>
                <button class="icon-btn sm" data-modal-close aria-label="Close"><i class="fas fa-xmark"></i></button></div>
            <div class="input-wrap"><i class="fas fa-magnifying-glass"></i><input class="input" id="iconSearch" placeholder="Search icons (github, code, rocket…)" autofocus></div>
            <div class="icon-grid" id="iconGrid">${grid("")}</div>
            <div class="icon-custom">
                <input class="input mono" id="iconCustom" value="${esc(current)}" placeholder="Any Font Awesome class, e.g. fab fa-react">
                <button class="btn btn-ghost btn-sm" id="iconNone">None</button>
                <button class="btn btn-primary btn-sm" id="iconApply">Use</button>
            </div>
            <p class="hint">Browse all at <a href="https://fontawesome.com/search?o=r&m=free" target="_blank" rel="noopener">fontawesome.com</a> (free icons).</p>`,
        card => {
            card.classList.add("wide");
            $("#iconSearch", card).addEventListener("input", e => { $("#iconGrid", card).innerHTML = grid(e.target.value.trim()); });
            $("#iconGrid", card).addEventListener("click", e => {
                const b = e.target.closest("[data-icon]");
                if (b) applyIcon(b.dataset.icon);
            });
            $("#iconApply", card).addEventListener("click", () => applyIcon($("#iconCustom", card).value.trim()));
            $("#iconNone", card).addEventListener("click", () => applyIcon(""));
        }).then(() => modalCard.classList.remove("wide"));
    }
    function applyIcon(cls) {
        if (!iconTarget) return;
        setPath(state, iconTarget, cls);
        closeModal(null);
        changed(true);
    }

    function toast(msg, type = "info", ms = 3200) {
        const icons = { success: "fa-circle-check", error: "fa-circle-xmark", warn: "fa-triangle-exclamation", info: "fa-circle-info" };
        const t = document.createElement("div");
        t.className = `toast ${type}`;
        t.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i><span>${msg}</span>`;
        $("#toasts").appendChild(t);
        requestAnimationFrame(() => t.classList.add("is-on"));
        setTimeout(() => { t.classList.remove("is-on"); setTimeout(() => t.remove(), 400); }, ms);
    }

    /* =====================================================
       GITHUB API
    ===================================================== */
    async function ghWith(token, path, opts = {}) {
        const res = await fetch("https://api.github.com" + path, {
            method: opts.method || "GET",
            cache: "no-store",
            headers: Object.assign({
                Accept: "application/vnd.github+json",
                Authorization: `Bearer ${token}`,
                "X-GitHub-Api-Version": "2022-11-28"
            }, opts.body ? { "Content-Type": "application/json" } : {}),
            body: opts.body ? JSON.stringify(opts.body) : undefined
        });
        if (!res.ok) {
            let msg = res.statusText || "Request failed";
            try { const j = await res.json(); if (j.message) msg = j.message; } catch (e) { /* noop */ }
            const err = new Error(`${res.status} · ${msg}`);
            err.status = res.status;
            throw err;
        }
        return res.status === 204 ? null : res.json();
    }
    const gh = (path, opts) => ghWith(conn.token, path, opts);
    const repoPath = p => `/repos/${encodeURIComponent(conn.owner)}/${encodeURIComponent(conn.repo)}${p}`;

    async function loadRemote() {
        try {
            const f = await gh(repoPath(`/contents/${CONTENT_PATH}?ref=${encodeURIComponent(conn.branch)}`));
            remoteSha = f.sha;
            const data = parseContent(b64ToUtf8(f.content || ""));
            if (data) published = data;
            else toast(`Couldn't parse ${CONTENT_PATH} from GitHub; using the deployed copy.`, "warn", 6000);
        } catch (e) {
            if (e.status === 404) { remoteSha = null; toast(`${CONTENT_PATH} not found on ${conn.branch} — it will be created on publish.`, "warn", 6000); }
            else throw e;
        }
        state = clone(published);
    }

    function walkStrings(obj, fn) {
        if (Array.isArray(obj)) obj.forEach((v, i) => { if (typeof v === "string") { const r = fn(v); if (r !== undefined) obj[i] = r; } else if (v && typeof v === "object") walkStrings(v, fn); });
        else if (obj && typeof obj === "object") Object.keys(obj).forEach(k => { const v = obj[k]; if (typeof v === "string") { const r = fn(v); if (r !== undefined) obj[k] = r; } else if (v && typeof v === "object") walkStrings(v, fn); });
    }

    const MIME_EXT = {
        "image/webp": "webp", "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/svg+xml": "svg",
        "application/pdf": "pdf", "application/msword": "doc",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx"
    };

    function changedSections() {
        const names = { profile: "Profile", orbit: "Orbit planets", about: "About", numbers: "Number tiles", skills: "Skills", integrations: "Live stats", projects: "Projects", achievements: "Achievements", education: "Education", socials: "Socials", contact: "Contact", sections: "Sections", theme: "Theme", meta: "SEO", footer: "Footer" };
        const keys = new Set([...Object.keys(state), ...Object.keys(published)]);
        return [...keys].filter(k => !same(state[k], published[k])).map(k => names[k] || k);
    }

    async function publish() {
        if (publishing) return;
        if (conn.mode !== "github") return localPublish();
        const changes = changedSections();
        const uploads = countPendingUploads();
        if (!changes.length) { toast("Nothing to publish — you're up to date.", "info"); return; }

        const msg = await openModal(`
            <div class="modal-head"><span class="modal-icon"><i class="fas fa-cloud-arrow-up"></i></span><h3>Publish changes</h3></div>
            <p class="modal-text">This creates one commit on <b>${esc(conn.owner)}/${esc(conn.repo)}</b> (${esc(conn.branch)}). Netlify will redeploy automatically.</p>
            <div class="change-list">${changes.map(c => `<span class="chip-tag">${esc(c)}</span>`).join("")}${uploads ? `<span class="chip-tag accent"><i class="fas fa-paperclip"></i> ${uploads} upload${uploads > 1 ? "s" : ""}</span>` : ""}</div>
            <label class="field"><span class="field-label">Commit message</span><input class="input" id="commitMsg" value="Update ${esc(changes.slice(0, 3).join(", ").toLowerCase())} via admin" autofocus></label>
            <div class="modal-actions">
                <button class="btn btn-ghost btn-sm" data-modal-close>Cancel</button>
                <button class="btn btn-primary btn-sm" id="doPublish"><i class="fas fa-rocket"></i><span>Publish now</span></button>
            </div>`, card => {
            const go = () => closeModal($("#commitMsg", card).value.trim() || "Update portfolio content via admin");
            $("#doPublish", card).addEventListener("click", go);
            $("#commitMsg", card).addEventListener("keydown", e => { if (e.key === "Enter") go(); });
        });
        if (!msg) return;

        publishing = true;
        setPublishBusy(true);
        try {
            // Conflict check
            let current = null;
            try { current = await gh(repoPath(`/contents/${CONTENT_PATH}?ref=${encodeURIComponent(conn.branch)}`)); }
            catch (e) { if (e.status !== 404) throw e; }
            if (current && remoteSha && current.sha !== remoteSha) {
                const ok = await confirmDialog({ title: "Newer version on GitHub", text: "The content was changed elsewhere since you loaded it. Publishing will overwrite those changes with yours.", ok: "Overwrite", danger: true });
                if (!ok) return;
            }

            // Collect uploads → files
            const out = clone(state);
            const files = [];
            const stamp = Date.now().toString(36);
            let n = 0;
            walkStrings(out, v => {
                if (!isData(v)) return;
                const m = v.match(/^data:([^;,]+)[^,]*,/);
                const mime = m ? m[1] : "application/octet-stream";
                const ext = MIME_EXT[mime] || "bin";
                const path = `uploads/${stamp}-${++n}.${ext}`;
                files.push({ path, base64: v.slice(v.indexOf(",") + 1) });
                uploadCache[path] = v;
                return path;
            });
            const contentText = serialize(out);
            files.push({ path: CONTENT_PATH, base64: utf8ToB64(contentText) });

            // One atomic commit with the Git Data API
            const ref = await gh(repoPath(`/git/ref/heads/${encodeURIComponent(conn.branch)}`));
            const baseSha = ref.object.sha;
            const baseCommit = await gh(repoPath(`/git/commits/${baseSha}`));
            const tree = [];
            let contentBlobSha = null;
            for (const f of files) {
                const blob = await gh(repoPath("/git/blobs"), { method: "POST", body: { content: f.base64, encoding: "base64" } });
                tree.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
                if (f.path === CONTENT_PATH) contentBlobSha = blob.sha;
            }
            const newTree = await gh(repoPath("/git/trees"), { method: "POST", body: { base_tree: baseCommit.tree.sha, tree } });
            const commit = await gh(repoPath("/git/commits"), { method: "POST", body: { message: msg, tree: newTree.sha, parents: [baseSha] } });
            await gh(repoPath(`/git/refs/heads/${encodeURIComponent(conn.branch)}`), { method: "PATCH", body: { sha: commit.sha } });

            remoteSha = contentBlobSha;
            published = clone(out);
            state = clone(out);
            store.del(DRAFT_KEY);
            store.del(DRAFT_TIME_KEY);
            changed(true);
            toast(`Published! <a href="${esc(commit.html_url || `https://github.com/${conn.owner}/${conn.repo}/commit/${commit.sha}`)}" target="_blank" rel="noopener">View commit</a> · live in about a minute.`, "success", 7000);
        } catch (e) {
            toast("Publish failed: " + esc(e.message), "error", 7000);
        } finally {
            publishing = false;
            setPublishBusy(false);
        }
    }

    function setPublishBusy(on) {
        $$('[data-act="publish"]').forEach(b => {
            b.disabled = on;
            b.classList.toggle("is-busy", on);
        });
    }

    async function localPublish() {
        const v = await openModal(`
            <div class="modal-head"><span class="modal-icon"><i class="fas fa-plug-circle-xmark"></i></span><h3>You're offline</h3></div>
            <p class="modal-text">Offline mode can't push to GitHub. Either connect a token for one-click publishing, or download <code>content.js</code> and replace <code>${CONTENT_PATH}</code> in your repo yourself.</p>
            ${countPendingUploads() ? '<p class="modal-text warn"><i class="fas fa-triangle-exclamation"></i> Uploaded files will be embedded inside content.js. Connecting GitHub stores them as real files instead.</p>' : ""}
            <div class="modal-actions">
                <button class="btn btn-ghost btn-sm" data-modal-value="download"><i class="fas fa-download"></i><span>Download content.js</span></button>
                <button class="btn btn-primary btn-sm" data-modal-value="connect"><i class="fab fa-github"></i><span>Connect GitHub</span></button>
            </div>`);
        if (v === "download") download("content.js", serialize(state), "text/javascript");
        if (v === "connect") { store.del(CONN_KEY); showLogin(); }
    }

    /* =====================================================
       LOGIN / BOOT
    ===================================================== */
    function saveConn() {
        const meta = { mode: conn.mode, owner: conn.owner, repo: conn.repo, branch: conn.branch, siteUrl: conn.siteUrl, user: conn.user, remember: conn.remember };
        store.set(CONN_KEY, meta);
    }

    function showBoot(text) { $("#boot").hidden = false; $("#bootText").textContent = text; }
    function hideBoot() { $("#boot").hidden = true; }

    function showLogin(err) {
        hideBoot();
        $("#app").hidden = true;
        $("#login").hidden = false;
        const meta = store.get(CONN_KEY, {}) || {};
        $("#lgOwner").value = meta.owner || DEFAULTS.owner;
        $("#lgRepo").value = meta.repo || DEFAULTS.repo;
        $("#lgBranch").value = meta.branch || DEFAULTS.branch;
        $("#lgSite").value = meta.siteUrl || DEFAULTS.siteUrl;
        updateRepoSummary();
        const box = $("#lgError");
        box.hidden = !err;
        box.textContent = err || "";
        setTimeout(() => $("#lgToken").focus(), 50);
    }
    function updateRepoSummary() { $("#lgRepoSummary").textContent = `${$("#lgOwner").value}/${$("#lgRepo").value}`; }
    ["#lgOwner", "#lgRepo"].forEach(s => $(s).addEventListener("input", updateRepoSummary));
    $("#lgShow").addEventListener("click", () => {
        const t = $("#lgToken");
        t.type = t.type === "password" ? "text" : "password";
        $("#lgShow i").className = t.type === "password" ? "far fa-eye" : "far fa-eye-slash";
    });

    async function connectGitHub(c) {
        const info = await ghWith(c.token, `/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}`);
        if (!info.permissions || !info.permissions.push) throw new Error("This token can read the repo but can't write to it. Give it “Contents: Read and write”.");
        let user = null;
        try {
            const u = await ghWith(c.token, "/user");
            user = { login: u.login, name: u.name, avatar: u.avatar_url };
        } catch (e) { /* fine-grained tokens may not read /user */ }
        conn = Object.assign({}, c, { mode: "github", branch: c.branch || info.default_branch, user });
        await loadRemote();
    }

    $("#loginForm").addEventListener("submit", async e => {
        e.preventDefault();
        const c = {
            token: $("#lgToken").value.trim(),
            owner: $("#lgOwner").value.trim(),
            repo: $("#lgRepo").value.trim(),
            branch: $("#lgBranch").value.trim(),
            siteUrl: $("#lgSite").value.trim(),
            remember: $("#lgRemember").checked
        };
        if (!c.token) return;
        const btn = $("#lgSubmit");
        btn.disabled = true;
        btn.classList.add("is-busy");
        $("#lgError").hidden = true;
        try {
            await connectGitHub(c);
            store.del(TOKEN_KEY); store.del(TOKEN_KEY, sessionStorage);
            store.set(TOKEN_KEY, c.token, c.remember ? localStorage : sessionStorage);
            saveConn();
            $("#lgToken").value = "";
            enterApp();
        } catch (err) {
            const m = err.status === 401 ? "That token was rejected by GitHub. Check it and try again."
                : err.status === 404 ? "Repository not found — check the owner/name, and that the token has access to it."
                : err.message;
            $("#lgError").textContent = m;
            $("#lgError").hidden = false;
        } finally {
            btn.disabled = false;
            btn.classList.remove("is-busy");
        }
    });

    $("#lgOffline").addEventListener("click", () => {
        conn = { mode: "local", siteUrl: $("#lgSite").value.trim() || DEFAULTS.siteUrl, owner: $("#lgOwner").value.trim(), repo: $("#lgRepo").value.trim(), branch: $("#lgBranch").value.trim() };
        published = clone(window.PORTFOLIO);
        state = clone(published);
        saveConn();
        enterApp();
    });

    async function enterApp() {
        hideBoot();
        $("#login").hidden = true;
        $("#app").hidden = false;
        $("#liveLink").href = conn.siteUrl || "index.html";

        // Offer to restore an unsaved draft
        const draft = store.get(DRAFT_KEY);
        if (draft && !same(draft, published)) {
            const t = store.get(DRAFT_TIME_KEY);
            const ok = await confirmDialog({
                title: "Restore your draft?",
                text: `You have unpublished changes${t ? " from " + timeAgo(t) : ""}. Restore them, or start fresh from the ${conn.mode === "github" ? "published" : "deployed"} version?`,
                ok: "Restore draft"
            });
            if (ok) state = draft;
            else { store.del(DRAFT_KEY); store.del(DRAFT_TIME_KEY); }
        }

        const hash = location.hash.slice(1);
        page = pageById(hash) ? hash : "dashboard";
        renderPage(false);
        updateStatus();
        setDevice(ui.device || "desktop");
        if (ui.preview && window.innerWidth > 1180) togglePreview(true);
        toast(conn.mode === "github" ? `Connected to ${esc(conn.owner)}/${esc(conn.repo)}` : "Offline mode — edits stay in this browser", conn.mode === "github" ? "success" : "info");
    }

    async function boot() {
        if (window.Starfield) window.Starfield.init($("#starfield"), { density: "low", shooting: true, motion: true });
        const meta = store.get(CONN_KEY);
        const token = store.get(TOKEN_KEY) || store.get(TOKEN_KEY, null, sessionStorage);
        if (meta && meta.mode === "github" && token) {
            showBoot("Connecting to GitHub…");
            try {
                await connectGitHub(Object.assign({}, meta, { token }));
                saveConn();
                enterApp();
            } catch (e) {
                showLogin(e.status === 401 ? "Your saved token expired or was revoked. Paste a new one." : "Couldn't reach GitHub: " + e.message);
            }
        } else if (meta && meta.mode === "local") {
            conn = Object.assign({}, meta);
            enterApp();
        } else {
            showLogin();
        }
    }

    boot();
})();
