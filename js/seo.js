/* =========================================================
   SEO — static meta, structured data and a crawlable HTML copy
   of the content, generated from window.PORTFOLIO.
   Used by admin.js on publish (rewrites index.html between the
   SEO markers) and by Node to build it locally.
========================================================= */
(function (root) {
    "use strict";

    const DEFAULT_SITE = "https://yh-am-in.netlify.app/";
    const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const plain = s => String(s == null ? "" : s).replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
    const md = s => esc(s)
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>")
        .replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^)\s]*)\)/g, '<a href="$2">$1</a>');
    const list = a => Array.isArray(a) ? a : [];
    const isWeb = u => /^https?:\/\//i.test(String(u || ""));

    function siteUrl(C) {
        let s = String((C.meta || {}).siteUrl || DEFAULT_SITE).trim();
        if (!/^https?:\/\//i.test(s)) s = DEFAULT_SITE;
        return s.endsWith("/") ? s : s + "/";
    }
    function abs(u, site) {
        if (!u || /^data:/i.test(u)) return "";
        try { return new URL(u, site).href; } catch (e) { return ""; }
    }
    function fullName(C) {
        const p = C.profile || {};
        return [p.firstName, p.lastName].filter(Boolean).join(" ");
    }

    function jsonLd(C, now) {
        const site = siteUrl(C), p = C.profile || {}, m = C.meta || {};
        const name = fullName(C);
        const loc = String(p.location || "").split(",").map(s => s.trim()).filter(Boolean);
        const knows = [...new Set(list(C.skills).flatMap(s => list(s.items)).concat(list(C.orbit).map(o => o.label)))].filter(Boolean);
        const person = {
            "@type": "Person",
            "@id": site + "#person",
            name,
            alternateName: [p.brand, String(p.firstName || "").replace(/^md\.?\s*/i, "") + " " + (p.lastName || "")].filter(Boolean).map(s => s.trim()),
            url: site,
            image: abs(p.avatar, site) || undefined,
            jobTitle: m.jobTitle || list(p.roles).find(r => /developer|engineer|programmer/i.test(r)) || list(p.roles)[0] || "Software Developer",
            description: plain(p.bio || m.description),
            email: p.email ? "mailto:" + p.email : undefined,
            address: loc.length ? { "@type": "PostalAddress", addressLocality: loc[0], addressCountry: loc[loc.length - 1] } : undefined,
            alumniOf: list(C.education).filter(e => e.school).map(e => ({ "@type": "EducationalOrganization", name: e.school })),
            knowsAbout: knows.length ? knows : undefined,
            sameAs: list(C.socials).map(s => s.url).filter(isWeb)
        };
        const website = {
            "@type": "WebSite",
            "@id": site + "#website",
            url: site,
            name: m.title || name,
            inLanguage: "en",
            author: { "@id": site + "#person" }
        };
        const profile = {
            "@type": "ProfilePage",
            "@id": site + "#profile",
            url: site,
            name: m.title || name,
            description: m.description || undefined,
            dateModified: now,
            isPartOf: { "@id": site + "#website" },
            mainEntity: { "@id": site + "#person" }
        };
        const projects = list(C.projects).filter(pr => pr.title).map(pr => ({
            "@type": "SoftwareSourceCode",
            name: pr.title,
            description: plain(pr.desc) || undefined,
            url: pr.live || pr.github || undefined,
            codeRepository: pr.github || undefined,
            image: abs(pr.banner, site) || undefined,
            keywords: list(pr.tags).join(", ") || undefined,
            author: { "@id": site + "#person" }
        }));
        const graph = [profile, website, person];
        if (projects.length) graph.push({ "@type": "ItemList", "@id": site + "#projects", name: "Projects", itemListElement: projects.map((pr, i) => ({ "@type": "ListItem", position: i + 1, item: pr })) });
        return JSON.stringify({ "@context": "https://schema.org", "@graph": graph }, (k, v) => v === undefined || (Array.isArray(v) && !v.length) ? undefined : v, 2)
            .replace(/</g, "\\u003c");
    }

    function head(C, now) {
        const site = siteUrl(C), p = C.profile || {}, m = C.meta || {};
        const name = fullName(C);
        const title = m.title || name;
        const desc = m.description || plain(p.bio);
        const image = abs(m.image || "img/og-image.png", site);
        const avatar = p.avatar && !/^data:/i.test(p.avatar) ? p.avatar : "";
        const parts = name.split(" ");
        const I = "    ";
        return [
            `<title>${esc(title)}</title>`,
            `<meta name="description" content="${esc(desc)}">`,
            `<meta name="author" content="${esc(name)}">`,
            `<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">`,
            `<link rel="canonical" href="${esc(site)}">`,
            `<meta property="og:type" content="profile">`,
            `<meta property="og:site_name" content="${esc(name)}">`,
            `<meta property="og:title" content="${esc(title)}">`,
            `<meta property="og:description" content="${esc(desc)}">`,
            `<meta property="og:url" content="${esc(site)}">`,
            `<meta property="og:image" content="${esc(image)}">`,
            `<meta property="og:image:width" content="1200">`,
            `<meta property="og:image:height" content="630">`,
            `<meta property="og:image:alt" content="${esc(title)}">`,
            `<meta property="og:locale" content="en_US">`,
            `<meta property="profile:first_name" content="${esc(parts.slice(0, -1).join(" ") || name)}">`,
            `<meta property="profile:last_name" content="${esc(parts.slice(-1)[0] || "")}">`,
            `<meta name="twitter:card" content="summary_large_image">`,
            `<meta name="twitter:title" content="${esc(title)}">`,
            `<meta name="twitter:description" content="${esc(desc)}">`,
            `<meta name="twitter:image" content="${esc(image)}">`,
            avatar ? `<link rel="preload" as="image" href="${esc(avatar)}">` : "",
            `<script type="application/ld+json">\n${jsonLd(C, now)}\n${I}</script>`
        ].filter(Boolean).join("\n" + I);
    }

    /* Crawlable copy of the content. Replaced by the interactive app as soon as JS runs;
       also what visitors without JavaScript (and non-JS crawlers) see. */
    function body(C) {
        const p = C.profile || {}, a = C.about || {};
        const name = fullName(C);
        const link = (u, t) => u ? `<a href="${esc(u)}">${t}</a>` : t;
        const out = [];
        out.push(`<header><h1>${esc(name)}</h1><p>${esc(list(p.roles).join(" · "))}</p><p>${md(p.bio)}</p></header>`);
        if (list(a.paragraphs).length) out.push(`<section><h2>About</h2>${list(a.paragraphs).map(t => `<p>${md(t)}</p>`).join("")}</section>`);
        if (list(C.skills).length) out.push(`<section><h2>Skills</h2><ul>${list(C.skills).map(s => `<li><strong>${esc(s.title)}:</strong> ${esc(list(s.items).join(", "))}</li>`).join("")}</ul></section>`);
        if (list(C.projects).length) out.push(`<section><h2>Projects</h2><ul>${list(C.projects).map(pr =>
            `<li><h3>${link(pr.live || pr.github, esc(pr.title))}</h3><p>${md(pr.desc)}</p>${pr.github ? `<p><a href="${esc(pr.github)}">Source code</a>${pr.live ? ` · <a href="${esc(pr.live)}">Live demo</a>` : ""}</p>` : ""}</li>`).join("")}</ul></section>`);
        if (list(C.achievements).length) out.push(`<section><h2>Achievements</h2><ul>${list(C.achievements).map(x =>
            `<li>${esc(x.year)} — ${esc(x.title)}${x.team ? ` (Team ${esc(x.team)})` : ""}${x.type === "hackathon" && x.award ? ` — ${esc(x.award)}` : x.rank ? ` — Rank ${esc(x.rank)}` : ""}</li>`).join("")}</ul></section>`);
        if (list(C.education).length) out.push(`<section><h2>Education</h2><ul>${list(C.education).map(e =>
            `<li>${esc(e.degree)}, ${esc(e.school)} (${esc(e.period)})${e.badge ? ` — ${esc(e.badge)}` : ""}</li>`).join("")}</ul></section>`);
        const contact = [p.email ? `<a href="mailto:${esc(p.email)}">${esc(p.email)}</a>` : "", ...list(C.socials).filter(s => isWeb(s.url)).map(s => `<a href="${esc(s.url)}" rel="me">${esc(s.label)}</a>`)].filter(Boolean);
        if (contact.length) out.push(`<section><h2>Contact</h2><p>${contact.join(" · ")}</p></section>`);
        return `<div class="prerender">\n${out.join("\n")}\n</div>`;
    }

    function sitemap(C, date) {
        return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${esc(siteUrl(C))}</loc>
    <lastmod>${date}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`;
    }

    /* Rewrite the marked blocks of index.html. Returns null if the markers are missing. */
    function inject(html, C, now) {
        const H = /(<!-- SEO:HEAD:START -->)[\s\S]*?(\n[ \t]*<!-- SEO:HEAD:END -->)/;
        const B = /(<!-- SEO:BODY:START -->)[\s\S]*?(<!-- SEO:BODY:END -->)/;
        if (!H.test(html) || !B.test(html)) return null;
        return html
            .replace(H, (_, a, b) => `${a}\n    ${head(C, now)}${b}`)
            .replace(B, (_, a, b) => `${a}\n${body(C)}\n${b}`);
    }

    const api = { head, body, jsonLd, sitemap, inject, siteUrl };
    root.PortfolioSEO = api;
    if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
