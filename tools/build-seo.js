// Regenerates the SEO blocks in index.html and sitemap.xml from data/content.js.
// The admin panel does this automatically on every publish; run manually with:
//   node tools/build-seo.js
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
global.window = {};
require(path.join(root, "data/content.js"));
const SEO = require(path.join(root, "js/seo.js"));
const C = window.PORTFOLIO;
const now = new Date().toISOString();
const file = path.join(root, "index.html");
const html = SEO.inject(fs.readFileSync(file, "utf8"), C, now);
if (!html) throw new Error("SEO markers not found in index.html");
fs.writeFileSync(file, html);
fs.writeFileSync(path.join(root, "sitemap.xml"), SEO.sitemap(C, now.slice(0, 10)));
console.log("index.html + sitemap.xml updated for", SEO.siteUrl(C));
