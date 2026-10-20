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
    const masonryGrids = Array.from(document.querySelectorAll('.masonry'));
    const GAP = 6;
    let justifyMasonry = null;

    const justifyOne = (grid) => {
        // Floor so rounding never makes a row wider than the grid (which would wrap it).
        const totalWidth = Math.floor(grid.getBoundingClientRect().width);
        if (!totalWidth) return;
        const targetRowH = window.innerWidth < 600 ? 180 : window.innerWidth < 900 ? 240 : 300;
        const items = Array.from(grid.querySelectorAll(':scope > .masonry-item'))
            .filter(el => el.style.display !== 'none' && el.querySelector('img'));
        if (!items.length) return;

        // Split into rows of roughly the target height.
        const rows = [];
        let row = [], ratioSum = 0;
        items.forEach(item => {
            const img = item.querySelector('img');
            const ratio = (parseInt(img.getAttribute('width')) || 3) / (parseInt(img.getAttribute('height')) || 2);
            row.push({ item, ratio });
            ratioSum += ratio;
            if (targetRowH * ratioSum + (row.length - 1) * GAP >= totalWidth) {
                rows.push({ row, ratioSum });
                row = []; ratioSum = 0;
            }
        });
        if (row.length) rows.push({ row, ratioSum, partial: true });

        // A short last row would leave a gap: stretch it, or merge it into the row above —
        // whichever keeps its height closer to the target.
        const scaleOf = r => (totalWidth - (r.row.length - 1) * GAP) / (targetRowH * r.ratioSum);
        const last = rows[rows.length - 1];
        if (last.partial) {
            if (rows.length > 1) {
                const prev = rows[rows.length - 2];
                const merged = { row: prev.row.concat(last.row), ratioSum: prev.ratioSum + last.ratioSum };
                if (Math.abs(Math.log(scaleOf(merged))) < Math.abs(Math.log(scaleOf(last)))) rows.splice(-2, 2, merged);
                else last.partial = false;
            } else if (scaleOf(last) <= 1.6) {
                last.partial = false;   // a lone short row (tiny set): stretch only if it stays reasonable
            }
        }

        rows.forEach(r => {
            const available = totalWidth - (r.row.length - 1) * GAP;
            const h = r.partial ? targetRowH : Math.round(available / r.ratioSum);
            const rowW = r.partial ? targetRowH * r.ratioSum : available;
            // Cumulative rounding: widths add up to exactly the row width, so the right edge is flush.
            let acc = 0, prevEdge = 0;
            r.row.forEach(({ item, ratio }) => {
                acc += rowW * ratio / r.ratioSum;
                const edge = Math.round(acc);
                item.style.width = (edge - prevEdge) + 'px';
                item.style.height = h + 'px';
                prevEdge = edge;
            });
        });
    };

    if (masonryGrids.length) {
        justifyMasonry = () => masonryGrids.forEach(justifyOne);
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
        const lbImg = lightbox.querySelector('img');
        const prevBtn = lightbox.querySelector('.lightbox-prev');
        const nextBtn = lightbox.querySelector('.lightbox-next');
        const counter = lightbox.querySelector('.lightbox-counter');
        const itemSelectors = '.masonry-item, .gallery-preview-item, .service-gallery-item';
        const containerSelectors = '.masonry, .gallery-preview, .service-gallery';
        let currentList = [];
        let currentIndex = 0;

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
            return { src: img ? (img.dataset.full || img.src) : '', alt: img ? (img.alt || '') : '' };
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

        const openLb = () => {
            lightbox.classList.add('open');
            document.body.style.overflow = 'hidden';
        };

        // ── Bundle album: all photos of a set in a justified grid ──
        const isEn = (document.documentElement.lang || '').toLowerCase().startsWith('en');
        const album = document.createElement('div');
        album.className = 'album';
        album.setAttribute('role', 'dialog');
        album.setAttribute('aria-label', isEn ? 'Photo set' : 'Képsorozat');
        album.innerHTML = `<div class="album-header"><div class="album-heading"><h2 class="album-title"></h2><span class="album-count"></span></div><button class="album-close" aria-label="${isEn ? 'Close' : 'Bezárás'}">&times;</button></div><div class="album-body"><div class="album-grid masonry"></div></div>`;
        document.body.appendChild(album);
        const albumGrid = album.querySelector('.album-grid');
        let albumList = [];

        const openAlbum = (item, bundle) => {
            albumList = bundle;
            const h3 = item.querySelector('.bundle-caption h3');
            const coverImg = item.querySelector('img');
            album.querySelector('.album-title').textContent = (h3 && h3.textContent) || (coverImg && coverImg.alt) || '';
            album.querySelector('.album-count').textContent = `${bundle.length} ${isEn ? (bundle.length === 1 ? 'photo' : 'photos') : 'kép'}`;
            albumGrid.innerHTML = '';
            bundle.forEach((entry, i) => {
                const tile = document.createElement('div');
                tile.className = 'masonry-item no-title';
                const img = document.createElement('img');
                img.loading = 'lazy';
                img.src = entry.t || entry.src;
                img.alt = entry.alt || '';
                img.setAttribute('width', entry.w || 3);
                img.setAttribute('height', entry.h || 2);
                tile.appendChild(img);
                tile.addEventListener('click', () => {
                    currentList = albumList;
                    showAt(i);
                    openLb();
                });
                albumGrid.appendChild(tile);
            });
            album.scrollTop = 0;
            album.classList.add('open');
            document.body.style.overflow = 'hidden';
            justifyOne(albumGrid);
            history.pushState({ sfAlbum: true }, '');
        };

        const closeAlbum = (fromPopState) => {
            if (!album.classList.contains('open')) return;
            album.classList.remove('open');
            document.body.style.overflow = '';
            albumGrid.innerHTML = '';
            if (!fromPopState && history.state && history.state.sfAlbum) history.back();
        };

        album.querySelector('.album-close').addEventListener('click', () => closeAlbum(false));
        window.addEventListener('popstate', () => {
            if (!album.classList.contains('open')) return;
            if (lightbox.classList.contains('open')) closeLb();
            closeAlbum(true);
        });
        let aTimer;
        window.addEventListener('resize', () => {
            if (!album.classList.contains('open')) return;
            clearTimeout(aTimer); aTimer = setTimeout(() => justifyOne(albumGrid), 120);
        }, { passive: true });
        // Registered before the lightbox key handler: Esc closes the lightbox first, then the album.
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && album.classList.contains('open') && !lightbox.classList.contains('open')) closeAlbum(false);
        });

        document.querySelectorAll(itemSelectors).forEach(item => {
            item.addEventListener('click', () => {
                const bundle = parseBundle(item);
                if (bundle) {
                    openAlbum(item, bundle);
                    return;
                }
                const container = item.closest(containerSelectors) || document;
                const siblings = Array.from(container.querySelectorAll(itemSelectors))
                    .filter(el => el.style.display !== 'none' && !el.hasAttribute('data-bundle'));
                currentList = siblings.map(itemToEntry);
                showAt(siblings.indexOf(item));
                openLb();
            });
        });

        if (prevBtn) prevBtn.addEventListener('click', e => { e.stopPropagation(); showAt(currentIndex - 1); });
        if (nextBtn) nextBtn.addEventListener('click', e => { e.stopPropagation(); showAt(currentIndex + 1); });

        function closeLb() {
            lightbox.classList.remove('open');
            if (!album.classList.contains('open')) document.body.style.overflow = '';
            lbImg.src = '';
        }
        lightbox.addEventListener('click', e => { if (e.target === lightbox || e.target.classList.contains('lightbox-close')) closeLb(); });
        document.addEventListener('keydown', e => {
            if (!lightbox.classList.contains('open')) return;
            if (e.key === 'Escape') closeLb();
            else if (e.key === 'ArrowLeft') showAt(currentIndex - 1);
            else if (e.key === 'ArrowRight') showAt(currentIndex + 1);
        });

        let touchStartX = 0;
        lightbox.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
        lightbox.addEventListener('touchend', e => {
            const dx = e.changedTouches[0].clientX - touchStartX;
            if (Math.abs(dx) > 50) showAt(currentIndex + (dx < 0 ? 1 : -1));
        });
    }


    // ── Before/After multi-pair carousel ──
    const baTrack = document.querySelector('.ba-track');
    if (baTrack) {
        const pairs = Array.from(baTrack.querySelectorAll('.ba-pair'));
        const dots  = Array.from(document.querySelectorAll('.ba-dot'));
        let currentIdx = 0;
        let dragging = false;

        function setSliderPos(slider, x) {
            const after  = slider.querySelector('.ba-after');
            const handle = slider.querySelector('.ba-handle');
            const rect   = slider.getBoundingClientRect();
            const pct    = Math.min(Math.max((x - rect.left) / rect.width * 100, 2), 98);
            after.style.clipPath = `inset(0 0 0 ${pct}%)`;
            handle.style.left    = pct + '%';
        }

        function activeSlider() {
            return pairs[currentIdx]?.querySelector('.ba-slider');
        }

        function resetActive() {
            const s = activeSlider();
            if (s) requestAnimationFrame(() => setSliderPos(s, s.getBoundingClientRect().left + s.offsetWidth * 0.5));
        }

        function goTo(idx) {
            pairs[currentIdx]?.classList.remove('active');
            dots[currentIdx]?.classList.remove('active');
            currentIdx = (idx + pairs.length) % pairs.length;
            pairs[currentIdx]?.classList.add('active');
            dots[currentIdx]?.classList.add('active');
            resetActive();
        }

        // Per-slider mousedown/touchstart to start drag
        pairs.forEach(pair => {
            const s = pair.querySelector('.ba-slider');
            if (!s) return;
            s.addEventListener('mousedown',  e => { dragging = true; setSliderPos(s, e.clientX); });
            s.addEventListener('touchstart', e => { dragging = true; setSliderPos(s, e.touches[0].clientX); }, { passive: true });
        });

        window.addEventListener('mousemove',  e => { if (dragging) { const s = activeSlider(); if (s) setSliderPos(s, e.clientX); } });
        window.addEventListener('mouseup',   () => { dragging = false; });
        window.addEventListener('touchmove',  e => { if (dragging) { const s = activeSlider(); if (s) setSliderPos(s, e.touches[0].clientX); } }, { passive: true });
        window.addEventListener('touchend',  () => { dragging = false; });

        document.querySelector('.ba-prev-btn')?.addEventListener('click', () => goTo(currentIdx - 1));
        document.querySelector('.ba-next-btn')?.addEventListener('click', () => goTo(currentIdx + 1));
        dots.forEach((dot, i) => dot.addEventListener('click', () => goTo(i)));

        resetActive();
    }

    // ── Active nav link ──
    const path = location.pathname;
    const currentPage = path.split('/').pop() || 'index.html';
    const isServicePage = path.includes('/services/');
    document.querySelectorAll('.header-nav > a, .mobile-nav a').forEach(a => {
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
        document.querySelectorAll('.header-nav > a, .mobile-nav a').forEach(a => {
            if (a.getAttribute('href') && a.getAttribute('href').includes('portfolio.html')) {
                a.classList.add('active');
            }
        });
    }
});
