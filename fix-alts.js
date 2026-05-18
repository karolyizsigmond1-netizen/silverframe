// SEO alt-text filler — fills empty "alt": "" in content.json based on
// each photo's portfolio category and (for bundles) the couple/event title.
// Run once, then `node build.js` to regenerate HTML.

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'content.json');
const BAK = path.join(__dirname, 'content.json.seo-bak');

// Back up the original once (don't overwrite an existing backup).
if (!fs.existsSync(BAK)) {
  fs.copyFileSync(SRC, BAK);
  console.log('Backed up to content.json.seo-bak');
}

const data = JSON.parse(fs.readFileSync(SRC, 'utf8'));

// Hungarian category labels. build.js translates these to English via i18n.json
// for the /en/ pages, so we only need to write good Hungarian alts here.
const CATEGORY_HU = {
  wedding:            'Esküvői fotózás Szegeden',
  'wedding-creative': 'Esküvői kreatív fotózás Szegeden',
  event:              'Rendezvényfotózás Szegeden',
  maternity:          'Kismama fotózás Szegeden',
  boudoir:            'Boudoir fotózás Szegeden',
  family:             'Családi fotózás Szegeden',
  couple:             'Páros és jegyes fotózás Szegeden',
  business:           'Üzleti portré fotózás Szegeden',
  'real-estate':      'Ingatlanfotózás Szegeden',
  portrait:           'Portré fotózás Szegeden',
  'portfolio-model':  'Modell portfólió fotózás Szegeden',
  pet:                'Kisállat fotózás Szegeden',
  product:            'Termékfotózás Szegeden',
};

let filledBundle = 0;
let filledImage  = 0;
let filledSingle = 0;
let filledIntro  = 0;
let filledHero   = 0;

function setIfEmpty(obj, key, val) {
  if (!obj) return false;
  if (obj[key] === '' || obj[key] === undefined || obj[key] === null) {
    obj[key] = val;
    return true;
  }
  return false;
}

// ── PORTFOLIO PAGES ──
for (const catId of Object.keys(data.portfolioPages || {})) {
  const page = data.portfolioPages[catId];
  const catAlt = CATEGORY_HU[catId] || 'Fotózás Szegeden';
  if (!Array.isArray(page.gallery)) continue;

  for (const item of page.gallery) {
    if (item.type === 'bundle') {
      const parts = [catAlt];
      const id = [item.title, item.subtitle].filter(Boolean).join(', ');
      if (id) parts.push(id);
      const bundleAlt = parts.join(' — ');

      if (setIfEmpty(item, 'alt', bundleAlt)) filledBundle++;
      if (Array.isArray(item.images)) {
        for (const img of item.images) {
          if (setIfEmpty(img, 'alt', bundleAlt)) filledImage++;
        }
      }
    } else {
      // single
      if (setIfEmpty(item, 'alt', catAlt)) filledSingle++;
    }
  }
}

// ── SERVICE PAGES ──
for (const sId of Object.keys(data.servicePages || {})) {
  const page = data.servicePages[sId];
  // service pages share IDs with portfolios (mostly). map portfolio-model →
  // portfolio-model alt; others use the same id.
  const catAlt = CATEGORY_HU[sId] || 'Fotózás Szegeden';

  if (page.introImage && setIfEmpty(page.introImage, 'alt', catAlt)) filledIntro++;
  if (page.heroImage && typeof page.heroImage === 'object' && setIfEmpty(page.heroImage, 'alt', catAlt)) filledHero++;

  if (Array.isArray(page.gallery)) {
    for (const item of page.gallery) {
      if (setIfEmpty(item, 'alt', catAlt)) filledSingle++;
    }
  }

  // before/after pairs occasionally have alts too
  if (Array.isArray(page.beforeAfterPairs)) {
    for (const p of page.beforeAfterPairs) {
      if (p.beforeAlt !== undefined && setIfEmpty(p, 'beforeAlt', catAlt + ' — utómunka előtt')) filledSingle++;
      if (p.afterAlt  !== undefined && setIfEmpty(p, 'afterAlt',  catAlt + ' — utómunka után'))  filledSingle++;
    }
  }
}

// ── GENERIC PAGES (about, index, etc.) — any object with .alt: "" gets the global category fallback ──
function walk(node, ctx = 'Silverframe Studio — fotózás Szegeden') {
  if (Array.isArray(node)) {
    for (const c of node) walk(c, ctx);
    return;
  }
  if (!node || typeof node !== 'object') return;
  if ('alt' in node && node.alt === '' && (node.src || node.image || node.cover || node.img)) {
    node.alt = ctx;
    filledSingle++;
  }
  for (const k of Object.keys(node)) {
    if (k === 'gallery' || k === 'portfolioPages' || k === 'servicePages') continue; // already handled
    walk(node[k], ctx);
  }
}
walk(data.pages || {}, 'Silverframe Studio — fotózás Szegeden');
walk(data.global || {}, 'Silverframe Studio — fotózás Szegeden');

fs.writeFileSync(SRC, JSON.stringify(data, null, 2));

console.log('\nFilled alt counts:');
console.log('  Bundle covers      :', filledBundle);
console.log('  Bundle child images:', filledImage);
console.log('  Single gallery imgs:', filledSingle);
console.log('  Service intro/hero :', filledIntro + filledHero);
console.log('  Total              :', filledBundle + filledImage + filledSingle + filledIntro + filledHero);
console.log('\nDone. Now run:  node build.js');
