const fs = require('fs');
const path = require('path');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'content.json'), 'utf-8'));
const g = data.global;
const cats = data.serviceCategories;

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
  return prefix + src;
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
  const preload = preloadImg ? `\n    <link rel="preload" as="image" href="${preloadImg.startsWith('http') ? preloadImg : '/' + preloadImg}">` : '';
  return `<!DOCTYPE html>
<html lang="hu">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <meta name="description" content="${desc}">
    <link rel="canonical" href="${canonical}">
    <meta property="og:title" content="${ogTitle || title}">
    <meta property="og:description" content="${ogDesc || desc}">
    <meta property="og:type" content="${ogType || 'website'}">
    <meta property="og:url" content="${ogUrl || canonical}">${ogImage ? `\n    <meta property="og:image" content="${ogImage}">` : ''}${preload}
    ${fonts()}
    <link rel="stylesheet" href="${cssPath}">
    ${jsonLd ? `<script type="application/ld+json">\n    ${jsonLd}\n    </script>` : ''}
</head>`;
}

function boilerplate() {
  return `    <div class="grain"></div><div class="cursor-dot"></div><div class="cursor-ring"></div>`;
}

function navDropdown(prefix, activeService) {
  return `<div class="nav-dropdown">
                <a href="${prefix}services.html"${activeService ? ' class="active"' : ''}>Szolgáltatások ${dropdownArrow}</a>
                <div class="dropdown-menu">${cats.map(c =>
    `<a href="${prefix}services/${c.id}.html"${activeService === c.id ? ' class="active"' : ''}>${c.name}</a>`
  ).join('')}</div>
            </div>`;
}

function headerHtml(prefix, activePage, activeService) {
  return `    <header class="header" role="banner">
        <a href="${prefix}index.html" class="header-logo" aria-label="${g.siteName} — Főoldal">${g.siteName}</a>
        <nav class="header-nav" aria-label="Fő navigáció">
            <a href="${prefix}about.html"${activePage === 'about' ? ' class="active"' : ''}>Rólam</a>
            <a href="${prefix}portfolio.html"${activePage === 'portfolio' ? ' class="active"' : ''}>Galéria</a>
            ${navDropdown(prefix, activeService)}
            <a href="${prefix}arak.html"${activePage === 'arak' ? ' class="active"' : ''}>Árak</a>
            <a href="${prefix}contact.html"${activePage === 'contact' ? ' class="active"' : ''}>Kapcsolat</a>
            <a href="${prefix}booking.html" class="header-cta">Időpontfoglalás</a>
        </nav>
        <button class="menu-toggle" id="menuToggle" aria-label="Menü megnyitása"><span></span><span></span><span></span></button>
    </header>`;
}

function mobileNavHtml(prefix) {
  return `    <nav class="mobile-nav" id="mobileNav" aria-label="Mobil navigáció">
        <a href="${prefix}index.html">Főoldal</a>
        <a href="${prefix}about.html">Rólam</a>
        <a href="${prefix}portfolio.html">Galéria</a>
        <a href="${prefix}services.html">Szolgáltatások</a>
        <div class="mobile-nav-sub">${cats.map(c =>
    `\n            <a href="${prefix}services/${c.id}.html">${c.name}</a>`
  ).join('')}
        </div>
        <a href="${prefix}arak.html">Árak</a>
        <a href="${prefix}booking.html">Időpontfoglalás</a>
        <a href="${prefix}contact.html">Kapcsolat</a>
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
                <span>&copy; ${g.copyright} ${g.siteName}. Minden jog fenntartva.</span>
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
  return fs.readFileSync(path.join(__dirname, 'silverframe-chatbot-snippet.html'), 'utf-8');
}

function ctaBanner(label, title, href, btnText, solid = true) {
  return `        <section class="cta-banner" aria-label="Időpontfoglalás">
            <div class="cta-banner-bg" role="img" aria-label="Stúdió háttér"></div>
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
  return `${headHtml(p.title, p.metaDesc, g.baseUrl + '/', p.title, p.metaDesc, 'website', g.baseUrl + '/', 'https://images.unsplash.com/photo-1554080353-a576cf803bda?w=1200&q=80', 'css/style.css', jsonLd, heroPreload)}
${bodyTag()}
${boilerplate()}

    <!-- Preloader -->
    <div class="preloader">
        <div class="preloader-text">
            <span style="animation-delay:.1s">S</span><span style="animation-delay:.15s">I</span><span style="animation-delay:.2s">L</span><span style="animation-delay:.25s">V</span><span style="animation-delay:.3s">E</span><span style="animation-delay:.35s">R</span><span style="animation-delay:.4s">F</span><span style="animation-delay:.45s">R</span><span style="animation-delay:.5s">A</span><span style="animation-delay:.55s">M</span><span style="animation-delay:.6s">E</span>
        </div>
        <div class="preloader-line"></div>
    </div>

${headerHtml('', null, null)}
${mobileNavHtml('')}

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

        <section class="section" aria-label="A fotósról">
            <div class="container intro-strip">
                <div class="intro-img-wrap reveal">
                    <img src="${p.introImage}"${imgStyle(p.introImage)} alt="${g.siteName} portré természetes fényben" width="700" height="933">
                </div>
                <div class="intro-text reveal reveal-delay-1">
                    <span class="section-label">${p.introLabel}</span>
                    <h2 class="section-title">${p.introTitle}</h2>
                    <p class="section-desc">${p.introDesc}</p>
                    ${btn('about.html', 'Tovább')}
                </div>
            </div>
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
                        <img src="${img}"${imgStyle(img)} alt="${alt}" width="500" height="667">
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
${p.galleryImages.map(img => `                    <div class="gallery-preview-item"><img src="${img.src}"${imgStyle(img.src)} alt="${img.alt}" width="400" height="400"></div>`).join('\n')}
                </div>
                <div class="gallery-preview-cta reveal reveal-delay-2">
                    ${btn('portfolio.html', 'Teljes galéria')}
                </div>
            </div>
        </section>

        <section class="section testimonials-section" aria-label="Vélemények">
            <div class="container">
                <div class="reveal">
                    <span class="section-label">Vélemények</span>
                    <h2 class="section-title">Mit mondanak rólam</h2>
                </div>
                <div class="testimonial-slider reveal reveal-delay-1">
${p.testimonials.map((t, i) => `                    <blockquote class="testimonial${i === 0 ? ' active' : ''}">
                        <p class="testimonial-text">${t.text}</p>
                        <cite class="testimonial-author">${t.author}</cite>
                    </blockquote>`).join('\n')}
                    <div class="testimonial-dots">
${p.testimonials.map((_, i) => `                        <button class="t-dot${i === 0 ? ' active' : ''}" data-index="${i}" aria-label="Vélemény ${i + 1}"></button>`).join('\n')}
                    </div>
                </div>
            </div>
        </section>

${ctaBanner(p.ctaLabel, p.ctaTitle, 'contact.html', 'Időpontfoglalás')}
    </main>

${footerHtml('')}
${lightboxHtml()}
    <script src="js/main.js" defer></script>
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

  return `${headHtml(p.title, p.metaDesc, g.baseUrl + '/about.html', p.title, p.metaDesc, 'website', g.baseUrl + '/about.html', null, 'css/style.css', jsonLd)}
${bodyTag()}
${boilerplate()}
${headerHtml('', 'about', null)}
${mobileNavHtml('')}

    <main>
${pageHero(p.heroImage, p.heroLabel, p.heroTitle, `<a href="index.html">Főoldal</a> <span>/</span> Rólam`)}

        <section class="section">
            <div class="container about-content">
                <div class="about-portrait reveal">
                    <img src="${p.aboutImage}"${imgStyle(p.aboutImage)} alt="${g.photographer} fotós" width="700" height="933">
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
    <script src="js/main.js" defer></script>
${chatbotHtml()}
</body>
</html>`;
}

function buildPortfolio() {
  const p = data.pages.portfolio;
  const jsonLd = JSON.stringify({ "@context": "https://schema.org", "@type": "CollectionPage", "name": `${g.siteName} Galéria`, "description": "Válogatott fotómunkák a Silverframe Studiótól", "url": g.baseUrl + "/portfolio.html" });

  return `${headHtml(p.title, p.metaDesc, g.baseUrl + '/portfolio.html', p.title, p.metaDesc, 'website', g.baseUrl + '/portfolio.html', null, 'css/style.css', jsonLd)}
${bodyTag()}
${boilerplate()}
${headerHtml('', 'portfolio', null)}
${mobileNavHtml('')}

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
                            <img src="${cImg}"${imgStyle(cImg)} alt="${c.name} fotózás">
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

        <section class="section portfolio-highlights">
            <div class="container">
                <div class="reveal" style="text-align:center; margin-bottom: 3rem;">
                    <span class="section-label">${p.highlightsLabel}</span>
                    <h2 class="section-title">${p.highlightsTitle}</h2>
                </div>
                <div class="portfolio-highlight-grid reveal reveal-delay-1">
${p.highlights.map(h => `                    <a href="${h.href}" class="portfolio-highlight-item${h.wide ? ' portfolio-highlight-wide' : ''}">
                        <img src="${h.image}"${imgStyle(h.image)} alt="${h.alt}">
                        <div class="portfolio-highlight-overlay"><span class="portfolio-highlight-cat">${h.cat}</span><h3>${h.title}</h3></div>
                    </a>`).join('\n')}
                </div>
            </div>
        </section>

${ctaBanner(p.ctaLabel, p.ctaTitle, 'contact.html', 'Időpontfoglalás')}
    </main>

${footerHtml('')}
${lightboxHtml()}
    <script src="js/main.js" defer></script>
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

  return `${headHtml(p.title, p.metaDesc, g.baseUrl + '/services.html', p.title, p.metaDesc, 'website', g.baseUrl + '/services.html', null, 'css/style.css', jsonLd)}
${bodyTag()}
${boilerplate()}
${headerHtml('', 'services', null)}
${mobileNavHtml('')}

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
                            <img src="${cImg}"${imgStyle(cImg)} alt="${c.name} fotózás" width="600" height="800">
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

${ctaBanner(p.ctaLabel, p.ctaTitle, 'contact.html', 'Időpontfoglalás')}
    </main>

${footerHtml('')}
    <script src="js/main.js" defer></script>
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

  return `${headHtml(p.title, p.metaDesc, g.baseUrl + '/contact.html', p.title, p.metaDesc, 'website', g.baseUrl + '/contact.html', null, 'css/style.css', jsonLd)}
${bodyTag()}
${boilerplate()}
${headerHtml('', 'contact', null)}
${mobileNavHtml('')}

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
    <script src="js/main.js" defer></script>
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
${headerHtml(prefix, null, id)}
${mobileNavHtml(prefix)}

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

${ctaBanner(s.ctaLabel, s.ctaTitle, '../contact.html', s.ctaButton)}

        <nav class="service-nav" aria-label="Szolgáltatás navigáció">
            ${prevNav}
            ${nextNav}
        </nav>
    </main>

${footerHtml(prefix)}
${lightboxHtml()}
    <script src="../js/main.js" defer></script>
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

  return `${headHtml(p.title, p.metaDesc, `${g.baseUrl}/portfolio/${id}.html`, p.title, p.metaDesc, 'website', `${g.baseUrl}/portfolio/${id}.html`, null, '../css/style.css', pgJsonLd, p.heroImage)}
${bodyTag()}
${boilerplate()}
    <header class="header" role="banner">
        <a href="../index.html" class="header-logo">${g.siteName}</a>
        <nav class="header-nav" aria-label="Fő navigáció"><a href="../about.html">Rólam</a><a href="../portfolio.html" class="active">Galéria</a>
            <div class="nav-dropdown"><a href="../services.html">Szolgáltatások ${dropdownArrow}</a>
                <div class="dropdown-menu">${cats.map(c => `<a href="../services/${c.id}.html">${c.name}</a>`).join('')}</div>
            </div><a href="../contact.html">Kapcsolat</a><a href="../contact.html" class="header-cta">Időpontfoglalás</a>
        </nav>
        <button class="menu-toggle" id="menuToggle" aria-label="Menü megnyitása"><span></span><span></span><span></span></button>
    </header>
    <nav class="mobile-nav" id="mobileNav" aria-label="Mobil navigáció"><a href="../index.html">Főoldal</a><a href="../about.html">Rólam</a><a href="../portfolio.html">Galéria</a><a href="../services.html">Szolgáltatások</a><a href="../contact.html">Kapcsolat</a></nav>

    <main>
${pageHero(p.heroImage, p.heroLabel, p.heroTitle, `<a href="../index.html">Főoldal</a> <span>/</span> <a href="../portfolio.html">Galéria</a> <span>/</span> ${p.breadcrumb}`, prefix)}

        <section class="section">
            <div class="container">
${renderGallerySections(p.gallery, prefix, { tag: 'article', extraClass: '', withOverlay: true })}
            </div>
        </section>

        <section class="cta-banner" aria-label="Időpontfoglalás"><div class="cta-banner-bg" role="img" aria-label="Stúdió háttér"></div><div class="container reveal"><span class="section-label">${p.ctaLabel}</span><h2 class="section-title">${p.ctaTitle}</h2><a href="../${p.ctaLink}" class="btn btn-solid"><span>${p.ctaButton}</span>${arrowSvg}</a></div></section>
    </main>

${footerHtml(prefix)}
${lightboxHtml()}
    <script src="../js/main.js" defer></script>
${chatbotHtml()}
</body>
</html>`;
}


function buildBookingPage() {
  const p = data.pages.booking || {};

  return `${headHtml(
    p.title || 'Időpontfoglalás — Silverframe Studio',
    p.metaDesc || 'Foglalj időpontot online – válaszd ki a fotózás típusát, az időpontot, és küldd el kérelmedet.',
    g.baseUrl + '/booking.html', p.title, p.metaDesc, 'website',
    g.baseUrl + '/booking.html', null, 'css/style.css'
  )}
${bodyTag()}
${boilerplate()}
${headerHtml('', 'booking', null)}
${mobileNavHtml('')}

<style>
.bk-section{padding:5rem 0 6rem;background:var(--bg)}
.bk-container{max-width:900px;margin:0 auto;padding:0 1.5rem}
.bk-progress{display:flex;align-items:center;justify-content:center;gap:0;margin-bottom:3.5rem;flex-wrap:wrap;gap:.5rem}
.bk-progress-step{display:flex;flex-direction:column;align-items:center;gap:.35rem;opacity:.35;transition:opacity .3s}
.bk-progress-step.active,.bk-progress-step.done{opacity:1}
.bk-progress-step span{width:2.2rem;height:2.2rem;border-radius:50%;border:1.5px solid var(--accent);display:flex;align-items:center;justify-content:center;font-size:.85rem;color:var(--accent);font-family:var(--font-body);transition:background .3s,color .3s}
.bk-progress-step.active span{background:var(--accent);color:#0e0e0e;font-weight:600}
.bk-progress-step.done span{background:var(--accent);color:#0e0e0e}
.bk-progress-step em{font-size:.72rem;letter-spacing:.08em;text-transform:uppercase;color:var(--text-muted);font-style:normal}
.bk-progress-line{width:3rem;height:1px;background:rgba(201,169,110,.25);flex-shrink:0}
.booking-step{display:none}.booking-step.active{display:block}
.bk-step-title{font-family:var(--font-display);font-size:clamp(1.4rem,5vw,1.9rem);font-weight:300;color:var(--text);margin-bottom:2rem;text-align:center}
/* Service cards */
.bk-services{display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;margin-bottom:1rem}
@media(max-width:700px){.bk-services{grid-template-columns:repeat(3,1fr)}}
@media(max-width:480px){.bk-services{grid-template-columns:repeat(2,1fr);gap:0.6rem}}
@media(max-width:320px){.bk-services{grid-template-columns:1fr}}
.bk-svc-card{border:1px solid rgba(255,255,255,.07);border-radius:4px;overflow:hidden;cursor:pointer;transition:border-color .25s,transform .2s;background:rgba(255,255,255,.03)}
.bk-svc-card:hover{border-color:rgba(201,169,110,.5);transform:translateY(-2px)}
.bk-svc-card.selected{border-color:var(--accent);background:rgba(201,169,110,.07)}
.bk-svc-img{aspect-ratio:4/3;overflow:hidden}
.bk-svc-img img{width:100%;height:100%;object-fit:cover;transition:transform .4s}
.bk-svc-card:hover .bk-svc-img img{transform:scale(1.05)}
.bk-svc-name{padding:.6rem .8rem;font-size:.82rem;letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted);text-align:center;transition:color .25s}
.bk-svc-card.selected .bk-svc-name,.bk-svc-card:hover .bk-svc-name{color:var(--accent)}
/* Step 2 layout */
.bk-datetime{display:grid;grid-template-columns:1fr 1fr;gap:0;margin-bottom:2rem;border:1px solid rgba(255,255,255,.07);border-radius:8px;overflow:hidden}
.bk-cal-panel{padding:1.8rem;border-right:1px solid rgba(255,255,255,.07)}
.bk-slots-panel{padding:1.8rem}
@media(max-width:640px){.bk-datetime{grid-template-columns:1fr}.bk-cal-panel{border-right:none;border-bottom:1px solid rgba(255,255,255,.07)}}
@media(max-width:400px){.bk-cal-panel{padding:1.2rem 0.8rem}.bk-slots-panel{padding:1.2rem 0.8rem}}
/* Calendar */
.bk-cal-nav{display:flex;align-items:center;justify-content:space-between;margin-bottom:1.4rem}
.bk-cal-nav button{background:none;border:none;color:rgba(255,255,255,.4);width:2.8rem;height:2.8rem;font-size:1.4rem;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:color .2s;border-radius:4px}
.bk-cal-nav button:hover{color:var(--accent);background:rgba(201,169,110,.08)}
.bk-cal-month{font-family:var(--font-display);font-size:1rem;font-weight:300;color:var(--text);letter-spacing:.03em}
.bk-cal-grid{display:grid;grid-template-columns:repeat(7,1fr);margin-bottom:6px}
.bk-cal-dow{text-align:center;font-size:.65rem;letter-spacing:.08em;color:rgba(255,255,255,.25);padding:.5rem 0;text-transform:uppercase;font-weight:500}
.bk-cal-days{display:grid;grid-template-columns:repeat(7,1fr);gap:3px}
.bk-day{position:relative;text-align:center;padding:.7rem .2rem;font-size:.88rem;border-radius:6px;cursor:pointer;color:rgba(255,255,255,.85);transition:background .15s,color .15s;user-select:none;font-weight:400;min-height:2.8rem;display:flex;align-items:center;justify-content:center}
.bk-day:hover:not(.past):not(.busy){background:rgba(201,169,110,.12);color:var(--accent)}
.bk-day.past{opacity:.18;cursor:default}
.bk-day.busy{opacity:.18;cursor:default}
.bk-day.today::after{content:'';position:absolute;bottom:4px;left:50%;transform:translateX(-50%);width:3px;height:3px;border-radius:50%;background:var(--accent)}
.bk-day.selected{background:var(--accent);color:#0e0e0e;font-weight:600}
.bk-day.selected::after{display:none}
.bk-day.range-start{background:var(--accent);color:#0e0e0e;font-weight:600;border-radius:6px 0 0 6px}
.bk-day.range-end{background:var(--accent);color:#0e0e0e;font-weight:600;border-radius:0 6px 6px 0}
.bk-day.range-start.range-end{border-radius:6px}
.bk-day.in-range{background:rgba(201,169,110,.15);border-radius:0;color:var(--text)}
.bk-day.range-start::after,.bk-day.range-end::after{display:none}
.bk-cal-loading{grid-column:1/-1;text-align:center;padding:2.5rem 1rem;color:rgba(255,255,255,.2);font-size:.8rem;letter-spacing:.1em;text-transform:uppercase}
/* Time slots */
.bk-slots-label{font-size:.7rem;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.3);margin-bottom:1.2rem;font-weight:500}
.bk-slots-date{font-family:var(--font-display);font-size:1rem;font-weight:300;color:var(--text);margin-bottom:1.2rem}
.bk-time-hint{font-size:.85rem;color:rgba(255,255,255,.2);margin-top:2rem;text-align:center;line-height:1.6}
.bk-slots{display:grid;grid-template-columns:repeat(3,1fr);gap:.5rem}
@media(max-width:400px){.bk-slots{grid-template-columns:repeat(2,1fr)}}
.bk-slot{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:6px;padding:.7rem .4rem;font-size:.9rem;color:rgba(255,255,255,.6);cursor:pointer;transition:all .15s;text-align:center;font-weight:400;min-height:2.75rem}
.bk-slot:hover:not(:disabled){border-color:rgba(201,169,110,.4);color:var(--accent);background:rgba(201,169,110,.05)}
.bk-slot.selected{background:var(--accent);border-color:var(--accent);color:#0e0e0e;font-weight:600}
.bk-slot:disabled{opacity:.15;cursor:default}
.bk-no-slots{grid-column:1/-1;font-size:.85rem;color:rgba(255,255,255,.25);text-align:center;padding:1.5rem 0}
.bk-fullday-info{background:rgba(201,169,110,.06);border:1px solid rgba(201,169,110,.2);border-radius:8px;padding:1.2rem;text-align:center;color:var(--text-muted);font-size:.9rem;line-height:1.6}
.bk-fullday-info strong{display:block;color:var(--accent);font-size:1rem;margin-bottom:.3rem}
.bk-range-hint{font-size:.8rem;color:rgba(255,255,255,.3);margin-top:.8rem;text-align:center;letter-spacing:.03em}
/* Step nav */
.bk-step-nav{display:flex;gap:1rem;justify-content:flex-end;margin-top:2rem}
/* Summary bar */
.bk-summary{display:flex;gap:1.5rem;flex-wrap:wrap;background:rgba(201,169,110,.06);border:1px solid rgba(201,169,110,.2);border-radius:4px;padding:.9rem 1.2rem;margin-bottom:2rem;font-size:.85rem;color:var(--text-muted)}
.bk-summary span{display:flex;align-items:center;gap:.4rem}
/* Success */
.bk-success{text-align:center;padding:3rem 1rem}
.bk-success-icon{width:5rem;height:5rem;border-radius:50%;background:rgba(201,169,110,.1);border:1.5px solid var(--accent);display:flex;align-items:center;justify-content:center;font-size:2rem;color:var(--accent);margin:0 auto 1.5rem}
.bk-success h2{font-family:var(--font-display);font-size:2.2rem;font-weight:300;margin-bottom:1rem}
.bk-success p{color:var(--text-muted);margin-bottom:2rem}
.bk-gcal-btn{display:inline-flex;align-items:center;gap:.5rem;margin-top:1.5rem}
</style>

    <main>
${pageHero(p.heroImage || cats[0]?.img, p.heroLabel || 'Silverframe Studio — Szeged', p.heroTitle || 'Időpontfoglalás', `<a href="index.html">Főoldal</a> <span>/</span> Időpontfoglalás`)}

        <section class="bk-section">
            <div class="bk-container">

                <!-- Progress -->
                <div class="bk-progress">
                    <div class="bk-progress-step active" id="bkprog1"><span>1</span><em>Szolgáltatás</em></div>
                    <div class="bk-progress-line"></div>
                    <div class="bk-progress-step" id="bkprog2"><span>2</span><em>Időpont</em></div>
                    <div class="bk-progress-line"></div>
                    <div class="bk-progress-step" id="bkprog3"><span>3</span><em>Adatok</em></div>
                    <div class="bk-progress-line"></div>
                    <div class="bk-progress-step" id="bkprog4"><span>4</span><em>Kész</em></div>
                </div>

                <!-- Step 1: Service -->
                <div class="booking-step active" id="bkstep1">
                    <h2 class="bk-step-title">Milyen fotózást szeretnél?</h2>
                    <div class="bk-services">
                        ${cats.map(cat => `<div class="bk-svc-card" data-id="${cat.id}" data-name="${cat.name}">
                            <div class="bk-svc-img"><img src="${cat.img || ''}" alt="${cat.name}" loading="lazy" width="320" height="240"></div>
                            <div class="bk-svc-name">${cat.name}</div>
                        </div>`).join('\n                        ')}
                    </div>
                </div>

                <!-- Step 2: Date & time -->
                <div class="booking-step" id="bkstep2">
                    <h2 class="bk-step-title">Mikor szeretnéd?</h2>
                    <div class="bk-datetime">
                        <div class="bk-cal-panel">
                            <div class="bk-cal-nav">
                                <button type="button" id="bkCalPrev">&#8249;</button>
                                <span class="bk-cal-month" id="bkCalLabel"></span>
                                <button type="button" id="bkCalNext">&#8250;</button>
                            </div>
                            <div class="bk-cal-grid">
                                <div class="bk-cal-dow">H</div><div class="bk-cal-dow">K</div><div class="bk-cal-dow">Sze</div>
                                <div class="bk-cal-dow">Cs</div><div class="bk-cal-dow">P</div><div class="bk-cal-dow">Szo</div><div class="bk-cal-dow">V</div>
                            </div>
                            <div class="bk-cal-days" id="bkCalDays"></div>
                        </div>
                        <div class="bk-slots-panel">
                            <div class="bk-slots-label">Időpont</div>
                            <div class="bk-slots-date" id="bkSlotsDate">&nbsp;</div>
                            <p class="bk-time-hint" id="bkTimeHint">Válassz egy napot<br>a szabad időpontok megtekintéséhez</p>
                            <div class="bk-slots" id="bkSlots"></div>
                        </div>
                    </div>
                    <div class="bk-step-nav">
                        <button class="btn" type="button" id="bkBack1">&#8592; Vissza</button>
                        <button class="btn btn-solid" type="button" id="bkNext2" disabled>Tovább &#8594;</button>
                    </div>
                </div>

                <!-- Step 3: Details -->
                <div class="booking-step" id="bkstep3">
                    <h2 class="bk-step-title">Adataid</h2>
                    <div class="bk-summary" id="bkSummary" style="display:none"></div>
                    <form class="contact-form" id="bkForm" style="max-width:520px;margin:0 auto">
                        <div class="form-group"><input type="text" id="bkName" name="name" placeholder=" " required><label for="bkName">Neved *</label></div>
                        <div class="form-group"><input type="email" id="bkEmail" name="email" placeholder=" " required><label for="bkEmail">E-mail *</label></div>
                        <div class="form-group"><input type="tel" id="bkPhone" name="phone" placeholder=" "><label for="bkPhone">Telefonszám</label></div>
                        <div class="form-group"><textarea id="bkNote" name="message" placeholder=" " rows="3"></textarea><label for="bkNote">Megjegyzés (opcionális)</label></div>
                        <div class="bk-step-nav">
                            <button class="btn" type="button" id="bkBack2">&#8592; Vissza</button>
                            <button class="btn btn-solid" type="submit" id="bkSubmit"><span>Foglalás elküldése</span></button>
                        </div>
                        <p id="bkError" style="color:#e07070;margin-top:1rem;display:none;text-align:right"></p>
                    </form>
                </div>

                <!-- Step 4: Pending -->
                <div class="booking-step" id="bkstep4">
                    <div class="bk-success">
                        <div class="bk-success-icon">⏳</div>
                        <h2>Foglalás beérkezve!</h2>
                        <p>Hamarosan emailben visszaigazolom a foglalást.</p>
                        <div id="bkSuccessDetails"></div>
                    </div>
                </div>

            </div>
        </section>
    </main>

${footerHtml('')}
<script src="js/main.js" defer></script>
<script>
(function(){
var N8N='https://n8n-giez.srv1499541.hstgr.cloud/webhook';
  var MONTHS=['Január','Február','Március','Április','Május','Június','Július','Augusztus','Szeptember','Október','November','December'];
  var SVC_CONFIG=${JSON.stringify(Object.fromEntries(cats.map(c=>[c.id,{type:c.bookingType||'hourly',duration:c.bookingDuration||2}])))};
  var selSvc=null,selSvcName=null,selDate=null,selEndDate=null,selTime=null;
  var cy,cm;
  var now=new Date(); cy=now.getFullYear(); cm=now.getMonth();
  var availableData={};
  var suggestedSlot=null;

  function getConfig(){return SVC_CONFIG[selSvc]||{type:'hourly',duration:2};}

  function pad(n){return String(n).padStart(2,'0');}

  function loadAvailability(year,month,cb){
    document.getElementById('bkCalDays').innerHTML='<div class="bk-cal-loading">Betöltés...</div>';
    var cfg=getConfig();
    fetch(N8N+'/availability?year='+year+'&month='+month+'&service='+(selSvc||'')+'&duration='+cfg.duration+'&bookingType='+cfg.type)
      .then(function(r){return r.json();})
      .then(function(d){
        availableData=d.availableDays||{};
        suggestedSlot=d.suggested||null;
        if(cb)cb();
      })
      .catch(function(){availableData={};suggestedSlot=null;if(cb)cb();});
  }

  function dateKey(date){
    return date.getFullYear()+'-'+pad(date.getMonth()+1)+'-'+pad(date.getDate());
  }

  function isDayAvailable(date){
    var k=dateKey(date);
    return availableData[k]&&availableData[k].length>0;
  }

  function getSlotsForDay(date){
    return availableData[dateKey(date)]||[];
  }

  function goStep(n){
    [1,2,3,4].forEach(function(i){
      var s=document.getElementById('bkstep'+i);
      var p=document.getElementById('bkprog'+i);
      if(s) s.classList.toggle('active',i===n);
      if(p){
        p.classList.toggle('active',i===n);
        p.classList.toggle('done',i<n);
      }
    });
    var sec=document.querySelector('.bk-section');
    if(sec) window.scrollTo({top:sec.offsetTop-80,behavior:'smooth'});
  }

  // Step 1: service select
  document.querySelectorAll('.bk-svc-card').forEach(function(c){
    c.addEventListener('click',function(){
      document.querySelectorAll('.bk-svc-card').forEach(function(x){x.classList.remove('selected');});
      c.classList.add('selected');
      selSvc=c.dataset.id; selSvcName=c.dataset.name;
      selDate=null; selEndDate=null; selTime=null;
      setTimeout(function(){goStep(2);loadAvailability(cy,cm,renderCal);},220);
    });
  });

  // Calendar
  function renderCal(){
    document.getElementById('bkCalLabel').textContent=MONTHS[cm]+' '+cy;
    var today=new Date(); today.setHours(0,0,0,0);
    var first=new Date(cy,cm,1).getDay();
    var startDay=first===0?6:first-1;
    var dim=new Date(cy,cm+1,0).getDate();
    var html='';
    for(var i=0;i<startDay;i++) html+='<div></div>';
    var cfg=getConfig();
    for(var d=1;d<=dim;d++){
      var dt=new Date(cy,cm,d);
      var past=dt<today;
      var avail=cfg.type==='multiday'||isDayAvailable(dt);
      var busy=!past&&!avail;
      var isStart=selDate&&dt.toDateString()===selDate.toDateString();
      var isEnd=selEndDate&&dt.toDateString()===selEndDate.toDateString();
      var inRange=selDate&&selEndDate&&dt>selDate&&dt<selEndDate;
      var tod=dt.toDateString()===today.toDateString();
      var cls='bk-day';
      if(past) cls+=' past';
      else if(busy) cls+=' busy';
      if(cfg.type==='multiday'){
        if(isStart) cls+=' range-start';
        if(isEnd) cls+=' range-end';
        if(inRange) cls+=' in-range';
      } else {
        if(isStart) cls+=' selected';
      }
      if(tod) cls+=' today';
      html+='<div class="'+cls+'" data-ts="'+dt.getTime()+'">'+d+'</div>';
    }
    document.getElementById('bkCalDays').innerHTML=html;
    document.querySelectorAll('.bk-day:not(.past):not(.busy)').forEach(function(el){
      el.addEventListener('click',function(){
        var clicked=new Date(parseInt(el.dataset.ts));
        var cfg=getConfig();
        if(cfg.type==='multiday'){
          if(!selDate||selEndDate||(clicked<selDate)){
            selDate=clicked; selEndDate=null;
            document.getElementById('bkNext2').disabled=true;
          } else {
            selEndDate=clicked;
            document.getElementById('bkNext2').disabled=false;
          }
        } else {
          selDate=clicked; selTime=null;
          document.getElementById('bkNext2').disabled=(cfg.type==='hourly');
          if(cfg.type==='fullday') document.getElementById('bkNext2').disabled=false;
        }
        renderCal(); renderSlots();
      });
    });
  }

  function renderSlots(){
    var hint=document.getElementById('bkTimeHint');
    var wrap=document.getElementById('bkSlots');
    var dateEl=document.getElementById('bkSlotsDate');
    var cfg=getConfig();
    if(!selDate){wrap.innerHTML='';hint.style.display='block';if(dateEl)dateEl.innerHTML='&nbsp;';return;}
    hint.style.display='none';
    if(dateEl) dateEl.textContent=fmtDate(selDate);

    if(cfg.type==='fullday'){
      wrap.innerHTML='<div class="bk-fullday-info"><strong>Egész napos fotózás</strong>'+fmtDate(selDate)+'<br><span style="font-size:.8rem;opacity:.6">~'+cfg.duration+' óra</span></div>';
      return;
    }
    if(cfg.type==='multiday'){
      if(!selEndDate){
        wrap.innerHTML='<div class="bk-fullday-info">Kezdő nap: <strong>'+fmtDate(selDate)+'</strong><br><span style="font-size:.8rem;opacity:.5">Válaszd ki a záró napot a naptárban</span></div>';
      } else {
        wrap.innerHTML='<div class="bk-fullday-info"><strong>'+fmtDate(selDate)+' — '+fmtDate(selEndDate)+'</strong><br><span style="font-size:.8rem;opacity:.6">Többnapos rendezvény</span></div>';
      }
      return;
    }
    var daySlots=getSlotsForDay(selDate);
    if(!daySlots.length){
      wrap.innerHTML='<div class="bk-no-slots">Ezen a napon nincs szabad időpont.</div>';
      return;
    }
    wrap.innerHTML=daySlots.map(function(t){
      return '<button type="button" class="bk-slot'+(selTime===t?' selected':'')+'" data-t="'+t+'">'+t+'</button>';
    }).join('');
    wrap.querySelectorAll('.bk-slot').forEach(function(btn){
      btn.addEventListener('click',function(){
        selTime=btn.dataset.t;
        document.getElementById('bkNext2').disabled=false;
        renderSlots();
      });
    });
  }

  document.getElementById('bkCalPrev').addEventListener('click',function(){
    cm--; if(cm<0){cm=11;cy--;} loadAvailability(cy,cm,renderCal);
  });
  document.getElementById('bkCalNext').addEventListener('click',function(){
    cm++; if(cm>11){cm=0;cy++;} loadAvailability(cy,cm,renderCal);
  });

  function fmtDate(d){
    return cy+'. '+MONTHS[d.getMonth()]+' '+d.getDate()+'.';
  }

  function showSummary(){
    var el=document.getElementById('bkSummary');
    if(!el) return;
    el.style.display='flex';
    var cfg=getConfig();
    var dateStr=cfg.type==='multiday'&&selEndDate?fmtDate(selDate)+' — '+fmtDate(selEndDate):fmtDate(selDate);
    var timeStr=cfg.type==='hourly'?'<span>🕐 '+selTime+'</span>':'<span>🌅 '+( cfg.type==='fullday'?'Egész napos':'Többnapos')+'</span>';
    el.innerHTML='<span>📷 '+selSvcName+'</span><span>📅 '+dateStr+'</span>'+timeStr;
  }

  document.getElementById('bkBack1').addEventListener('click',function(){goStep(1);});
  document.getElementById('bkNext2').addEventListener('click',function(){showSummary();goStep(3);});
  document.getElementById('bkBack2').addEventListener('click',function(){goStep(2);});

  // Form submit → n8n
  document.getElementById('bkForm').addEventListener('submit',async function(e){
    e.preventDefault();
    var btn=document.getElementById('bkSubmit');
    var err=document.getElementById('bkError');
    btn.querySelector('span').textContent='Küldés...';
    btn.disabled=true; err.style.display='none';
    var dateStr=selDate?fmtDate(selDate):'—';
    var isoDate=selDate?dateKey(selDate):'';
    try{
      var res=await fetch(N8N+'/book',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          service:selSvc,
          serviceName:selSvcName,
          bookingType:getConfig().type,
          date:isoDate,
          endDate:selEndDate?dateKey(selEndDate):null,
          time:getConfig().type==='hourly'?selTime:null,
          duration:getConfig().duration,
          name:document.getElementById('bkName').value,
          email:document.getElementById('bkEmail').value,
          phone:document.getElementById('bkPhone').value,
          note:document.getElementById('bkNote').value
        })
      });
      if(res.ok){
        document.getElementById('bkSuccessDetails').innerHTML=
          '<div style="margin:.8rem 0;color:var(--text-muted);font-size:.9rem">'+
          selSvcName+' &nbsp;·&nbsp; '+dateStr+' &nbsp;·&nbsp; '+selTime+
          '</div>';
        goStep(4);
      } else {
        btn.querySelector('span').textContent='Foglalás elküldése';
        btn.disabled=false;
        err.textContent='Hiba történt, kérlek próbáld újra.';
        err.style.display='block';
      }
    } catch(ex){
      btn.querySelector('span').textContent='Foglalás elküldése';
      btn.disabled=false;
      err.textContent='Kapcsolódási hiba.';
      err.style.display='block';
    }
  });
})();
</script>

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

  // Build service cards
  const cardsHtml = cats.map((cat, i) => {
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

    const ctaLabel = isCustom ? 'Ajánlatot kérek' : 'Foglalj időpontot';

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
                            <div class="pc-actions">
                                <a href="contact.html" class="btn btn-solid pc-cta"><span>${ctaLabel}</span>${arrowSvg}</a>
                                <a href="portfolio/${galleryId}.html" class="btn pc-gallery-btn">${galleryIcon}<span>Galéria</span></a>
                            </div>
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

  return `${headHtml(p.title, p.metaDesc, g.baseUrl + '/arak.html', p.title, p.metaDesc, 'website', g.baseUrl + '/arak.html', null, 'css/style.css', jsonLd)}
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
    </style>
${bodyTag()}
${boilerplate()}
${headerHtml('', 'arak', null)}
${mobileNavHtml('')}

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
                <div class="pc-grid">${cardsHtml}
                </div>
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
                <h2>Foglald le a<br><em>szabad időpontod</em></h2>
                <p>${p.ctaDesc}</p>
                <div class="final-cta-btns">
                    <a href="contact.html" class="btn btn-solid"><span>Időpontfoglalás</span>${arrowSvg}</a>
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
    <script src="js/main.js" defer></script>
${chatbotHtml()}
</body>
</html>`;
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
  const urls = [
    { loc: `${g.baseUrl}/`,               priority: '1.0', freq: 'weekly'  },
    { loc: `${g.baseUrl}/about.html`,      priority: '0.7', freq: 'monthly' },
    { loc: `${g.baseUrl}/portfolio.html`,  priority: '0.8', freq: 'weekly'  },
    { loc: `${g.baseUrl}/services.html`,   priority: '0.8', freq: 'monthly' },
    { loc: `${g.baseUrl}/contact.html`,    priority: '0.7', freq: 'monthly' },
    ...cats.map(c => ({ loc: `${g.baseUrl}/services/${c.id}.html`, priority: '0.8', freq: 'monthly' })),
    ...Object.keys(data.portfolioPages).map(id => ({ loc: `${g.baseUrl}/portfolio/${id}.html`, priority: '0.7', freq: 'weekly' })),
  ];
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

// Root pages
writeFile(path.join(__dirname, 'index.html'), buildIndex());
writeFile(path.join(__dirname, 'about.html'), buildAbout());
writeFile(path.join(__dirname, 'portfolio.html'), buildPortfolio());
writeFile(path.join(__dirname, 'services.html'), buildServices());
writeFile(path.join(__dirname, 'contact.html'), buildContact());
writeFile(path.join(__dirname, 'arak.html'), buildArakPage());
writeFile(path.join(__dirname, 'booking.html'), buildBookingPage());

// Service pages
cats.forEach(c => {
  writeFile(path.join(__dirname, 'services', `${c.id}.html`), buildServicePage(c.id));
});

// Portfolio pages
Object.keys(data.portfolioPages).forEach(id => {
  writeFile(path.join(__dirname, 'portfolio', `${id}.html`), buildPortfolioPage(id));
});

// SEO files
writeFile(path.join(__dirname, 'sitemap.xml'), buildSitemap());
writeFile(path.join(__dirname, 'robots.txt'), buildRobots());

console.log(`\n  Done! ${7 + cats.length + Object.keys(data.portfolioPages).length} files generated.\n`);
