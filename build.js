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
            <a href="${prefix}portfolio.html"${activePage === 'portfolio' ? ' class="active"' : ''}>Portfólió</a>
            ${navDropdown(prefix, activeService)}
            <a href="${prefix}contact.html"${activePage === 'contact' ? ' class="active"' : ''}>Kapcsolat</a>
            <a href="${prefix}contact.html" class="header-cta">Időpontfoglalás</a>
        </nav>
        <button class="menu-toggle" id="menuToggle" aria-label="Menü megnyitása"><span></span><span></span><span></span></button>
    </header>`;
}

function mobileNavHtml(prefix) {
  return `    <nav class="mobile-nav" id="mobileNav" aria-label="Mobil navigáció">
        <a href="${prefix}index.html">Főoldal</a>
        <a href="${prefix}about.html">Rólam</a>
        <a href="${prefix}portfolio.html">Portfólió</a>
        <a href="${prefix}services.html">Szolgáltatások</a>
        <div class="mobile-nav-sub">${cats.map(c =>
    `\n            <a href="${prefix}services/${c.id}.html">${c.name}</a>`
  ).join('')}
        </div>
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
                        <li><a href="${prefix}portfolio.html">Portfólió</a></li>
                        <li><a href="${prefix}services.html">Szolgáltatások</a></li>
                        <li><a href="${prefix}contact.html">Kapcsolat</a></li>
                    </ul>
                </div>
                <div>
                    <h4 class="footer-heading">Szolgáltatások</h4>
                    <ul class="footer-links">
                        <li><a href="${prefix}services/portfolio-model.html">Portfólió / Modell</a></li>
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
                    ${btn('portfolio.html', 'Teljes portfólió')}
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
</body>
</html>`;
}

function buildPortfolio() {
  const p = data.pages.portfolio;
  const jsonLd = JSON.stringify({ "@context": "https://schema.org", "@type": "CollectionPage", "name": `${g.siteName} Portfólió`, "description": "Válogatott fotómunkák a Silverframe Studiótól", "url": g.baseUrl + "/portfolio.html" });

  return `${headHtml(p.title, p.metaDesc, g.baseUrl + '/portfolio.html', p.title, p.metaDesc, 'website', g.baseUrl + '/portfolio.html', null, 'css/style.css', jsonLd)}
${bodyTag()}
${boilerplate()}
${headerHtml('', 'portfolio', null)}
${mobileNavHtml('')}

    <main>
${pageHero(p.heroImage, p.heroLabel, p.heroTitle, `<a href="index.html">Főoldal</a> <span>/</span> Portfólió`)}

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
                <form class="contact-form reveal reveal-delay-1" onsubmit="event.preventDefault(); this.querySelector('.btn span').textContent='Üzenet elküldve!'; return false;" aria-label="Kapcsolatfelvételi űrlap">
                    <div class="form-group"><input type="text" id="name" name="name" placeholder=" " required autocomplete="name"><label for="name">Neved</label></div>
                    <div class="form-group"><input type="email" id="email" name="email" placeholder=" " required autocomplete="email"><label for="email">E-mail címed</label></div>
                    <div class="form-group"><input type="tel" id="phone" name="phone" placeholder=" " autocomplete="tel"><label for="phone">Telefonszám (opcionális)</label></div>
                    <div class="form-group"><input type="text" id="subject" name="subject" placeholder=" "><label for="subject">Tárgy</label></div>
                    <div class="form-group"><textarea id="message" name="message" placeholder=" " rows="4" required></textarea><label for="message">Üzeneted</label></div>
                    <button type="submit" class="btn btn-solid"><span>Üzenet küldése</span></button>
                </form>
            </div>
        </section>
    </main>

${footerHtml('')}
    <script src="js/main.js" defer></script>
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
                    <div class="service-gallery-grid">
${sortedGallery(s.gallery).map(img => {
                          if (img && img.type === 'bundle') {
                            const attr = bundleAttr(img, prefix);
                            const info = bundleInfo(img);
                            const cls = attr ? 'service-gallery-item is-bundle' : 'service-gallery-item';
                            const badge = attr ? `<span class="bundle-badge" aria-hidden="true"><span class="bundle-badge-count">${info.count}</span><span class="bundle-badge-label">kép</span></span>` : '';
                            const title = img.title || info.alt || '';
                            const caption = attr && title ? `<div class="bundle-caption"><h3>${title}</h3>${img.subtitle ? `<span>${img.subtitle}</span>` : ''}</div>` : '';
                            return `                        <div class="${cls}"${attr}><img src="${imgSrc(info.cover, prefix)}"${imgStyle(info.cover)} alt="${info.alt}" ${imgDims(info.cover, 1920, 1080)} loading="lazy">${caption}${badge}</div>`;
                          }
                          return `                        <div class="service-gallery-item"><img src="${imgSrc(img.src, prefix)}"${imgStyle(img.src)} alt="${img.alt}" ${imgDims(img.src, 1920, 1080)} loading="lazy"></div>`;
                        }).join('\n')}
                    </div>
                    <div style="text-align:center; margin-top: 2.5rem;">
                        <a href="../portfolio/${cat ? cat.portfolioId : id}.html" class="btn"><span>Portfólió megtekintése</span>${arrowSvg}</a>
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
          { "@type": "ListItem", "position": 2, "name": "Portfólió", "item": `${g.baseUrl}/portfolio.html` },
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
        <nav class="header-nav" aria-label="Fő navigáció"><a href="../about.html">Rólam</a><a href="../portfolio.html" class="active">Portfólió</a>
            <div class="nav-dropdown"><a href="../services.html">Szolgáltatások ${dropdownArrow}</a>
                <div class="dropdown-menu">${cats.map(c => `<a href="../services/${c.id}.html">${c.name}</a>`).join('')}</div>
            </div><a href="../contact.html">Kapcsolat</a><a href="../contact.html" class="header-cta">Időpontfoglalás</a>
        </nav>
        <button class="menu-toggle" id="menuToggle" aria-label="Menü megnyitása"><span></span><span></span><span></span></button>
    </header>
    <nav class="mobile-nav" id="mobileNav" aria-label="Mobil navigáció"><a href="../index.html">Főoldal</a><a href="../about.html">Rólam</a><a href="../portfolio.html">Portfólió</a><a href="../services.html">Szolgáltatások</a><a href="../contact.html">Kapcsolat</a></nav>

    <main>
${pageHero(p.heroImage, p.heroLabel, p.heroTitle, `<a href="../index.html">Főoldal</a> <span>/</span> <a href="../portfolio.html">Portfólió</a> <span>/</span> ${p.breadcrumb}`, prefix)}

        <section class="section">
            <div class="container">
                <div class="masonry">
${sortedGallery(p.gallery).map(img => {
                  if (img && img.type === 'bundle') {
                    const attr = bundleAttr(img, prefix);
                    const info = bundleInfo(img);
                    const cls = attr ? 'masonry-item is-bundle' : 'masonry-item';
                    const badge = attr ? `<span class="bundle-badge" aria-hidden="true"><span class="bundle-badge-count">${info.count}</span><span class="bundle-badge-label">kép</span></span>` : '';
                    const title = img.title || info.alt || '';
                    const caption = attr && title ? `<div class="bundle-caption"><h3>${title}</h3>${img.subtitle ? `<span>${img.subtitle}</span>` : ''}</div>` : '';
                    return `                    <article class="${cls}"${attr}>
                        <img src="${imgSrc(info.cover, prefix)}"${imgStyle(info.cover)} alt="${info.alt}" ${imgDims(info.cover, 1920, 1080)} loading="lazy">
                        ${caption}
                        ${badge}
                    </article>`;
                  }
                  return `                    <article class="masonry-item">
                        <img src="${imgSrc(img.src, prefix)}"${imgStyle(img.src)} alt="${img.alt}" ${imgDims(img.src, 1920, 1080)} loading="lazy">
                        <div class="masonry-overlay"><h3>${img.title}</h3><span>${img.subtitle}</span></div>
                    </article>`;
                }).join('\n')}
                </div>
            </div>
        </section>

        <section class="cta-banner" aria-label="Időpontfoglalás"><div class="cta-banner-bg" role="img" aria-label="Stúdió háttér"></div><div class="container reveal"><span class="section-label">${p.ctaLabel}</span><h2 class="section-title">${p.ctaTitle}</h2><a href="../${p.ctaLink}" class="btn btn-solid"><span>${p.ctaButton}</span>${arrowSvg}</a></div></section>
    </main>

${footerHtml(prefix)}
${lightboxHtml()}
    <script src="../js/main.js" defer></script>
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

console.log(`\n  Done! ${5 + cats.length + Object.keys(data.portfolioPages).length} files generated.\n`);
