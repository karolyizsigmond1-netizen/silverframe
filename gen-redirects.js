// Generates _redirects from URL_MAP in build.js.
// Run after each build to keep redirects in sync with the URL map.
const fs = require('fs');
const path = require('path');

// Re-use URL_MAP by eval-loading build.js up to the map definition. Simpler: hard-code mirror here.
const URL_MAP = {
  page: {
    about:        { hu: 'rolam',           en: 'about',         oldHu: 'about',        oldEn: 'about' },
    portfolio:    { hu: 'galeria',         en: 'gallery',       oldHu: 'portfolio',    oldEn: 'portfolio' },
    services:     { hu: 'szolgaltatasok',  en: 'services',      oldHu: 'services',     oldEn: 'services' },
    contact:      { hu: 'kapcsolat',       en: 'contact',       oldHu: 'contact',      oldEn: 'contact' },
    arak:         { hu: 'arak',            en: 'prices',        oldHu: 'arak',         oldEn: 'arak' },
    adatvedelem:  { hu: 'adatvedelem',     en: 'privacy',       oldHu: 'adatvedelem',  oldEn: 'adatvedelem' },
  },
  service: {
    'wedding':           { hu: 'szolgaltatasok/eskuvoi-fotos-szeged',           en: 'services/wedding-photographer-szeged' },
    'wedding-creative':  { hu: 'szolgaltatasok/eskuvoi-kreativ-fotos-szeged',   en: 'services/creative-wedding-photographer-szeged' },
    'maternity':         { hu: 'szolgaltatasok/kismama-fotos-szeged',           en: 'services/maternity-photographer-szeged' },
    'boudoir':           { hu: 'szolgaltatasok/boudoir-fotos-szeged',           en: 'services/boudoir-photographer-szeged' },
    'family':            { hu: 'szolgaltatasok/csaladi-fotos-szeged',           en: 'services/family-photographer-szeged' },
    'couple':            { hu: 'szolgaltatasok/paros-jegyes-fotos-szeged',      en: 'services/engagement-photographer-szeged' },
    'business':          { hu: 'szolgaltatasok/uzleti-portre-fotos-szeged',     en: 'services/business-portrait-szeged' },
    'real-estate':       { hu: 'szolgaltatasok/ingatlan-fotos-szeged',          en: 'services/real-estate-photographer-szeged' },
    'event':             { hu: 'szolgaltatasok/rendezveny-fotos-szeged',        en: 'services/event-photographer-szeged' },
    'portfolio-model':   { hu: 'szolgaltatasok/portfolio-modell-fotos-szeged',  en: 'services/portfolio-model-photographer-szeged' },
    'pet':               { hu: 'szolgaltatasok/kisallat-fotos-szeged',          en: 'services/pet-photographer-szeged' },
    'product':           { hu: 'szolgaltatasok/termekfotozas-szeged',           en: 'services/product-photographer-szeged' },
  },
  portfolio: {
    'wedding':           { hu: 'galeria/eskuvoi-fotok',           en: 'gallery/wedding-photos' },
    'wedding-creative':  { hu: 'galeria/eskuvoi-kreativ-fotok',   en: 'gallery/creative-wedding-photos' },
    'maternity':         { hu: 'galeria/kismama-fotok',           en: 'gallery/maternity-photos' },
    'boudoir':           { hu: 'galeria/boudoir-fotok',           en: 'gallery/boudoir-photos' },
    'family':            { hu: 'galeria/csaladi-fotok',           en: 'gallery/family-photos' },
    'couple':            { hu: 'galeria/paros-jegyes-fotok',      en: 'gallery/engagement-photos' },
    'business':          { hu: 'galeria/uzleti-portre-fotok',     en: 'gallery/business-portrait-photos' },
    'real-estate':       { hu: 'galeria/ingatlan-fotok',          en: 'gallery/real-estate-photos' },
    'event':             { hu: 'galeria/rendezveny-fotok',        en: 'gallery/event-photos' },
    'portrait':          { hu: 'galeria/portfolio-modell-fotok',  en: 'gallery/portfolio-model-photos' },
    'pet':               { hu: 'galeria/kisallat-fotok',          en: 'gallery/pet-photos' },
    'product':           { hu: 'galeria/termek-fotok',            en: 'gallery/product-photos' },
  }
};

const lines = [];
lines.push('# Force apex domain over www');
lines.push('https://www.silverframe.hu/*  https://silverframe.hu/:splat  301!');
lines.push('');

// Top pages
lines.push('# === HU top-level pages: old → new ===');
for (const [k, v] of Object.entries(URL_MAP.page)) {
  if (v.hu !== v.oldHu) {
    lines.push(`/${v.oldHu}.html  /${v.hu}  301!`);
    lines.push(`/${v.oldHu}       /${v.hu}  301!`);
  }
}
lines.push('');
lines.push('# === EN top-level pages: old → new ===');
for (const [k, v] of Object.entries(URL_MAP.page)) {
  if (v.en !== v.oldEn) {
    lines.push(`/en/${v.oldEn}.html  /en/${v.en}  301!`);
    lines.push(`/en/${v.oldEn}       /en/${v.en}  301!`);
  }
}
lines.push('');
lines.push('# === HU service pages: /services/<id>.html → /szolgaltatasok/<slug> ===');
for (const [id, v] of Object.entries(URL_MAP.service)) {
  lines.push(`/services/${id}.html  /${v.hu}  301!`);
  lines.push(`/services/${id}       /${v.hu}  301!`);
}
lines.push('');
lines.push('# === EN service pages ===');
for (const [id, v] of Object.entries(URL_MAP.service)) {
  lines.push(`/en/services/${id}.html  /en/${v.en}  301!`);
  lines.push(`/en/services/${id}       /en/${v.en}  301!`);
}
lines.push('');
lines.push('# === HU portfolio pages: /portfolio/<id>.html → /galeria/<slug> ===');
for (const [id, v] of Object.entries(URL_MAP.portfolio)) {
  lines.push(`/portfolio/${id}.html  /${v.hu}  301!`);
  lines.push(`/portfolio/${id}       /${v.hu}  301!`);
}
lines.push('');
lines.push('# === EN portfolio pages ===');
for (const [id, v] of Object.entries(URL_MAP.portfolio)) {
  lines.push(`/en/portfolio/${id}.html  /en/${v.en}  301!`);
  lines.push(`/en/portfolio/${id}       /en/${v.en}  301!`);
}
lines.push('');
lines.push('# === Strip .html from new URLs if anyone hits them ===');
for (const v of Object.values(URL_MAP.page)) {
  lines.push(`/${v.hu}.html  /${v.hu}  301!`);
  lines.push(`/en/${v.en}.html  /en/${v.en}  301!`);
}
for (const v of Object.values(URL_MAP.service)) {
  lines.push(`/${v.hu}.html  /${v.hu}  301!`);
  lines.push(`/en/${v.en}.html  /en/${v.en}  301!`);
}
for (const v of Object.values(URL_MAP.portfolio)) {
  lines.push(`/${v.hu}.html  /${v.hu}  301!`);
  lines.push(`/en/${v.en}.html  /en/${v.en}  301!`);
}

fs.writeFileSync(path.join(__dirname, '_redirects'), lines.join('\n') + '\n');
console.log(`Wrote ${lines.length} lines to _redirects`);
