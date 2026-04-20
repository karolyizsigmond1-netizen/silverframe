/* ═══════════════════════════════════════════
   ELENA VOSS PHOTOGRAPHY — Shared JS
   ═══════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {

    // ── Preloader ──
    const preloader = document.querySelector('.preloader');
    if (preloader) {
        window.addEventListener('load', () => {
            setTimeout(() => preloader.classList.add('hidden'), 1600);
        });
        // Fallback — hide after 3s even if images still loading
        setTimeout(() => preloader.classList.add('hidden'), 3200);
    }

    // ── Custom Cursor ──
    const dot = document.querySelector('.cursor-dot');
    const ring = document.querySelector('.cursor-ring');
    if (dot && ring && window.matchMedia('(pointer: fine)').matches) {
        let mx = 0, my = 0, rx = 0, ry = 0;
        document.addEventListener('mousemove', e => {
            mx = e.clientX; my = e.clientY;
            dot.style.left = (mx - 4) + 'px';
            dot.style.top = (my - 4) + 'px';
        });
        (function loop() {
            rx += (mx - rx) * 0.12;
            ry += (my - ry) * 0.12;
            ring.style.left = (rx - 20) + 'px';
            ring.style.top = (ry - 20) + 'px';
            requestAnimationFrame(loop);
        })();
        document.querySelectorAll('a, button, .masonry-item, .gallery-preview-item, .service-card-home, .category-card, .service-gallery-item').forEach(el => {
            el.addEventListener('mouseenter', () => ring.classList.add('hover'));
            el.addEventListener('mouseleave', () => ring.classList.remove('hover'));
        });
    } else if (dot && ring) {
        dot.style.display = 'none';
        ring.style.display = 'none';
    }

    // ── Header scroll state ──
    const header = document.querySelector('.header');
    if (header) {
        const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 60);
        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
    }

    // ── Mobile menu ──
    const toggle = document.getElementById('menuToggle');
    const mobileNav = document.getElementById('mobileNav');
    if (toggle && mobileNav) {
        toggle.addEventListener('click', () => {
            toggle.classList.toggle('open');
            mobileNav.classList.toggle('open');
            document.body.style.overflow = mobileNav.classList.contains('open') ? 'hidden' : '';
        });
        mobileNav.querySelectorAll('a').forEach(a => {
            a.addEventListener('click', () => {
                toggle.classList.remove('open');
                mobileNav.classList.remove('open');
                document.body.style.overflow = '';
            });
        });
    }

    // ── Scroll reveal ──
    const revealEls = document.querySelectorAll('.reveal');
    if (revealEls.length) {
        const obs = new IntersectionObserver(entries => {
            entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
        }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
        revealEls.forEach(el => obs.observe(el));
    }

    // ── Page hero zoom-in ──
    const pageHero = document.querySelector('.page-hero');
    if (pageHero) {
        requestAnimationFrame(() => pageHero.classList.add('visible'));
    }

    // ── Smooth anchor links ──
    document.querySelectorAll('a[href^="#"]').forEach(a => {
        a.addEventListener('click', e => {
            const target = document.querySelector(a.getAttribute('href'));
            if (target) { e.preventDefault(); target.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
        });
    });

    // ── Testimonial slider ──
    const testimonials = document.querySelectorAll('.testimonial');
    const tDots = document.querySelectorAll('.t-dot');
    if (testimonials.length) {
        let cur = 0;
        const show = i => {
            testimonials.forEach(t => t.classList.remove('active'));
            tDots.forEach(d => d.classList.remove('active'));
            testimonials[i].classList.add('active');
            if (tDots[i]) tDots[i].classList.add('active');
            cur = i;
        };
        tDots.forEach(d => d.addEventListener('click', () => show(+d.dataset.index)));
        setInterval(() => show((cur + 1) % testimonials.length), 6000);
    }

    // ── Justified masonry layout ──
    const masonryGrid = document.querySelector('.masonry');
    const GAP = 6;
    let justifyMasonry = null;

    if (masonryGrid) {
        justifyMasonry = function() {
            const totalWidth = masonryGrid.offsetWidth;
            if (!totalWidth) return;
            const targetRowH = window.innerWidth < 600 ? 180 : window.innerWidth < 900 ? 240 : 300;
            const items = Array.from(masonryGrid.querySelectorAll(':scope > .masonry-item'))
                .filter(el => el.style.display !== 'none');
            if (!items.length) return;

            let row = [], rowNaturalW = 0;

            const flushRow = (isPartialLast) => {
                if (!row.length) return;
                const gapsW = (row.length - 1) * GAP;
                const available = totalWidth - gapsW;
                const scale = (!isPartialLast || rowNaturalW >= available * 0.6)
                    ? available / rowNaturalW : 1;
                const h = Math.floor(targetRowH * scale);
                row.forEach(({ item, ratio }) => {
                    item.style.width = Math.floor(h * ratio) + 'px';
                    item.style.height = h + 'px';
                });
                row = []; rowNaturalW = 0;
            };

            items.forEach((item, idx) => {
                const img = item.querySelector('img');
                const w = parseInt(img.getAttribute('width')) || 3;
                const h = parseInt(img.getAttribute('height')) || 2;
                const ratio = w / h;
                row.push({ item, ratio });
                rowNaturalW += targetRowH * ratio;
                const gapsW = (row.length - 1) * GAP;
                const isLast = idx === items.length - 1;
                if (rowNaturalW + gapsW >= totalWidth || isLast) flushRow(isLast);
            });
        };

        justifyMasonry();
        let rTimer;
        window.addEventListener('resize', () => { clearTimeout(rTimer); rTimer = setTimeout(justifyMasonry, 120); }, { passive: true });
    }

    // ── Portfolio filter ──
    const filterBtns = document.querySelectorAll('.filter-btn');
    const masonryItems = document.querySelectorAll('.masonry-item');
    if (filterBtns.length && masonryItems.length) {
        filterBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                filterBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const f = btn.dataset.filter;
                masonryItems.forEach(item => {
                    const match = f === 'all' || item.dataset.category === f;
                    item.style.opacity = match ? '1' : '0';
                    item.style.transform = match ? 'scale(1)' : 'scale(0.96)';
                    setTimeout(() => { item.style.display = match ? '' : 'none'; }, match ? 0 : 350);
                });
                if (justifyMasonry) setTimeout(justifyMasonry, 400);
            });
        });
    }

    // ── Lightbox ──
    const lightbox = document.getElementById('lightbox');
    if (lightbox) {
        const lbImg = lightbox.querySelector(':scope > img');
        const prevBtn = lightbox.querySelector('.lightbox-prev');
        const nextBtn = lightbox.querySelector('.lightbox-next');
        const counter = lightbox.querySelector('.lightbox-counter');
        const bundleBar = lightbox.querySelector('.lightbox-bundle-bar');
        const bundleTitleEl = lightbox.querySelector('.lightbox-bundle-title');
        const btnSingle = lightbox.querySelector('.lv-single');
        const btnGrid = lightbox.querySelector('.lv-grid');
        const gridView = lightbox.querySelector('.lightbox-grid-view');
        const gridInner = lightbox.querySelector('.lightbox-grid-inner');
        const itemSelectors = '.masonry-item, .gallery-preview-item, .service-gallery-item';
        const containerSelectors = '.masonry, .gallery-preview, .service-gallery';

        let currentList = [];
        let currentIndex = 0;
        let isBundleMode = false;
        let builtGridSrc = null; // cache: don't rebuild grid for same bundle

        const parseBundle = (el) => {
            const raw = el.getAttribute('data-bundle');
            if (!raw) return null;
            try {
                const arr = JSON.parse(decodeURIComponent(raw));
                if (Array.isArray(arr) && arr.length) return arr;
            } catch (e) {}
            return null;
        };

        const itemToEntry = (el) => {
            const img = el.querySelector('img');
            return { src: img ? img.src : '', alt: img ? (img.alt || '') : '' };
        };

        const showAt = (i) => {
            if (!currentList.length) return;
            currentIndex = (i + currentList.length) % currentList.length;
            const entry = currentList[currentIndex];
            lbImg.src = entry.src;
            lbImg.alt = entry.alt || '';
            if (counter) counter.textContent = `${currentIndex + 1} / ${currentList.length}`;
            const many = currentList.length > 1;
            if (prevBtn) prevBtn.style.display = many ? '' : 'none';
            if (nextBtn) nextBtn.style.display = many ? '' : 'none';
            if (counter) counter.style.display = many ? '' : 'none';
        };

        // Build justified grid using pre-embedded w/h — single layout pass, no image-load waiting
        const buildGrid = (images) => {
            const GAP = 6, TARGET_H = window.innerWidth < 600 ? 140 : 200;
            const totalW = gridInner.offsetWidth || (window.innerWidth - 64);

            const frag = document.createDocumentFragment();
            const rowItems = [];
            let row = [], rowNatW = 0;

            const flush = (isLast) => {
                if (!row.length) return;
                const gapsW = (row.length - 1) * GAP;
                const avail = totalW - gapsW;
                const scale = (!isLast || rowNatW >= avail * 0.55) ? avail / rowNatW : 1;
                const h = Math.floor(TARGET_H * scale);
                row.forEach(({ div, ratio }) => {
                    div.style.width = Math.floor(h * ratio) + 'px';
                    div.style.height = h + 'px';
                });
                row = []; rowNatW = 0;
            };

            images.forEach((entry, idx) => {
                const ratio = (entry.w && entry.h) ? entry.w / entry.h : 3 / 2;
                const div = document.createElement('div');
                div.className = 'lb-grid-item';
                div.dataset.index = idx;
                const img = document.createElement('img');
                img.src = entry.src;
                img.alt = entry.alt || '';
                img.loading = 'lazy';
                img.decoding = 'async';
                div.appendChild(img);
                frag.appendChild(div);

                row.push({ div, ratio });
                rowNatW += TARGET_H * ratio;
                const gapsW = (row.length - 1) * GAP;
                if (rowNatW + gapsW >= totalW || idx === images.length - 1) flush(idx === images.length - 1);
            });

            gridInner.innerHTML = '';
            gridInner.appendChild(frag);
        };

        const setView = (mode) => {
            if (mode === 'grid') {
                lightbox.classList.add('grid-mode');
                btnSingle.classList.remove('active');
                btnGrid.classList.add('active');
            } else {
                lightbox.classList.remove('grid-mode');
                btnSingle.classList.add('active');
                btnGrid.classList.remove('active');
            }
        };

        const openBundle = (images, title, startIndex = 0) => {
            currentList = images;
            isBundleMode = true;
            lightbox.classList.add('bundle-mode');
            if (bundleTitleEl) bundleTitleEl.textContent = title || '';
            // Only rebuild grid if it's a different bundle
            const cacheKey = images[0] && images[0].src;
            if (builtGridSrc !== cacheKey) {
                buildGrid(images);
                builtGridSrc = cacheKey;
            }
            setView('single');
            showAt(startIndex);
            lightbox.classList.add('open');
            document.body.style.overflow = 'hidden';
        };

        const openRegular = (list, idx) => {
            currentList = list;
            isBundleMode = false;
            lightbox.classList.remove('bundle-mode', 'grid-mode');
            showAt(idx);
            lightbox.classList.add('open');
            document.body.style.overflow = 'hidden';
        };

        document.querySelectorAll(itemSelectors).forEach(item => {
            item.addEventListener('click', () => {
                const bundle = parseBundle(item);
                if (bundle) {
                    const titleEl = item.querySelector('.bundle-caption-name, .bundle-caption');
                    const title = titleEl ? titleEl.textContent.trim() : '';
                    openBundle(bundle, title);
                } else {
                    const container = item.closest(containerSelectors) || document;
                    const siblings = Array.from(container.querySelectorAll(itemSelectors))
                        .filter(el => el.style.display !== 'none' && !el.hasAttribute('data-bundle'));
                    openRegular(siblings.map(itemToEntry), siblings.indexOf(item));
                }
            });
        });

        if (btnSingle) btnSingle.addEventListener('click', e => { e.stopPropagation(); setView('single'); });
        if (btnGrid) btnGrid.addEventListener('click', e => {
            e.stopPropagation();
            setView('grid');
        });

        // Clicking a grid item switches to single view at that image
        if (gridInner) gridInner.addEventListener('click', e => {
            const item = e.target.closest('.lb-grid-item');
            if (!item) return;
            setView('single');
            showAt(parseInt(item.dataset.index));
        });

        if (prevBtn) prevBtn.addEventListener('click', e => { e.stopPropagation(); showAt(currentIndex - 1); });
        if (nextBtn) nextBtn.addEventListener('click', e => { e.stopPropagation(); showAt(currentIndex + 1); });

        const closeLb = () => {
            lightbox.classList.remove('open', 'bundle-mode', 'grid-mode');
            document.body.style.overflow = '';
            isBundleMode = false;
            lbImg.src = '';
            if (gridView) gridView.scrollTop = 0;
        };
        lightbox.addEventListener('click', e => {
            if (e.target === lightbox || e.target === gridView || e.target.classList.contains('lightbox-close')) closeLb();
        });
        document.addEventListener('keydown', e => {
            if (!lightbox.classList.contains('open')) return;
            if (e.key === 'Escape') closeLb();
            else if (e.key === 'ArrowLeft' && !lightbox.classList.contains('grid-mode')) showAt(currentIndex - 1);
            else if (e.key === 'ArrowRight' && !lightbox.classList.contains('grid-mode')) showAt(currentIndex + 1);
        });

        let touchStartX = 0;
        lightbox.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
        lightbox.addEventListener('touchend', e => {
            if (lightbox.classList.contains('grid-mode')) return;
            const dx = e.changedTouches[0].clientX - touchStartX;
            if (Math.abs(dx) > 50) showAt(currentIndex + (dx < 0 ? 1 : -1));
        });
    }


    // ── Active nav link ──
    const path = location.pathname;
    const currentPage = path.split('/').pop() || 'index.html';
    const isServicePage = path.includes('/services/');
    document.querySelectorAll('.header-nav > a, .mobile-nav > a').forEach(a => {
        const href = a.getAttribute('href');
        if (href === currentPage || (currentPage === 'index.html' && href === 'index.html')) {
            a.classList.add('active');
        }
    });
    // Mark Services dropdown as active when on any service subpage
    if (isServicePage) {
        const servicesLink = document.querySelector('.nav-dropdown > a');
        if (servicesLink) servicesLink.classList.add('active');
    }
    // Mark Portfolio as active when on any portfolio subpage
    const isPortfolioPage = path.includes('/portfolio/');
    if (isPortfolioPage) {
        document.querySelectorAll('.header-nav > a, .mobile-nav > a').forEach(a => {
            if (a.getAttribute('href') && a.getAttribute('href').includes('portfolio.html')) {
                a.classList.add('active');
            }
        });
    }
});
