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
                    setTimeout(() => { item.style.display = match ? 'block' : 'none'; }, match ? 0 : 350);
                });
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

        const showAt = (i) => {
            if (!currentList.length) return;
            currentIndex = (i + currentList.length) % currentList.length;
            const img = currentList[currentIndex].querySelector('img');
            if (img) {
                lbImg.src = img.src;
                lbImg.alt = img.alt || '';
            }
            if (counter) counter.textContent = `${currentIndex + 1} / ${currentList.length}`;
            const many = currentList.length > 1;
            if (prevBtn) prevBtn.style.display = many ? '' : 'none';
            if (nextBtn) nextBtn.style.display = many ? '' : 'none';
            if (counter) counter.style.display = many ? '' : 'none';
        };

        document.querySelectorAll(itemSelectors).forEach(item => {
            item.addEventListener('click', () => {
                const container = item.closest(containerSelectors) || document;
                currentList = Array.from(container.querySelectorAll(itemSelectors))
                    .filter(el => el.style.display !== 'none');
                const idx = currentList.indexOf(item);
                showAt(idx < 0 ? 0 : idx);
                lightbox.classList.add('open');
                document.body.style.overflow = 'hidden';
            });
        });

        if (prevBtn) prevBtn.addEventListener('click', e => { e.stopPropagation(); showAt(currentIndex - 1); });
        if (nextBtn) nextBtn.addEventListener('click', e => { e.stopPropagation(); showAt(currentIndex + 1); });

        const closeLb = () => { lightbox.classList.remove('open'); document.body.style.overflow = ''; };
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
