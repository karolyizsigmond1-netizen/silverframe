const fs = require('fs');
const path = require('path');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'content.json'), 'utf-8'));
const g = data.global;
const globalOgImage = g.ogImage ? (g.ogImage.startsWith('http') ? g.ogImage : g.baseUrl + '/' + g.ogImage) : null;
const cats = data.serviceCategories;

// ── i18n ──
const i18n = JSON.parse(fs.readFileSync(path.join(__dirname, 'i18n.json'), 'utf-8'));
delete i18n._comment;
let LANG = 'hu';                  // 'hu' | 'en'  (set per build pass)
let ASSET_UP = '';                // bridge from language root to actual root: '' for hu, '../' for en
const LANG_ROOT = { hu: '', en: 'en/' };

// Apply HU→EN translation to a generated HTML string.
// Uses placeholder tokens to avoid double-replacement when an EN value contains a HU key.
function translateHtml(html) {
  if (LANG !== 'en') return html;
  const keys = Object.keys(i18n).sort((a, b) => b.length - a.length);
  const placeholders = [];
  keys.forEach((k, i) => {
    const v = i18n[k];
    if (!k || v === undefined || k === v) return;
    if (html.indexOf(k) === -1) return;
    const ph = 'TR' + i + '';
    html = html.split(k).join(ph);
    placeholders.push([ph, v]);
  });
  for (const [ph, en] of placeholders) html = html.split(ph).join(en);
  return html;
}

// Build the URL of the language toggle for the current page.
// pagePath is the file path relative to the language root (e.g. 'index.html', 'services/wedding.html').
function langToggleHref(pagePath, prefix) {
  if (LANG === 'hu') {
    // HU page → EN page: from /<pagePath> (or /sub/<pagePath>) navigate up to root, then into /en/
    return `${prefix}en/${pagePath}`;
  }
  // EN page → HU page: bridge up out of /en/ then navigate to /<pagePath>
  return `${ASSET_UP}${prefix}${pagePath}`;
}

function langToggleHtml(pagePath, prefix) {
  const href = langToggleHref(pagePath, prefix);
  const label = LANG === 'hu' ? 'EN' : 'HU';
  const aria = LANG === 'hu' ? 'Switch to English' : 'Magyar verzió';
  return `<a href="${href}" class="lang-toggle" aria-label="${aria}" rel="alternate" hreflang="${LANG === 'hu' ? 'en' : 'hu'}">${label}</a>`;
}

function langToggleMobileHtml(pagePath, prefix) {
  const href = langToggleHref(pagePath, prefix);
  const label = LANG === 'hu' ? 'English' : 'Magyar';
  return `<a class="mn-link mn-lang-toggle" href="${href}" rel="alternate" hreflang="${LANG === 'hu' ? 'en' : 'hu'}">${label}</a>`;
}

// ── Shared HTML helpers ──

const arrowSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';
const dropdownArrow = '<svg class="dropdown-arrow" viewBox="0 0 12 12" width="10" height="10"><path d="M3 5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>';

function btn(href, text, solid = false) {
  return `<a href="${href}" class="btn${solid ? ' btn-solid' : ''}"><span>${text}</span>${arrowSvg}</a>`;
}

// Prefix local image paths for subpages (services/, portfolio/)
function imgSrc(src, prefix) {
  if (!src) return '';
  if (src.startsWith('http://') || src.startsWith('https://')) return src;
  if (src.startsWith('/')) return src;
  return ASSET_UP + (prefix || '') + src;
}

// Read image dimensions from file header (JPEG/PNG). Returns {w,h} or null.
const _dimCache = {};
function readImgSize(src) {
  if (!src || src.startsWith('http')) return null;
  if (_dimCache[src]) return _dimCache[src];
  try {
    const filePath = path.join(__dirname, src);
    if (!fs.existsSync(filePath)) return null;
    const stat = fs.statSync(filePath);
    const readLen = Math.min(65536, stat.size);
    const buf = Buffer.alloc(readLen);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buf, 0, readLen, 0);
    fs.closeSync(fd);

    let dims = null;
    if (buf[0] === 0x89 && buf[1] === 0x50) {
      // PNG: width at byte 16, height at byte 20
      dims = { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    } else if (buf[0] === 0xFF && buf[1] === 0xD8) {
      // JPEG: scan for SOF marker
      let i = 2;
      while (i < buf.length - 8) {
        if (buf[i] !== 0xFF) { i++; continue; }
        const marker = buf[i + 1];
        if (marker === 0x00 || marker === 0xFF) { i++; continue; }
        const segLen = buf.readUInt16BE(i + 2);
        if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
          dims = { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
          break;
        }
        i += 2 + segLen;
      }
    }
    if (dims) _dimCache[src] = dims;
    return dims;
  } catch (e) { return null; }
}

// Returns width/height HTML attributes using real image dimensions (falls back to defaults)
function imgDims(src, defW, defH) {
  const d = readImgSize(src);
  return d ? `width="${d.w}" height="${d.h}"` : `width="${defW}" height="${defH}"`;
}

// Look up focal point for an image by its raw URL. Returns {pos, zoom} or null.
function getFocalPos(src) {
  if (!src) return null;
  const positions = data.imagePositions || {};
  const entry = positions[src];
  if (!entry) return null;
  if (typeof entry === 'string') return { pos: entry, zoom: 1 };
  if (typeof entry === 'object') {
    const x = typeof entry.x === 'number' ? Math.round(entry.x) : 50;
    const y = typeof entry.y === 'number' ? Math.round(entry.y) : 50;
    const zoom = typeof entry.zoom === 'number' ? entry.zoom : 1;
    return { pos: `${x}% ${y}%`, zoom };
  }
  return null;
}

// Returns ` style="..."` for <img> tags, or '' if default
function imgStyle(src) {
  const fp = getFocalPos(src);
  if (!fp) return '';
  const parts = [`object-position:${fp.pos}`];
  if (fp.zoom > 1) {
    parts.push(`transform:scale(${fp.zoom})`);
    parts.push(`transform-origin:${fp.pos}`);
  }
  return ` style="${parts.join(';')}"`;
}

// Returns inline style string for background-image elements
function bgStyle(src, prefix) {
  const url = imgSrc(src, prefix || '');
  const fp = getFocalPos(src);
  const parts = [`background-image:url('${url}')`];
  if (fp) {
    parts.push(`background-position:${fp.pos}`);
    if (fp.zoom > 1) {
      parts.push(`background-size:${fp.zoom * 100}% auto`);
    }
  }
  return parts.join(';');
}

function bodyTag() {
  const cls = g.buttonStyle === 'rounded' ? ' class="rounded-buttons"' : '';
  return `<body${cls}>`;
}

// Encode a bundle's inner images as a data-bundle attribute value.
// Returns '' if the bundle has no inner images (caller should render it as a regular tile).
// Sort gallery so bundles always come first, preserving relative order within each group.
function sortedGallery(gallery) {
  const bundles = gallery.filter(x => x && x.type === 'bundle');
  const images  = gallery.filter(x => !x || x.type !== 'bundle');
  return bundles.concat(images);
}

// Render gallery as two separate sections: bundles on top, images below.
// opts: { tag: 'article'|'div', extraClass: string, withOverlay: bool }
function renderGallerySections(gallery, prefix, opts) {
  const tag = opts.tag || 'article';
  const extraCls = opts.extraClass || '';
  const withOverlay = opts.withOverlay !== false;

  const bundles = (gallery || []).filter(x => x && x.type === 'bundle');
  const images  = (gallery || []).filter(x => !x || x.type !== 'bundle');

  function renderBundle(img) {
    const attr = bundleAttr(img, prefix);
    const info = bundleInfo(img);
    const cls = attr ? `masonry-item${extraCls} is-bundle` : `masonry-item${extraCls}`;
    const badge = attr ? `<span class="bundle-badge" aria-hidden="true"><span class="bundle-badge-count">${info.count}</span><span class="bundle-badge-label">kép</span></span>` : '';
    const title = img.title || info.alt || '';
    const caption = attr && title ? `<div class="bundle-caption"><h3>${title}</h3>${img.subtitle ? `<span>${img.subtitle}</span>` : ''}</div>` : '';
    return `                    <${tag} class="${cls}"${attr}><img src="${imgSrc(info.cover, prefix)}"${imgStyle(info.cover)} alt="${info.alt}" ${imgDims(info.cover, 1920, 1080)} loading="lazy">${caption}${badge}</${tag}>`;
  }

  function renderImage(img) {
    if (!withOverlay) {
      return `                    <${tag} class="masonry-item${extraCls}"><img src="${imgSrc(img.src, prefix)}"${imgStyle(img.src)} alt="${img.alt}" ${imgDims(img.src, 1920, 1080)} loading="lazy"></${tag}>`;
    }
    const hasTitle = img.title && img.title.trim();
    return `                    <${tag} class="masonry-item${extraCls}${hasTitle ? '' : ' no-title'}"><img src="${imgSrc(img.src, prefix)}"${imgStyle(img.src)} alt="${img.alt}" ${imgDims(img.src, 1920, 1080)} loading="lazy">${hasTitle ? `<div class="masonry-overlay"><h3>${img.title}</h3><span>${img.subtitle}</span></div>` : ''}</${tag}>`;
  }

  const parts = [];

  if (bundles.length) {
    parts.push(`                <div class="gallery-section">
                    <div class="gallery-section-header"><span class="gallery-section-label">Képsorozatok</span></div>
                    <div class="masonry">
${bundles.map(renderBundle).join('\n')}
                    </div>
                </div>`);
  }

  if (images.length) {
    const hdr = bundles.length ? `<div class="gallery-section-header"><span class="gallery-section-label">Fotók</span></div>\n                    ` : '';
    parts.push(`                <div class="gallery-section">
                    ${hdr}<div class="masonry">
${images.map(renderImage).join('\n')}
                    </div>
                </div>`);
  }

  return parts.join('\n');
}

function bundleAttr(item, prefix) {
  if (!item || item.type !== 'bundle') return '';
  const images = Array.isArray(item.images) ? item.images.filter(im => im && im.src) : [];
  if (!images.length) return '';
  const payload = images.map(im => {
    const dims = readImgSize(im.src);
    return { src: imgSrc(im.src, prefix), alt: im.alt || '', w: dims ? dims.w : 0, h: dims ? dims.h : 0 };
  });
  return ` data-bundle="${encodeURIComponent(JSON.stringify(payload))}"`;
}

// Returns { cover, alt, count } for a bundle, falling back to the first inner image if no cover set.
function bundleInfo(item) {
  const images = Array.isArray(item.images) ? item.images.filter(im => im && im.src) : [];
  const cover = item.cover || (images[0] && images[0].src) || '';
  const alt = item.alt || (images[0] && images[0].alt) || item.title || '';
  return { cover, alt, count: images.length };
}

function fonts() {
  const href = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=Outfit:wght@200;300;400;500&display=swap';
  return `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="preload" as="style" href="${href}" onload="this.onload=null;this.rel='stylesheet'">
    <noscript><link rel="stylesheet" href="${href}"></noscript>`;
}

function headHtml(title, desc, canonical, ogTitle, ogDesc, ogType, ogUrl, ogImage, cssPath, jsonLd, preloadImg) {
  // Convert HU canonical → EN canonical when building EN.
  // canonical is like 'https://host.com/' or 'https://host.com/services/wedding.html'.
  let canonicalUrl = canonical;
  let huHref = canonical;
  let enHref = canonical;
  try {
    const huU = new URL(canonical);
    huHref = huU.toString();
    const pathPart = huU.pathname === '/' ? '/' : huU.pathname;
    const enU = new URL(huU.toString());
    enU.pathname = pathPart === '/' ? '/en/' : '/en' + pathPart;
    enHref = enU.toString();
    canonicalUrl = LANG === 'en' ? enHref : huHref;
  } catch (e) { /* keep defaults */ }

  const preload = preloadImg ? `\n    <link rel="preload" as="image" href="${preloadImg.startsWith('http') ? preloadImg : '/' + preloadImg}">` : '';
  const cssHref = (cssPath && !/^https?:/.test(cssPath) && !cssPath.startsWith('/')) ? ASSET_UP + cssPath : cssPath;

  // Build a robust set of og:image / twitter:card tags so Messenger, Facebook,
  // WhatsApp, iMessage, Slack, Twitter all show a proper preview.
  let ogImageTags = '';
  if (ogImage) {
    let ogDims = null;
    try {
      const localPath = ogImage.replace(g.baseUrl + '/', '');
      ogDims = readImgSize(localPath);
    } catch (e) { /* ignore */ }
    const w = ogDims ? ogDims.w : 1200;
    const h = ogDims ? ogDims.h : 630;
    const ext = (ogImage.match(/\.([a-z0-9]+)(?:\?|$)/i) || [, 'jpg'])[1].toLowerCase();
    const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    ogImageTags = `\n    <meta property="og:image" content="${ogImage}">`
      + `\n    <meta property="og:image:secure_url" content="${ogImage}">`
      + `\n    <meta property="og:image:type" content="${mime}">`
      + `\n    <meta property="og:image:width" content="${w}">`
      + `\n    <meta property="og:image:height" content="${h}">`
      + `\n    <meta property="og:image:alt" content="${(ogTitle || title).replace(/"/g, '&quot;')}">`
      + `\n    <meta name="twitter:card" content="summary_large_image">`
      + `\n    <meta name="twitter:image" content="${ogImage}">`;
  }
  const ogLocale = LANG === 'en' ? 'en_US' : 'hu_HU';
  const ogLocaleAlt = LANG === 'en' ? 'hu_HU' : 'en_US';
  const ogExtras = `\n    <meta property="og:site_name" content="${g.siteName.trim()}">`
    + `\n    <meta property="og:locale" content="${ogLocale}">`
    + `\n    <meta property="og:locale:alternate" content="${ogLocaleAlt}">`;
  return `<!DOCTYPE html>
<html lang="${LANG}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>${title}</title>
    <meta name="description" content="${desc}">
    <link rel="canonical" href="${canonicalUrl}">
    <link rel="alternate" hreflang="hu" href="${huHref}">
    <link rel="alternate" hreflang="en" href="${enHref}">
    <link rel="alternate" hreflang="x-default" href="${huHref}">
    <meta property="og:title" content="${ogTitle || title}">
    <meta property="og:description" content="${ogDesc || desc}">
    <meta property="og:type" content="${ogType || 'website'}">
    <meta property="og:url" content="${ogUrl ? (LANG === 'en' && ogUrl === canonical ? canonicalUrl : ogUrl) : canonicalUrl}">${ogExtras}${ogImageTags}${preload}
    ${fonts()}
    <link rel="stylesheet" href="${cssHref}">
    ${jsonLd ? `<script type="application/ld+json">\n    ${jsonLd}\n    </script>` : ''}
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-XKFQW9J2N0"></script>
    <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-XKFQW9J2N0');</script>
</head>`;
}

function boilerplate() {
  const waNumber = (g.phone || '').replace(/[^0-9]/g, '').replace(/^0/, '36');
  return `    <div class="grain"></div><div class="cursor-dot"></div><div class="cursor-ring"></div>
    <a href="https://wa.me/${waNumber}" class="wa-btn" aria-label="WhatsApp üzenet" target="_blank" rel="noopener">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.121.554 4.11 1.523 5.838L.057 23.8a.5.5 0 00.61.644l6.155-1.615A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22a9.95 9.95 0 01-5.13-1.42l-.37-.22-3.795.995 1.012-3.696-.24-.38A9.952 9.952 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
    </a>`;
}

function navDropdown(prefix, activeService) {
  return `<div class="nav-dropdown">
                <a href="${prefix}services.html"${activeService ? ' class="active"' : ''}>Szolgáltatások ${dropdownArrow}</a>
                <div class="dropdown-menu">${cats.map(c =>
    `<a href="${prefix}services/${c.id}.html"${activeService === c.id ? ' class="active"' : ''}>${c.name}</a>`
  ).join('')}</div>
            </div>`;
}

function headerHtml(prefix, activePage, activeService, pagePath) {
  const pp = pagePath || 'index.html';
  return `    <header class="header" role="banner">
        <a href="${prefix}index.html" class="header-logo" aria-label="${g.siteName} — Főoldal">${g.siteName}</a>
        <nav class="header-nav" aria-label="Fő navigáció">
            ${navDropdown(prefix, activeService)}
            <a href="${prefix}portfolio.html"${activePage === 'portfolio' ? ' class="active"' : ''}>Galéria</a>
            <a href="${prefix}arak.html"${activePage === 'arak' ? ' class="active"' : ''}>Árak</a>
            <a href="${prefix}about.html"${activePage === 'about' ? ' class="active"' : ''}>Rólam</a>
            <a href="${prefix}contact.html"${activePage === 'contact' ? ' class="header-cta active"' : ' class="header-cta"'}>Kapcsolat</a>
            ${langToggleHtml(pp, prefix)}
        </nav>
        <button class="menu-toggle" id="menuToggle" aria-label="Menü megnyitása"><span></span><span></span><span></span></button>
    </header>`;
}

function mobileNavHtml(prefix, pagePath) {
  const pp = pagePath || 'index.html';
  return `    <nav class="mobile-nav" id="mobileNav" aria-label="Mobil navigáció">
        <div class="mn-inner">
            <div class="mn-logo">${g.siteName}</div>

            <div class="mn-main">
                <a class="mn-link" href="${prefix}index.html">Főoldal</a>
                <a class="mn-link" href="${prefix}portfolio.html">Galéria</a>
                <a class="mn-link" href="${prefix}arak.html">Árak</a>
                <a class="mn-link" href="${prefix}about.html">Rólam</a>
                ${langToggleMobileHtml(pp, prefix)}
            </div>

            <div class="mn-services">
                <div class="mn-services-label">Szolgáltatások</div>
                <div class="mn-services-grid">
                    ${cats.map(c =>
    `<a href="${prefix}services/${c.id}.html">${c.name}</a>`
  ).join('\n                    ')}
                </div>
            </div>

            <a href="${prefix}contact.html" class="mn-cta">Kapcsolat</a>
        </div>
    </nav>`;
}

function footerHtml(prefix) {
  return `    <footer class="footer" role="contentinfo">

        <div class="container">
            <div class="footer-grid">
                <div>
                    <div class="footer-brand">${g.siteName}</div>
                    <p class="footer-brand-desc">${g.footerDesc}</p>
                </div>
                <div>
                    <h4 class="footer-heading">Navigáció</h4>
                    <ul class="footer-links">
                        <li><a href="${prefix}index.html">Főoldal</a></li>
                        <li><a href="${prefix}about.html">Rólam</a></li>
                        <li><a href="${prefix}portfolio.html">Galéria</a></li>
                        <li><a href="${prefix}services.html">Szolgáltatások</a></li>
                        <li><a href="${prefix}contact.html">Kapcsolat</a></li>
                    </ul>
                </div>
                <div>
                    <h4 class="footer-heading">Szolgáltatások</h4>
                    <ul class="footer-links">
                        <li><a href="${prefix}services/portfolio-model.html">Galéria / Modell</a></li>
                        <li><a href="${prefix}services/maternity.html">Kismama</a></li>
                        <li><a href="${prefix}services/boudoir.html">Boudoir</a></li>
                        <li><a href="${prefix}services/wedding.html">Esküvő</a></li>
                        <li><a href="${prefix}services/event.html">Rendezvény</a></li>
                    </ul>
                </div>
                <div>
                    <h4 class="footer-heading">Kapcsolódj</h4>
                    <ul class="footer-links">
                        <li><a href="${g.instagram}">Instagram</a></li>
                        <li><a href="${g.facebook}">Facebook</a></li>
                        <li><a href="mailto:${g.email}">E-mail</a></li>
                    </ul>
                </div>
            </div>
            <div class="footer-bottom">
                <span>&copy; ${g.copyright} ${g.siteName}. Minden jog fenntartva. <a href="${prefix}adatvedelem.html" class="footer-legal-link">Adatvédelem</a></span>
                <div class="footer-social"><a href="${g.instagram}">Instagram</a><a href="${g.facebook}">Facebook</a></div>
            </div>
        </div>
    </footer>`;
}

function lightboxHtml() {
  return `    <div class="lightbox" id="lightbox" role="dialog" aria-label="Képnézegető">
        <button class="lightbox-close" aria-label="Bezárás">&times;</button>
        <button class="lightbox-nav lightbox-prev" aria-label="Előző kép">&#8249;</button>
        <button class="lightbox-nav lightbox-next" aria-label="Következő kép">&#8250;</button>
        <img src="" alt="">
        <div class="lightbox-counter" aria-hidden="true"></div>
    </div>`;
}

function chatbotHtml() {
  return fs.readFileSync(path.join(__dirname, 'silverframe-chatbot-snippet.html'), 'utf-8') + '\n' + trackingScript();
}

function trackingScript() {
  return `<script>
(function(){
  var GA_ID = 'G-XKFQW9J2N0';
  function gev(name, params) {
    if (typeof gtag === 'function') gtag('event', name, params || {});
  }

  // ── Click tracking via event delegation ──
  document.addEventListener('click', function(e) {
    var t = e.target;

    // Walk up max 5 levels to find a meaningful ancestor
    for (var i = 0; i < 5; i++) {
      if (!t || t === document.body) break;

      // WhatsApp button
      if (t.classList && t.classList.contains('wa-btn')) {
        gev('whatsapp_click', { event_category: 'engagement' }); break;
      }
      // Service card on home page
      if (t.classList && t.classList.contains('service-card-home')) {
        gev('service_card_click', { event_category: 'engagement', service_name: t.querySelector('h3') ? t.querySelector('h3').textContent.trim() : '' }); break;
      }
      // Portfolio grid tile
      if (t.classList && t.classList.contains('portfolio-grid-tile')) {
        gev('portfolio_photo_view', { event_category: 'engagement' }); break;
      }
      // Gallery preview item
      if (t.classList && t.classList.contains('gallery-preview-item')) {
        gev('gallery_preview_click', { event_category: 'engagement' }); break;
      }
      // Nav links
      if (t.closest && t.closest('.header-nav a') && t.tagName === 'A') {
        gev('nav_click', { event_category: 'navigation', link_text: t.textContent.trim() }); break;
      }
      // Footer links
      if (t.closest && t.closest('.footer') && t.tagName === 'A') {
        gev('footer_link_click', { event_category: 'navigation', link_text: t.textContent.trim() }); break;
      }
      // Mailto links
      if (t.tagName === 'A' && t.href && t.href.indexOf('mailto:') === 0) {
        gev('email_click', { event_category: 'contact', email: t.href.replace('mailto:', '') }); break;
      }
      // Tel links
      if (t.tagName === 'A' && t.href && t.href.indexOf('tel:') === 0) {
        gev('phone_click', { event_category: 'contact', phone: t.href.replace('tel:', '') }); break;
      }
      // Social media links
      if (t.tagName === 'A' && t.href && (t.href.indexOf('instagram.com') !== -1 || t.href.indexOf('facebook.com') !== -1)) {
        var platform = t.href.indexOf('instagram') !== -1 ? 'instagram' : 'facebook';
        gev('social_click', { event_category: 'engagement', platform: platform }); break;
      }
      // Before/after slider handle
      if (t.classList && (t.classList.contains('ba-handle') || t.classList.contains('ba-arrow'))) {
        gev('before_after_interact', { event_category: 'engagement' }); break;
      }
      t = t.parentElement;
    }
  }, { passive: true });

  // ── Scroll depth tracking ──
  var scrollMarks = [25, 50, 75, 90];
  var scrollFired = {};
  function onScroll() {
    var scrolled = window.scrollY || window.pageYOffset;
    var total = document.documentElement.scrollHeight - window.innerHeight;
    if (total <= 0) return;
    var pct = Math.round((scrolled / total) * 100);
    for (var i = 0; i < scrollMarks.length; i++) {
      var mark = scrollMarks[i];
      if (!scrollFired[mark] && pct >= mark) {
        scrollFired[mark] = true;
        gev('scroll_depth', { event_category: 'engagement', depth: mark, page: window.location.pathname });
      }
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  // ── Contact form ──
  var ctForm = document.querySelector('form.contact-form, form[action*="formspree"], .contact-form form');
  if (ctForm) {
    var ctStarted = false;
    ctForm.addEventListener('focusin', function() {
      if (!ctStarted) { ctStarted = true; gev('contact_form_start', { event_category: 'engagement' }); }
    }, { once: false, passive: true });
    ctForm.addEventListener('submit', function() {
      gev('contact_form_submit', { event_category: 'engagement' });
    }, { passive: true });
  }

  // ── Lightbox / photo view ──
  var lightbox = document.getElementById('lightbox');
  if (lightbox) {
    var lbObserver = new MutationObserver(function(muts) {
      muts.forEach(function(m) {
        if (m.type === 'attributes' && m.attributeName === 'class') {
          if (lightbox.classList.contains('active')) {
            var img = lightbox.querySelector('img');
            gev('photo_lightbox_open', { event_category: 'engagement', image_src: img ? img.src : '' });
          }
        }
      });
    });
    lbObserver.observe(lightbox, { attributes: true });
  }

  // ── Chat widget open ──
  var chatObserver = new MutationObserver(function() {
    var widget = document.querySelector('.n8n-chat-window, [class*="chat-window"], [class*="chatWindow"]');
    if (widget && widget.style.display !== 'none' && !widget.dataset.gaTracked) {
      widget.dataset.gaTracked = '1';
      gev('chat_widget_open', { event_category: 'engagement' });
    }
  });
  chatObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });

  // ── Time on page ──
  var pageStart = Date.now();
  window.addEventListener('beforeunload', function() {
    var seconds = Math.round((Date.now() - pageStart) / 1000);
    gev('time_on_page', { event_category: 'engagement', seconds: seconds, page: window.location.pathname });
  });

  // ── Portfolio category visit ──
  var pathStr = window.location.pathname;
  if (pathStr.indexOf('/services/') !== -1) {
    var catSlug = pathStr.split('/services/')[1].replace('.html', '');
    gev('portfolio_category_view', { event_category: 'engagement', category: catSlug });
  }
})();
</script>`;
}

function ctaBanner(label, title, href, btnText, solid = true, prefix = '') {
  const bgStyleAttr = g.footerImage
    ? ` style="background-image:url('${imgSrc(g.footerImage, prefix)}');background-size:cover;background-position:center;"`
    : '';
  return `        <section class="cta-banner" aria-label="Kapcsolatfelvétel">
            <div class="cta-banner-bg" role="img" aria-label="Stúdió háttér"${bgStyleAttr}></div>
            <div class="container reveal">
                <span class="section-label">${label}</span>
                <h2 class="section-title">${title}</h2>
                ${btn(href, btnText, solid)}
            </div>
        </section>`;
}

function pageHero(bgImage, label, title, breadcrumbHtml, prefix) {
  return `        <section class="page-hero">
            <div class="page-hero-bg" style="${bgStyle(bgImage, prefix)}"></div>
            <div class="page-hero-content">
                <span class="page-hero-label">${label}</span>
                <h1 class="page-hero-title">${title}</h1>
                <nav class="breadcrumb" aria-label="Breadcrumb">${breadcrumbHtml}</nav>
            </div>
        </section>`;
}

// ── Page Builders ──

function buildIndex() {
  const p = data.pages.index;
  const marqueeItems = cats.map(c => `<span class="marquee-item">${c.name}</span><span class="marquee-dot"></span>`).join('\n                ');
  const sameAs = [g.instagram, g.facebook].filter(Boolean);
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": ["LocalBusiness", "ProfessionalService"],
    "name": g.siteName.trim(),
    "description": g.footerDesc,
    "url": g.baseUrl,
    "telephone": g.phone,
    "email": g.email,
    "image": p.heroImage ? `${g.baseUrl}/${p.heroImage}` : undefined,
    "address": { "@type": "PostalAddress", "addressLocality": g.city, "addressRegion": "Csongrád-Csanád megye", "addressCountry": "HU" },
    "areaServed": { "@type": "City", "name": g.city },
    "priceRange": "$$",
    "sameAs": sameAs
  }, null, 8);

  const heroPreload = p.heroImages && p.heroImages[0] ? p.heroImages[0] : null;
  return `${headHtml(p.title, p.metaDesc, g.baseUrl + '/', p.title, p.metaDesc, 'website', g.baseUrl + '/', globalOgImage, 'css/style.css', jsonLd, heroPreload)}
${bodyTag()}
${boilerplate()}

    <!-- Preloader -->
    <div class="preloader">
        <div class="preloader-text">
            <span style="animation-delay:.1s">S</span><span style="animation-delay:.15s">I</span><span style="animation-delay:.2s">L</span><span style="animation-delay:.25s">V</span><span style="animation-delay:.3s">E</span><span style="animation-delay:.35s">R</span><span style="animation-delay:.4s">F</span><span style="animation-delay:.45s">R</span><span style="animation-delay:.5s">A</span><span style="animation-delay:.55s">M</span><span style="animation-delay:.6s">E</span>
        </div>
        <div class="preloader-line"></div>
    </div>

${headerHtml('', null, null, 'index.html')}
${mobileNavHtml('', 'index.html')}

    <main>
        <section class="home-hero" aria-label="Bemutatkozás">
            <div class="home-hero-slideshow">
${(p.heroImages || ['https://images.unsplash.com/photo-1554080353-a576cf803bda?w=1920&q=80']).map((img, i) =>
  `                <div class="home-hero-slide${i === 0 ? ' active' : ''}" style="${bgStyle(img, '')}"></div>`
).join('\n')}
            </div>
            <div class="home-hero-overlay"></div>
            <div class="home-hero-content">
                <p class="home-hero-sub">${p.heroSub}</p>
                <h1 class="home-hero-title">
                    <span class="line"><span>${p.heroTitleLine1}</span></span>
                    <span class="line"><span>${p.heroTitleLine2}</span></span>
                </h1>
                ${btn('services.html', 'Szolgáltatások')}
            </div>
            <div class="home-hero-scroll"><span>Görgess</span><div class="scroll-line"></div></div>
        </section>

        <section class="section services-preview" aria-label="Fotózási szolgáltatások">
            <div class="container">
                <div class="reveal" style="text-align:center;">
                    <span class="section-label">${p.servicesLabel}</span>
                    <h2 class="section-title">${p.servicesTitle}</h2>
                </div>
                <div class="services-grid-home reveal reveal-delay-1">
${data.serviceCategories.map(c => {
  const img = c.img || c.image || '';
  const alt = c.name + ' fotózás – Silverframe Studio, Szeged';
  return `                    <a href="services/${c.id}.html" class="service-card-home">
                        <img src="${imgSrc(img, '')}"${imgStyle(img)} alt="${alt}" width="500" height="667">
                        <div class="overlay"><h3>${c.name}</h3></div>
                    </a>`;
}).join('\n')}
                </div>
            </div>
        </section>

        <section class="section gallery-preview" aria-label="Galéria előnézet">
            <div class="container">
                <div class="reveal" style="text-align:center;">
                    <span class="section-label">${p.galleryLabel}</span>
                    <h2 class="section-title">${p.galleryTitle}</h2>
                </div>
                <div class="gallery-preview-grid reveal reveal-delay-1">
${p.galleryImages.map(img => `                    <div class="gallery-preview-item"><img src="${imgSrc(img.src, '')}"${imgStyle(img.src)} alt="${img.alt}" width="400" height="400"></div>`).join('\n')}
                </div>
                <div class="gallery-preview-cta reveal reveal-delay-2">
                    ${btn('portfolio.html', 'Teljes galéria')}
                </div>
            </div>
        </section>

        <div class="section-divider reveal"></div>

${p.beforeAfterPairs && p.beforeAfterPairs.length ? `        <section class="ba-section" aria-label="Retusálás előtt és után">
            <div class="container">
                <div class="reveal" style="text-align:center">
                    <span class="section-label">Professzionális retusálás</span>
                    <h2 class="section-title">Előtt & Után</h2>
                    <p class="section-desc" style="margin:0 auto">Minden kép egyedi retusálást kap — természetes, de megkapó végeredménnyel.</p>
                </div>
                <div class="ba-carousel reveal reveal-delay-1">
                    <div class="ba-track">
${p.beforeAfterPairs.map((pair, i) => `                        <div class="ba-pair${i === 0 ? ' active' : ''}">
                            <div class="ba-slider">
                                <img class="ba-img ba-before" src="${imgSrc(pair.before, '')}" alt="Előtte" loading="${i === 0 ? 'eager' : 'lazy'}">
                                <img class="ba-img ba-after" src="${imgSrc(pair.after, '')}" alt="Utána" loading="lazy">
                                <div class="ba-handle">
                                    <div class="ba-arrow">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg>
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg>
                                    </div>
                                </div>
                            </div>
                            <div class="ba-labels">
                                <span>Előtte</span>
                                <span class="ba-pair-label">${pair.label || ''}</span>
                                <span>Utána</span>
                            </div>
                        </div>`).join('\n')}
                    </div>
${p.beforeAfterPairs.length > 1 ? `                    <div class="ba-controls">
                        <button class="ba-nav-btn ba-prev-btn" aria-label="Előző">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
                        </button>
                        <div class="ba-dots">
${p.beforeAfterPairs.map((_, i) => `                            <button class="ba-dot${i === 0 ? ' active' : ''}" data-index="${i}" aria-label="Pár ${i + 1}"></button>`).join('\n')}
                        </div>
                        <button class="ba-nav-btn ba-next-btn" aria-label="Következő">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
                        </button>
                    </div>` : ''}
                </div>
            </div>
        </section>

        <div class="section-divider reveal"></div>` : ''}

        <section class="section testimonials-section" aria-label="Vélemények">
            <div class="container">
                <div class="reveal">
                    <span class="section-label">Vélemények</span>
                    <h2 class="section-title">Mit mondanak rólam</h2>
                </div>
                <div class="testimonial-slider reveal reveal-delay-1">
${p.testimonials.map((t, i) => {
  const initials = (t.author || '').split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('');
  const avatarHtml = t.avatar
    ? `<img class="t-avatar" src="${imgSrc(t.avatar, '')}" alt="${t.author}" loading="lazy">`
    : `<div class="t-avatar-initials">${initials}</div>`;
  return `                    <blockquote class="testimonial${i === 0 ? ' active' : ''}">
                        <p class="testimonial-text">${t.text}</p>
                        ${t.service ? `<span class="t-service-tag">${t.service}</span>` : ''}
                        <div class="testimonial-author-row">
                            ${avatarHtml}
                            <div class="t-author-info">
                                <span class="t-author-name">${t.author}</span>
                                <span class="t-author-meta">${t.location || ''}</span>
                            </div>
                        </div>
                    </blockquote>`;
}).join('\n')}
                    <div class="testimonial-dots">
${p.testimonials.map((_, i) => `                        <button class="t-dot${i === 0 ? ' active' : ''}" data-index="${i}" aria-label="Vélemény ${i + 1}"></button>`).join('\n')}
                    </div>
                </div>
            </div>
        </section>

        <div class="section-divider reveal"></div>

        <section class="section" aria-label="A fotósról">
            <div class="container intro-strip">
                <div class="intro-img-wrap reveal">
                    <img src="${imgSrc(p.introImage, '')}"${imgStyle(p.introImage)} alt="${g.siteName} portré természetes fényben" width="700" height="933">
                </div>
                <div class="intro-text reveal reveal-delay-1">
                    <span class="section-label">${p.introLabel}</span>
                    <h2 class="section-title">${p.introTitle}</h2>
                    <p class="section-desc">${p.introDesc}</p>
                    ${btn('about.html', 'Tovább')}
                </div>
            </div>
        </section>

        <div class="section-divider reveal"></div>

${p.howItWorks ? `        <section class="hiw-section" aria-label="Hogy működik">
            <div class="container">
                <div class="reveal" style="text-align:center">
                    <span class="section-label">${p.howItWorks.label}</span>
                    <h2 class="section-title">${p.howItWorks.title}</h2>
                </div>
                <div class="hiw-steps">
${p.howItWorks.steps.map(s => `                    <div class="hiw-step reveal">
                        <div class="hiw-num-wrap"><span class="hiw-num">${s.num}</span></div>
                        <h3 class="hiw-step-title">${s.title}</h3>
                        <p class="hiw-step-desc">${s.desc}</p>
                    </div>`).join('\n')}
                </div>
            </div>
        </section>

        <div class="section-divider reveal"></div>` : ''}

${ctaBanner(p.ctaLabel, p.ctaTitle, 'contact.html', 'Kapcsolatfelvétel')}
    </main>

${footerHtml('')}
${lightboxHtml()}
    <script src="${ASSET_UP}js/main.js" defer></script>
    <script>
    (function(){
        var slides = document.querySelectorAll('.home-hero-slide');
        if (slides.length < 2) return;
        var current = 0;
        var interval = ${p.heroInterval || 5} * 1000;
        setInterval(function(){
            slides[current].classList.remove('active');
            current = (current + 1) % slides.length;
            slides[current].classList.add('active');
        }, interval);
    })();
    </script>
${chatbotHtml()}
</body>
</html>`;
}

function buildAbout() {
  const p = data.pages.about;
  const sameAs = [g.instagram, g.facebook].filter(Boolean);
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Person",
    "name": g.photographer,
    "jobTitle": "Fotós",
    "description": `Professzionális fotós ${g.city}en — ${g.siteName.trim()}`,
    "url": `${g.baseUrl}/about.html`,
    "email": g.email,
    "telephone": g.phone,
    "address": { "@type": "PostalAddress", "addressLocality": g.city, "addressCountry": "HU" },
    "worksFor": { "@type": "Organization", "name": g.siteName.trim(), "url": g.baseUrl },
    "sameAs": sameAs
  }, null, 8);

  return `${headHtml(p.title, p.metaDesc, g.baseUrl + '/about.html', p.title, p.metaDesc, 'website', g.baseUrl + '/about.html', globalOgImage, 'css/style.css', jsonLd)}
${bodyTag()}
${boilerplate()}
${headerHtml('', 'about', null, 'about.html')}
${mobileNavHtml('', 'about.html')}

    <main>
${pageHero(p.heroImage, p.heroLabel, p.heroTitle, `<a href="index.html">Főoldal</a> <span>/</span> Rólam`)}

        <section class="section">
            <div class="container about-content">
                <div class="about-portrait reveal">
                    <img src="${imgSrc(p.aboutImage, '')}"${imgStyle(p.aboutImage)} alt="${g.photographer} fotós" width="700" height="933">
                </div>
                <div class="about-body reveal reveal-delay-1">
                    <span class="section-label">${p.storyLabel}</span>
                    <h2 class="section-title">${p.storyTitle}</h2>
${p.storyParagraphs.map(t => `                    <p>${t}</p>`).join('\n')}

                    <h3>${p.approachTitle}</h3>
                    <p>${p.approachText}</p>

                    <h3>${p.philosophyTitle}</h3>
${p.philosophyTexts.map(t => `                    <p>${t}</p>`).join('\n')}

                    <div class="about-signature">${g.photographer}</div>

                    <div class="about-stats-row">
${p.stats.map(s => `                        <div><div class="about-stat-num">${s.num}</div><div class="about-stat-label">${s.label}</div></div>`).join('\n')}
                    </div>
                </div>
            </div>
        </section>

${ctaBanner(p.ctaLabel, p.ctaTitle, 'contact.html', 'Kapcsolatfelvétel')}
    </main>

${footerHtml('')}
    <script src="${ASSET_UP}js/main.js" defer></script>
${chatbotHtml()}
</body>
</html>`;
}

function buildPortfolio() {
  const p = data.pages.portfolio;
  const jsonLd = JSON.stringify({ "@context": "https://schema.org", "@type": "CollectionPage", "name": `${g.siteName} Galéria`, "description": "Válogatott fotómunkák a Silverframe Studiótól", "url": g.baseUrl + "/portfolio.html" });

  return `${headHtml(p.title, p.metaDesc, g.baseUrl + '/portfolio.html', p.title, p.metaDesc, 'website', g.baseUrl + '/portfolio.html', globalOgImage, 'css/style.css', jsonLd)}
${bodyTag()}
${boilerplate()}
${headerHtml('', 'portfolio', null, 'portfolio.html')}
${mobileNavHtml('', 'portfolio.html')}

    <main>
${pageHero(p.heroImage, p.heroLabel, p.heroTitle, `<a href="index.html">Főoldal</a> <span>/</span> Galéria`)}

        <section class="section accordion-section">
            <div class="container">
                <div class="reveal" style="text-align:center; margin-bottom: 3rem;">
                    <span class="section-label">${p.accordionLabel}</span>
                    <h2 class="section-title">${p.accordionTitle}</h2>
                </div>
                <div class="portfolio-grid reveal reveal-delay-1">
${cats.map((c, i) => { const cImg = c.img || c.image || ''; return `                    <a href="portfolio/${c.portfolioId}.html" class="portfolio-grid-tile">
                        <div class="portfolio-grid-img-wrap">
                            <img src="${imgSrc(cImg, '')}"${imgStyle(cImg)} alt="${c.name} fotózás">
                        </div>
                        <div class="portfolio-grid-meta">
                            <span class="portfolio-grid-num">${String(i + 1).padStart(2, '0')}</span>
                            <span class="portfolio-grid-name">${c.name}</span>
                        </div>
                    </a>`; }).join('\n')}
                </div>
                <p class="section-desc reveal reveal-delay-2" style="text-align:center; max-width:600px; margin: 4rem auto 0;">${p.accordionHint}</p>
            </div>
        </section>

        <section class="section portfolio-stats-section">
            <div class="container">
                <div class="portfolio-stats reveal">
${p.stats.map(s => `                    <div class="portfolio-stat"><span class="portfolio-stat-num">${s.num}</span><span class="portfolio-stat-label">${s.label}</span></div>`).join('\n')}
                </div>
            </div>
        </section>


${ctaBanner(p.ctaLabel, p.ctaTitle, 'contact.html', 'Kapcsolatfelvétel')}
    </main>

${footerHtml('')}
${lightboxHtml()}
    <script src="${ASSET_UP}js/main.js" defer></script>
${chatbotHtml()}
</body>
</html>`;
}

function buildServices() {
  const p = data.pages.services;
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": `Fotózási Szolgáltatások — ${g.siteName.trim()}`,
    "description": p.metaDesc,
    "url": `${g.baseUrl}/services.html`,
    "itemListElement": cats.map((c, i) => ({
      "@type": "ListItem",
      "position": i + 1,
      "name": c.name + " Fotózás",
      "url": `${g.baseUrl}/services/${c.id}.html`
    }))
  }, null, 8);

  return `${headHtml(p.title, p.metaDesc, g.baseUrl + '/services.html', p.title, p.metaDesc, 'website', g.baseUrl + '/services.html', globalOgImage, 'css/style.css', jsonLd)}
${bodyTag()}
${boilerplate()}
${headerHtml('', 'services', null, 'services.html')}
${mobileNavHtml('', 'services.html')}

    <main>
${pageHero(p.heroImage, p.heroLabel, p.heroTitle, `<a href="index.html">Főoldal</a> <span>/</span> Szolgáltatások`)}

        <section class="section">
            <div class="container">
                <div class="reveal" style="text-align:center; margin-bottom: 3rem;">
                    <span class="section-label">${p.sectionLabel}</span>
                    <h2 class="section-title">${p.sectionTitle}</h2>
                    <p class="section-desc" style="margin: 1rem auto 0;">${p.sectionDesc}</p>
                </div>

                <div class="category-grid">
${cats.map((c, i) => { const cImg = c.img || c.image || ''; return `                    <a href="services/${c.id}.html" class="category-card reveal" style="--i:${i}">
                        <div class="category-card-img">
                            <img src="${imgSrc(cImg, '')}"${imgStyle(cImg)} alt="${c.name} fotózás" width="600" height="800">
                        </div>
                        <div class="category-card-body">
                            <span class="category-num">${c.num}</span>
                            <h3>${c.name}</h3>
                            <p>${p.categoryDescriptions[c.id] || ''}</p>
                            <span class="category-link">Részletek <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg></span>
                        </div>
                    </a>`; }).join('\n\n')}
                </div>
            </div>
        </section>

${ctaBanner(p.ctaLabel, p.ctaTitle, 'contact.html', 'Kapcsolatfelvétel')}
    </main>

${footerHtml('')}
    <script src="${ASSET_UP}js/main.js" defer></script>
${chatbotHtml()}
</body>
</html>`;
}

function buildContact() {
  const p = data.pages.contact;
  const sameAs = [g.instagram, g.facebook].filter(Boolean);
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "ContactPage",
    "name": `Kapcsolat — ${g.siteName.trim()}`,
    "url": `${g.baseUrl}/contact.html`,
    "mainEntity": {
      "@type": ["LocalBusiness", "ProfessionalService"],
      "name": g.siteName.trim(),
      "telephone": g.phone,
      "email": g.email,
      "address": { "@type": "PostalAddress", "addressLocality": g.city, "addressRegion": "Csongrád-Csanád megye", "addressCountry": "HU" },
      "sameAs": sameAs
    }
  }, null, 8);

  return `${headHtml(p.title, p.metaDesc, g.baseUrl + '/contact.html', p.title, p.metaDesc, 'website', g.baseUrl + '/contact.html', globalOgImage, 'css/style.css', jsonLd)}
${bodyTag()}
${boilerplate()}
${headerHtml('', 'contact', null, 'contact.html')}
${mobileNavHtml('', 'contact.html')}

    <main>
${pageHero(p.heroImage, p.heroLabel, p.heroTitle, `<a href="index.html">Főoldal</a> <span>/</span> Kapcsolat`)}

        <section class="section">
            <div class="container contact-content">
                <div class="reveal">
                    <span class="section-label">${p.formLabel}</span>
                    <h2 class="section-title">${p.formTitle}</h2>
                    <p class="section-desc" style="margin-bottom:3rem;">${p.formDesc}</p>
                    <div class="contact-detail"><label>E-mail</label><a href="mailto:${g.email}">${g.email}</a></div>
                    <div class="contact-detail"><label>Helyszín</label><span>${g.city}</span></div>
                    <div class="contact-detail"><label>Elérhetőség</label><span>${p.availability}</span></div>
                </div>
                <form class="contact-form reveal reveal-delay-1" id="contactForm" aria-label="Kapcsolatfelvételi űrlap">
                    <div class="form-group"><input type="text" id="name" name="name" placeholder=" " required autocomplete="name"><label for="name">Neved</label></div>
                    <div class="form-group"><input type="email" id="email" name="email" placeholder=" " required autocomplete="email"><label for="email">E-mail címed</label></div>
                    <div class="form-group"><input type="tel" id="phone" name="phone" placeholder=" " autocomplete="tel"><label for="phone">Telefonszám (opcionális)</label></div>
                    <div class="form-group"><input type="text" id="subject" name="subject" placeholder=" "><label for="subject">Tárgy</label></div>
                    <div class="form-group"><textarea id="message" name="message" placeholder=" " rows="4" required></textarea><label for="message">Üzeneted</label></div>
                    <button type="submit" class="btn btn-solid" id="contactBtn"><span>Üzenet küldése</span></button>
                    <p id="contactStatus" style="margin-top:1rem;font-size:0.95rem;display:none"></p>
                </form>
                <script>
                document.getElementById('contactForm').addEventListener('submit', async function(e) {
                    e.preventDefault();
                    const btn = document.getElementById('contactBtn');
                    const status = document.getElementById('contactStatus');
                    const btnSpan = btn.querySelector('span');
                    btn.disabled = true;
                    btnSpan.textContent = 'Küldés...';
                    status.style.display = 'none';
                    try {
                        const res = await fetch('https://formspree.io/f/mjgjqbar', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                            body: JSON.stringify({
                                name: this.name.value,
                                email: this.email.value,
                                phone: this.phone.value,
                                subject: this.subject.value,
                                message: this.message.value
                            })
                        });
                        const data = await res.json();
                        if (res.ok) {
                            btnSpan.textContent = 'Elküldve!';
                            status.style.color = '#7ec47e';
                            status.textContent = 'Üzeneted megérkezett, hamarosan felveszem veled a kapcsolatot!';
                            status.style.display = 'block';
                            this.reset();
                        } else {
                            btnSpan.textContent = 'Üzenet küldése';
                            btn.disabled = false;
                            status.style.color = '#e07070';
                            status.textContent = 'Hiba történt, kérlek próbáld újra vagy írj emailt közvetlenül.';
                            status.style.display = 'block';
                        }
                    } catch(err) {
                        btnSpan.textContent = 'Üzenet küldése';
                        btn.disabled = false;
                        status.style.color = '#e07070';
                        status.textContent = 'Kapcsolódási hiba. Kérlek próbáld újra.';
                        status.style.display = 'block';
                    }
                });
                </script>
            </div>
        </section>
    </main>

${footerHtml('')}
    <script src="${ASSET_UP}js/main.js" defer></script>
${chatbotHtml()}
</body>
</html>`;
}

function buildServicePage(id) {
  const s = data.servicePages[id];
  if (!s) { console.warn(`No data for service: ${id}`); return ''; }
  const cat = cats.find(c => c.id === id);
  const prefix = '../';

  const ogImg = s.ogImage || (s.heroImage ? `${g.baseUrl}/${s.heroImage}` : undefined);
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Service",
        "name": s.heroTitle,
        "description": s.metaDesc,
        "image": ogImg,
        "url": `${g.baseUrl}/services/${id}.html`,
        "areaServed": { "@type": "City", "name": g.city },
        "provider": {
          "@type": ["LocalBusiness", "ProfessionalService"],
          "name": g.siteName.trim(),
          "url": g.baseUrl,
          "telephone": g.phone,
          "address": { "@type": "PostalAddress", "addressLocality": g.city, "addressCountry": "HU" }
        }
      },
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Főoldal",        "item": `${g.baseUrl}/` },
          { "@type": "ListItem", "position": 2, "name": "Szolgáltatások", "item": `${g.baseUrl}/services.html` },
          { "@type": "ListItem", "position": 3, "name": s.heroTitle,      "item": `${g.baseUrl}/services/${id}.html` }
        ]
      }
    ]
  }, null, 8);

  let prevNav, nextNav;
  if (s.prevService) {
    prevNav = `<a href="${s.prevService}.html" class="service-nav-link prev"><span class="service-nav-label">${s.prevLabel || 'Előző'}</span><span class="service-nav-title">${s.prevTitle}</span></a>`;
  } else {
    prevNav = `<a href="../services.html" class="service-nav-link prev"><span class="service-nav-label">${s.prevLabel || 'Összes szolgáltatás'}</span><span class="service-nav-title">${s.prevTitle}</span></a>`;
  }
  if (s.nextService) {
    nextNav = `<a href="${s.nextService}.html" class="service-nav-link next"><span class="service-nav-label">Következő</span><span class="service-nav-title">${s.nextTitle}</span></a>`;
  } else {
    nextNav = `<a href="../services.html" class="service-nav-link next"><span class="service-nav-label">${s.nextLabel || 'Összes szolgáltatás'}</span><span class="service-nav-title">${s.nextTitle}</span></a>`;
  }

  return `${headHtml(s.title, s.metaDesc, `${g.baseUrl}/services/${id}.html`, s.title, s.metaDesc, 'website', `${g.baseUrl}/services/${id}.html`, s.ogImage, '../css/style.css', jsonLd, s.heroImage)}
${bodyTag()}
${boilerplate()}
${headerHtml(prefix, null, id, 'services/'+id+'.html')}
${mobileNavHtml(prefix, (typeof id !== 'undefined') ? (typeof p !== 'undefined' && p && p.breadcrumb && data.portfolioPages[id] ? 'portfolio/'+id+'.html' : 'services/'+id+'.html') : '')}

    <main>
${pageHero(s.heroImage, s.heroLabel, s.heroTitle, `<a href="../index.html">Főoldal</a> <span>/</span> <a href="../services.html">Szolgáltatások</a> <span>/</span> ${s.breadcrumb}`, prefix)}

        <section class="section service-detail">
            <div class="container">
                <div class="service-detail-intro reveal">
                    <div class="service-detail-text">
                        <span class="section-label">${s.introLabel}</span>
                        <h2 class="section-title">${s.introTitle}</h2>
${s.introDesc.map(p => `                        <p class="section-desc">${p}</p>`).join('\n')}
                    </div>
                    <div class="service-detail-img">
                        <img src="${imgSrc(s.introImage.src, prefix)}"${imgStyle(s.introImage.src)} alt="${s.introImage.alt}" width="700" height="933">
                    </div>
                </div>

${s.packages.map(pkg => `                <div class="service-includes reveal${pkg.image ? ' has-image img-' + (pkg.imageSide || 'left') : ''}">
${pkg.image ? `                    <div class="service-includes-img"><img src="${imgSrc(pkg.image, prefix)}"${imgStyle(pkg.image)} alt="${pkg.name}" width="500" height="667"></div>` : ''}
                    <div class="service-includes-content">
                        <h3 class="service-includes-title">${pkg.name}</h3>
${pkg.desc ? `                        <p style="margin-bottom:2rem;opacity:.7;">${pkg.desc}</p>` : ''}
                        <div class="service-includes-grid">
${pkg.items.map((item, i) => `                            <div class="service-include-item"><span class="include-num">0${i + 1}</span><h4>${item.title}</h4><p>${item.desc}</p></div>`).join('\n')}
                        </div>
                    </div>
                </div>`).join('\n\n')}

                <div class="service-gallery">
                    <h3 class="service-includes-title">Válogatott munkák</h3>
${renderGallerySections(s.gallery, prefix, { tag: 'div', extraClass: ' service-gallery-item', withOverlay: false })}
                    <div style="text-align:center; margin-top: 2.5rem;">
                        <a href="../portfolio/${cat ? cat.portfolioId : id}.html" class="btn"><span>Galéria megtekintése</span>${arrowSvg}</a>
                    </div>
                </div>
            </div>
        </section>

${ctaBanner(s.ctaLabel, s.ctaTitle, '../contact.html', s.ctaButton === 'Időpontfoglalás' ? 'Kapcsolatfelvétel' : s.ctaButton, true, prefix)}

        <nav class="service-nav" aria-label="Szolgáltatás navigáció">
            ${prevNav}
            ${nextNav}
        </nav>
    </main>

${footerHtml(prefix)}
${lightboxHtml()}
    <script src="${ASSET_UP}../js/main.js" defer></script>
${chatbotHtml()}
</body>
</html>`;
}

function buildPortfolioPage(id) {
  const p = data.portfolioPages[id];
  if (!p) { console.warn(`No data for portfolio: ${id}`); return ''; }
  const prefix = '../';

  const pgJsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ImageGallery",
        "name": p.title,
        "description": p.metaDesc,
        "url": `${g.baseUrl}/portfolio/${id}.html`,
        "author": { "@type": "Person", "name": g.photographer, "url": `${g.baseUrl}/about.html` },
        "publisher": { "@type": "Organization", "name": g.siteName.trim(), "url": g.baseUrl }
      },
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Főoldal",   "item": `${g.baseUrl}/` },
          { "@type": "ListItem", "position": 2, "name": "Galéria", "item": `${g.baseUrl}/portfolio.html` },
          { "@type": "ListItem", "position": 3, "name": p.title,     "item": `${g.baseUrl}/portfolio/${id}.html` }
        ]
      }
    ]
  }, null, 8);

  return `${headHtml(p.title, p.metaDesc, `${g.baseUrl}/portfolio/${id}.html`, p.title, p.metaDesc, 'website', `${g.baseUrl}/portfolio/${id}.html`, p.heroImage ? (g.baseUrl + '/' + p.heroImage) : globalOgImage, '../css/style.css', pgJsonLd, p.heroImage)}
${bodyTag()}
${boilerplate()}
${headerHtml('../', 'portfolio', null, 'portfolio/'+id+'.html')}
${mobileNavHtml('../', 'portfolio/'+id+'.html')}

    <main>
${pageHero(p.heroImage, p.heroLabel, p.heroTitle, `<a href="../index.html">Főoldal</a> <span>/</span> <a href="../portfolio.html">Galéria</a> <span>/</span> ${p.breadcrumb}`, prefix)}

        <section class="section">
            <div class="container">
${renderGallerySections(p.gallery, prefix, { tag: 'article', extraClass: '', withOverlay: true })}
            </div>
        </section>

        <section class="cta-banner" aria-label="Kapcsolatfelvétel"><div class="cta-banner-bg" role="img" aria-label="Stúdió háttér"${g.footerImage ? ` style="background-image:url('${imgSrc(g.footerImage, '../')}');background-size:cover;background-position:center;"` : ''}></div><div class="container reveal"><span class="section-label">${p.ctaLabel}</span><h2 class="section-title">${p.ctaTitle}</h2><a href="../contact.html" class="btn btn-solid"><span>${p.ctaButton === 'Időpontfoglalás' ? 'Kapcsolatfelvétel' : p.ctaButton}</span>${arrowSvg}</a></div></section>
    </main>

${footerHtml(prefix)}
${lightboxHtml()}
    <script src="${ASSET_UP}../js/main.js" defer></script>
${chatbotHtml()}
</body>
</html>`;
}


function buildArakPage() {
  const p = data.pages.arak;
  if (!p) return '';

  const galleryIcon = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>';

  const stats = (data.pages.about && data.pages.about.stats) || [
    { num: '15+', label: 'Év tapasztalat' },
    { num: '500+', label: 'Elégedett ügyfél' },
    { num: '12', label: 'Szolgáltatás' },
    { num: '45e Ft', label: 'Ártól' },
  ];
  const statsHtml = stats.map((s, i) => `
                    <div class="ahs-item" style="--si:${i}">
                        <span class="ahs-num">${s.num}</span>
                        <span class="ahs-label">${s.label}</span>
                    </div>`).join('');

  // Build service cards grouped
  const pcGroups = [
    { label: 'Esküvő & Események', ids: ['wedding', 'wedding-creative', 'event'] },
    { label: 'Portré & Életmód',   ids: ['portfolio-model', 'maternity', 'boudoir', 'family', 'couple', 'pet'] },
    { label: 'Üzleti & Termékek',  ids: ['business', 'real-estate', 'product'] },
  ];

  function buildCard(cat, i) {
    const sp = data.servicePages[cat.id] || {};
    const pkgs = sp.packages || [];
    const badge = cat.arakBadge || '';
    const tagline = cat.arakTagline || '';
    const img = cat.img || cat.image || '';
    const galleryId = cat.portfolioId || cat.id;

    const hasMultiPkg = pkgs.length > 1;
    const firstPkgName = pkgs.length ? pkgs[0].name : '';
    const isCustom = firstPkgName.includes('Egyedi ajánlat');
    const priceMatch = firstPkgName.match(/[\d.,]+\.?\d*\s*Ft|Egyedi ajánlat/);
    const priceLabel = priceMatch ? priceMatch[0] : '';

    const badgeHtml = badge ? `<span class="pc-badge">${badge}</span>` : '';
    const popularCls = badge ? ' pc-popular' : '';
    const priceRowHtml = hasMultiPkg && !isCustom
      ? `<span class="pc-price-row">${priceLabel}<span class="pc-from">tól</span></span>`
      : `<span class="pc-price-row">${priceLabel}</span>`;

    let bodyContent;
    if (hasMultiPkg) {
      const pkgBlocks = pkgs.map((pkg, pi) => {
        const pm = pkg.name.match(/[\d.,]+\.?\d*\s*Ft|Egyedi ajánlat/);
        const pkgPrice = pm ? pm[0] : '';
        const pkgName = pkg.name.replace(/\s*—\s*[\d.,]+\.?\d*\s*Ft/, '').replace(/\s*—\s*Egyedi ajánlat/, '');
        const hlCls = pi > 0 ? ' pkg-highlight' : '';
        const feats = (pkg.items || []).map(it => `<li>${it.title}</li>`).join('');
        return `<div class="pkg-block${hlCls}">
                            <div class="pkg-block-header">
                                <span class="pkg-block-name">${pkgName}</span>
                                <span class="pkg-block-price">${pkgPrice}</span>
                            </div>
                            <ul class="pc-features">${feats}</ul>
                        </div>`;
      }).join('');
      bodyContent = `<div class="pkg-list">${pkgBlocks}</div>`;
    } else {
      const feats = (pkgs[0] && pkgs[0].items || []).map(it => `<li>${it.title}</li>`).join('');
      bodyContent = `<ul class="pc-features pc-features-single">${feats}</ul>`;
    }

    const ctaLabel = isCustom ? 'Ajánlatot kérek' : 'Kapcsolatfelvétel';
    const ctaHref = 'contact.html';

    return `
                    <div class="price-card2${popularCls}" style="--i:${i}">
                        <div class="pc-img-wrap">
                            <img src="${imgSrc(img, '')}" alt="${cat.name} fotózás" loading="lazy">
                            <div class="pc-img-overlay"></div>
                            ${badgeHtml}
                            <div class="pc-price-badge">${priceRowHtml}</div>
                        </div>
                        <div class="pc-body">
                            <div class="pc-header">
                                <span class="pc-num">${cat.num}</span>
                                <div>
                                    <h3 class="pc-title">${cat.name}</h3>
                                    <p class="pc-tagline">${tagline}</p>
                                </div>
                            </div>
                            ${bodyContent}
                            ${cat.deliveryTime ? `<div class="pc-delivery"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l3 3"/></svg>${cat.deliveryTime} átadás</div>` : ''}
                            <div class="pc-actions">
                                <a href="${ctaHref}" class="btn btn-solid pc-cta"><span>${ctaLabel}</span>${arrowSvg}</a>
                                <a href="portfolio/${galleryId}.html" class="btn pc-gallery-btn">${galleryIcon}<span>Galéria</span></a>
                            </div>
                        </div>
                    </div>`;
  }

  let cardIndex = 0;
  const cardsHtml = pcGroups.map(group => {
    const groupCats = group.ids.map(id => cats.find(c => c.id === id)).filter(Boolean);
    if (!groupCats.length) return '';
    const cards = groupCats.map(cat => buildCard(cat, cardIndex++)).join('');
    return `
                <div class="pc-group">
                    <div class="pc-group-header">
                        <span class="pc-group-label">${group.label}</span>
                        <div class="pc-group-line"></div>
                    </div>
                    <div class="pc-grid">${cards}
                    </div>
                </div>`;
  }).join('');

  // Testimonials
  const testis = ((data.pages.index && data.pages.index.testimonials) || []).slice(0, 3);
  const testiHtml = testis.map(t => `
                <div class="testi-card reveal">
                    <div class="testi-stars">⭐⭐⭐⭐⭐</div>
                    <p class="testi-text">"${t.text}"</p>
                    <span class="testi-author">${t.author}</span>
                </div>`).join('');

  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": p.title,
    "description": p.metaDesc,
    "url": `${g.baseUrl}/arak.html`
  });

  return `${headHtml(p.title, p.metaDesc, g.baseUrl + '/arak.html', p.title, p.metaDesc, 'website', g.baseUrl + '/arak.html', globalOgImage, 'css/style.css', jsonLd)}
    <style>
    .arak-hero-stats { display:flex; gap:2.5rem; justify-content:center; margin-top:2rem; flex-wrap:wrap; }
    .ahs-item { text-align:center; opacity:0; animation:fadeUp 0.7s var(--ease-dramatic) forwards; animation-delay:calc(var(--si)*150ms + 800ms); }
    .ahs-num { font-family:var(--serif); font-size:clamp(1.6rem,5vw,2.2rem); font-weight:300; color:var(--accent-light); line-height:1; display:block; }
    .ahs-label { font-size:0.72rem; letter-spacing:0.14em; text-transform:uppercase; color:var(--text-muted); display:block; margin-top:0.3rem; }
    @keyframes fadeUp { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }
    .trust-strip { background:var(--bg-elevated); border-top:1px solid rgba(201,169,110,0.1); border-bottom:1px solid rgba(201,169,110,0.1); padding:1.4rem 0; overflow:hidden; }
    .trust-strip-inner { display:flex; justify-content:center; flex-wrap:wrap; }
    .trust-item { display:flex; align-items:center; gap:0.7rem; padding:0.6rem 1.5rem; font-size:0.8rem; color:var(--text-body); border-right:1px solid rgba(255,255,255,0.06); }
    @media(max-width:600px){ .trust-item { border-right:none; padding:0.5rem 1rem; font-size:0.75rem; } }
    .trust-item:last-child { border-right:none; }
    .trust-icon { width:18px; height:18px; color:var(--accent); flex-shrink:0; }
    .pc-section { padding:5rem 0 6rem; }
    .pc-intro { text-align:center; margin-bottom:4rem; }
    .pc-intro h2 { font-family:var(--serif); font-size:clamp(2rem,4vw,3rem); font-weight:300; line-height:1.1; margin-bottom:0.8rem; }
    .pc-intro p { color:var(--text-body); font-size:0.9rem; max-width:480px; margin:0 auto; }
    .pc-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:1.8rem; }
    @media(max-width:1100px){.pc-grid{grid-template-columns:repeat(2,1fr)}}
    @media(max-width:640px){.pc-grid{grid-template-columns:1fr}}
    .price-card2 { background:var(--bg-card); border:1px solid rgba(255,255,255,0.06); display:flex; flex-direction:column; overflow:hidden; transition:transform 0.4s var(--ease-smooth),box-shadow 0.4s; opacity:0; transform:translateY(36px); animation:pcIn 0.6s var(--ease-dramatic) forwards; animation-delay:calc(var(--i,0)*70ms + 100ms); border-radius:2px; }
    @keyframes pcIn{to{opacity:1;transform:translateY(0)}}
    .price-card2:hover { transform:translateY(-8px); box-shadow:0 28px 60px rgba(0,0,0,0.5),0 0 0 1px rgba(201,169,110,0.2); }
    .price-card2.pc-popular { border-color:rgba(201,169,110,0.35); box-shadow:0 0 0 1px rgba(201,169,110,0.15); }
    .pc-img-wrap { position:relative; aspect-ratio:3/2; overflow:hidden; flex-shrink:0; }
    .pc-img-wrap img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; object-position:center 30%; transition:transform 0.7s var(--ease-smooth); }
    .price-card2:hover .pc-img-wrap img { transform:scale(1.06); }
    .pc-img-overlay { position:absolute; inset:0; background:linear-gradient(to bottom,rgba(11,12,16,0) 25%,rgba(11,12,16,0.6) 65%,rgba(11,12,16,0.93) 100%); }
    .pc-badge { position:absolute; top:1rem; right:1rem; background:var(--accent); color:var(--bg); font-size:0.62rem; font-weight:500; letter-spacing:0.12em; text-transform:uppercase; padding:0.28rem 0.65rem; border-radius:2px; }
    .pc-price-badge { position:absolute; bottom:1rem; left:1.2rem; font-family:var(--serif); font-size:1.5rem; font-weight:300; color:var(--text-primary); line-height:1; }
    .pc-price-row { display:flex; align-items:baseline; gap:0.3rem; }
    .pc-from { font-size:0.78rem; color:rgba(240,236,228,0.55); font-style:italic; font-family:var(--serif); }
    .pc-body { padding:1.4rem 1.5rem 1.5rem; display:flex; flex-direction:column; flex:1; gap:1rem; }
    .pc-header { display:flex; align-items:flex-start; gap:0.8rem; }
    .pc-num { font-family:var(--serif); font-size:0.65rem; color:var(--accent); letter-spacing:0.12em; opacity:0.5; padding-top:0.2rem; flex-shrink:0; }
    .pc-title { font-family:var(--serif); font-size:1.18rem; font-weight:400; color:var(--text-primary); line-height:1.15; margin:0; }
    .pc-tagline { font-size:0.76rem; color:var(--text-muted); margin:0.2rem 0 0; line-height:1.4; }
    .pc-features { display:flex; flex-direction:column; gap:0.45rem; flex:1; }
    .pc-features li { font-size:0.81rem; color:var(--text-body); display:flex; align-items:flex-start; gap:0.55rem; line-height:1.4; }
    .pc-features li::before { content:''; width:14px; height:14px; flex-shrink:0; margin-top:1px; background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 14 14' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='7' cy='7' r='5.5' stroke='%23c9a96e' stroke-opacity='0.45'/%3E%3Cpath d='M4.5 7l1.8 1.8L9.5 5' stroke='%23c9a96e' stroke-width='1.2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E"); background-size:contain; background-repeat:no-repeat; }
    .pkg-list { display:flex; flex-direction:column; gap:0; flex:1; }
    .pkg-block { padding:0.9rem 1rem; background:rgba(255,255,255,0.025); border:1px solid rgba(255,255,255,0.06); border-radius:2px; }
    .pkg-block+.pkg-block { margin-top:0.6rem; }
    .pkg-block.pkg-highlight { background:rgba(201,169,110,0.06); border-color:rgba(201,169,110,0.22); }
    .pkg-block-header { display:flex; align-items:baseline; justify-content:space-between; gap:0.5rem; margin-bottom:0.65rem; }
    .pkg-block-name { font-size:0.72rem; letter-spacing:0.1em; text-transform:uppercase; color:var(--text-muted); font-family:var(--sans); }
    .pkg-block.pkg-highlight .pkg-block-name { color:var(--accent); }
    .pkg-block-price { font-family:var(--serif); font-size:1.15rem; font-weight:300; color:var(--accent-light); white-space:nowrap; line-height:1; }
    .pkg-block .pc-features { flex:none; }
    .pc-actions { display:flex; flex-wrap:wrap; gap:0.6rem; margin-top:auto; padding-top:0.2rem; }
    .pc-cta { flex:1; justify-content:center; text-align:center; font-size:0.8rem; padding:0.75rem 1rem; gap:0.4rem; }
    .pc-gallery-btn { display:flex; align-items:center; gap:0.4rem; padding:0.75rem 0.9rem; border:1px solid rgba(201,169,110,0.25); color:var(--text-muted); font-size:0.78rem; border-radius:var(--btn-r,0); transition:border-color 0.25s,color 0.25s,background 0.25s; white-space:nowrap; flex-shrink:0; }
    .pc-gallery-btn::before { content:none; }
    .pc-gallery-btn:hover { border-color:var(--accent); color:var(--accent); background:rgba(201,169,110,0.06); }
    .testi-section { padding:5rem 0; background:var(--bg-elevated); border-top:1px solid rgba(255,255,255,0.04); border-bottom:1px solid rgba(255,255,255,0.04); }
    .testi-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:1.5rem; margin-top:3rem; }
    @media(max-width:900px){.testi-grid{grid-template-columns:1fr;max-width:520px;margin-inline:auto}}
    .testi-card { background:var(--bg-card); padding:1.8rem; border:1px solid rgba(255,255,255,0.05); border-top:2px solid rgba(201,169,110,0.2); display:flex; flex-direction:column; gap:1rem; }
    .testi-stars { font-size:0.85rem; letter-spacing:0.05em; }
    .testi-text { font-family:var(--serif); font-size:1rem; font-weight:300; font-style:italic; color:var(--text-primary); line-height:1.65; flex:1; }
    .testi-author { font-size:0.75rem; letter-spacing:0.1em; color:var(--accent); text-transform:uppercase; }
    .custom-band { padding:5rem 0; }
    .custom-band-inner { background:var(--bg-card); border:1px solid rgba(201,169,110,0.15); padding:3.5rem; display:grid; grid-template-columns:1fr auto; gap:2rem; align-items:center; }
    @media(max-width:700px){.custom-band-inner{grid-template-columns:1fr;text-align:center}.custom-band-inner .btn{width:100%;justify-content:center}}
    .custom-band h2 { font-family:var(--serif); font-size:clamp(1.6rem,3vw,2.2rem); font-weight:300; margin-bottom:0.6rem; line-height:1.2; }
    .custom-band p { color:var(--text-body); font-size:0.88rem; max-width:520px; line-height:1.7; }
    .custom-band-btns { display:flex; flex-direction:column; gap:0.7rem; flex-shrink:0; }
    .custom-band-btns .btn { white-space:nowrap; font-size:0.82rem; padding:0.8rem 1.5rem; }
    .final-cta { padding:6rem 0; text-align:center; position:relative; overflow:hidden; }
    .final-cta::before { content:''; position:absolute; inset:0; background:radial-gradient(ellipse 70% 60% at 50% 50%,rgba(201,169,110,0.07) 0%,transparent 70%); pointer-events:none; }
    .final-cta-label { font-size:0.7rem; letter-spacing:0.22em; text-transform:uppercase; color:var(--accent); display:block; margin-bottom:1.2rem; }
    .final-cta h2 { font-family:var(--serif); font-size:clamp(2.2rem,5vw,3.8rem); font-weight:300; line-height:1.1; margin-bottom:1.2rem; }
    .final-cta h2 em { font-style:italic; color:var(--accent-light); }
    .final-cta p { color:var(--text-body); font-size:0.9rem; max-width:440px; margin:0 auto 2.5rem; line-height:1.8; }
    .final-cta-btns { display:flex; gap:1rem; justify-content:center; flex-wrap:wrap; }
    .final-cta-btns .btn { font-size:0.85rem; padding:0.95rem 2rem; }
    .no-hidden-fees { margin-top:1.5rem; font-size:0.76rem; color:var(--text-muted); display:flex; align-items:center; justify-content:center; gap:0.5rem; }
    .no-hidden-fees svg { color:var(--accent); }
    .pc-group { margin-bottom:4rem; }
    .pc-group-header { display:flex; align-items:center; gap:1.5rem; margin-bottom:2rem; }
    .pc-group-label { font-size:0.68rem; font-weight:400; letter-spacing:0.4em; text-transform:uppercase; color:var(--accent); white-space:nowrap; flex-shrink:0; }
    .pc-group-line { flex:1; height:1px; background:rgba(201,169,110,0.18); }
    </style>
${bodyTag()}
${boilerplate()}
${headerHtml('', 'arak', null, 'arak.html')}
${mobileNavHtml('', 'arak.html')}

    <main>
        <section class="page-hero">
            <div class="page-hero-bg" style="${bgStyle(p.heroImage, '')}"></div>
            <div class="page-hero-content">
                <span class="page-hero-label">${p.heroLabel}</span>
                <h1 class="page-hero-title">${p.heroTitle}</h1>
                <nav class="breadcrumb" aria-label="Breadcrumb"><a href="index.html">Főoldal</a> <span>/</span> Árak</nav>
                <div class="arak-hero-stats">${statsHtml}
                </div>
            </div>
        </section>

        <div class="trust-strip">
            <div class="trust-strip-inner">
                <div class="trust-item"><svg class="trust-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>Nincsenek rejtett díjak</div>
                <div class="trust-item"><svg class="trust-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>Gyors képátadás</div>
                <div class="trust-item"><svg class="trust-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/></svg>Barátságos légkör</div>
                <div class="trust-item"><svg class="trust-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>Kötelezettségmentes egyeztetés</div>
                <div class="trust-item"><svg class="trust-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>15+ év profi tapasztalat</div>
            </div>
        </div>

        <section class="pc-section">
            <div class="container">
                <div class="pc-intro reveal">
                    <span class="section-label">12 kategória — 1 fotós</span>
                    <h2>Válaszd ki a<br>neked valót</h2>
                    <p>Minden csomag tartalmazza a fotózást, professzionális retusálást és digitális átadást.</p>
                </div>
                ${cardsHtml}
            </div>
        </section>

        <section class="testi-section">
            <div class="container">
                <div class="reveal" style="text-align:center;">
                    <span class="section-label">Ügyfeleink mondják</span>
                    <h2 class="section-title">500+ elégedett ügyfél<br>nem tévedhet</h2>
                </div>
                <div class="testi-grid">${testiHtml}
                </div>
            </div>
        </section>

        <section class="custom-band">
            <div class="container">
                <div class="custom-band-inner reveal">
                    <div>
                        <span class="section-label" style="margin-bottom:0.7rem;display:block;">Esküvő &amp; Rendezvény</span>
                        <h2>${p.customBandTitle}</h2>
                        <p>${p.customBandDesc}</p>
                    </div>
                    <div class="custom-band-btns">
                        <a href="contact.html" class="btn btn-solid"><span>Ajánlatot kérek</span>${arrowSvg}</a>
                        <a href="services/wedding.html" class="btn btn-outline"><span>Esküvői részletek</span>${arrowSvg}</a>
                    </div>
                </div>
            </div>
        </section>

        <section class="final-cta">
            <div class="container">
                <span class="final-cta-label">${p.ctaLabel}</span>
                <h2>Lépjünk<br><em>kapcsolatba</em></h2>
                <p>${p.ctaDesc}</p>
                <div class="final-cta-btns">
                    <a href="contact.html" class="btn btn-solid"><span>Kapcsolatfelvétel</span>${arrowSvg}</a>
                    <a href="portfolio.html" class="btn btn-outline"><span>Galéria megtekintése</span>${arrowSvg}</a>
                </div>
                <p class="no-hidden-fees">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                    Nincsenek rejtett díjak — amit látod, azt fizeted
                </p>
            </div>
        </section>
    </main>

${footerHtml('')}
${lightboxHtml()}
    <script src="${ASSET_UP}js/main.js" defer></script>
${chatbotHtml()}
</body>
</html>`;
}

// ── Analytics dashboard ──

function buildAnalyticsPage() {
  const crypto = require('crypto');
  const pass = g.analyticsPassword || 'silverframe';
  const passHash = crypto.createHash('sha256').update(pass).digest('hex');
  var tmpl = fs.readFileSync(path.join(__dirname, 'analytics-template.html'), 'utf-8');
  return tmpl
    .replace('__CLIENT_ID__', g.oauthClientId || 'REPLACE_WITH_OAUTH_CLIENT_ID')
    .replace('__PASS_HASH__', passHash)
    .replace('__GA_PROP__', '536432576');
}

// ── Write all files ──

function writeFile(filePath, content) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
  console.log(`  ✓ ${path.relative(__dirname, filePath)}`);
}

// ── sitemap.xml ──
function buildSitemap() {
  const today = new Date().toISOString().split('T')[0];
  const huUrls = [
    { loc: `${g.baseUrl}/`,               priority: '1.0', freq: 'weekly'  },
    { loc: `${g.baseUrl}/about.html`,      priority: '0.7', freq: 'monthly' },
    { loc: `${g.baseUrl}/portfolio.html`,  priority: '0.8', freq: 'weekly'  },
    { loc: `${g.baseUrl}/services.html`,   priority: '0.8', freq: 'monthly' },
    { loc: `${g.baseUrl}/contact.html`,    priority: '0.7', freq: 'monthly' },
    { loc: `${g.baseUrl}/adatvedelem.html`, priority: '0.3', freq: 'yearly' },
    ...cats.map(c => ({ loc: `${g.baseUrl}/services/${c.id}.html`, priority: '0.8', freq: 'monthly' })),
    ...Object.keys(data.portfolioPages).map(id => ({ loc: `${g.baseUrl}/portfolio/${id}.html`, priority: '0.7', freq: 'weekly' })),
  ];
  const enUrls = huUrls.map(u => ({
    ...u,
    priority: (parseFloat(u.priority) - 0.1).toFixed(1),
    loc: u.loc === `${g.baseUrl}/` ? `${g.baseUrl}/en/` : u.loc.replace(`${g.baseUrl}/`, `${g.baseUrl}/en/`),
  }));
  const urls = [...huUrls, ...enUrls];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${u.freq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`;
}

// ── robots.txt ──
function buildRobots() {
  return `User-agent: *
Allow: /

Sitemap: ${g.baseUrl}/sitemap.xml`;
}

console.log('\n  Building Silverframe Studio...\n');

function buildAndWrite(outBase, builder) {
  const html = builder();
  writeFile(outBase, translateHtml(html));
}

function buildLang(lang) {
  LANG = lang;
  ASSET_UP = (lang === 'en') ? '../' : '';
  const outRoot = (lang === 'en') ? path.join(__dirname, 'en') : __dirname;
  console.log(`\n  → Building ${lang.toUpperCase()} → ${path.relative(__dirname, outRoot) || '.'}/\n`);

  // Root pages
  buildAndWrite(path.join(outRoot, 'index.html'),     buildIndex);
  buildAndWrite(path.join(outRoot, 'about.html'),     buildAbout);
  buildAndWrite(path.join(outRoot, 'portfolio.html'), buildPortfolio);
  buildAndWrite(path.join(outRoot, 'services.html'),  buildServices);
  buildAndWrite(path.join(outRoot, 'contact.html'),   buildContact);
  buildAndWrite(path.join(outRoot, 'arak.html'),      buildArakPage);
  if (lang === 'hu') {
    writeFile(path.join(outRoot, 'analytics.html'), buildAnalyticsPage());
  }

  // Service pages
  cats.forEach(c => {
    buildAndWrite(path.join(outRoot, 'services', `${c.id}.html`), () => buildServicePage(c.id));
  });

  // Portfolio pages
  Object.keys(data.portfolioPages).forEach(id => {
    buildAndWrite(path.join(outRoot, 'portfolio', `${id}.html`), () => buildPortfolioPage(id));
  });
}

buildLang('hu');
buildLang('en');

// Reset language for sitemap/robots (irrelevant but tidy)
LANG = 'hu'; ASSET_UP = '';

// SEO files (single sitemap covering both languages)
writeFile(path.join(__dirname, 'sitemap.xml'), buildSitemap());
writeFile(path.join(__dirname, 'robots.txt'), buildRobots());

const total = 6 + cats.length + Object.keys(data.portfolioPages).length;
console.log(`\n  Done! ${total} HU + ${total - 1} EN files generated (analytics.html is HU-only).\n`);
