/* ═══════════════════════════════════════════
   SILVERFRAME STUDIO — HOMEPAGE JS
   Cinematic scroll-driven animations & interactivity
   ═══════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {

    // ══════════════════════════════════════
    // PRELOADER — counter + dismiss
    // ══════════════════════════════════════
    const preloader = document.getElementById('preloader');
    const counterEl = document.getElementById('preloaderCounter');
    let count = 0;

    function animateCounter() {
        const interval = setInterval(() => {
            count += Math.floor(Math.random() * 8) + 2;
            if (count >= 100) {
                count = 100;
                clearInterval(interval);
                counterEl.textContent = '100';
                setTimeout(dismissPreloader, 400);
            } else {
                counterEl.textContent = count;
            }
        }, 40);
    }

    function dismissPreloader() {
        preloader.classList.add('done');
        document.body.classList.add('page-ready');
        initHero();
    }

    // Start counter; fallback dismiss at 3.5s
    animateCounter();
    setTimeout(() => {
        if (!preloader.classList.contains('done')) dismissPreloader();
    }, 3500);

    // ══════════════════════════════════════
    // CURSOR GLOW (desktop)
    // ══════════════════════════════════════
    const glow = document.getElementById('cursorGlow');
    if (glow && window.matchMedia('(pointer: fine)').matches) {
        let gx = 0, gy = 0, cx = 0, cy = 0;
        document.addEventListener('mousemove', e => { gx = e.clientX; gy = e.clientY; });
        (function glowLoop() {
            cx += (gx - cx) * 0.08;
            cy += (gy - cy) * 0.08;
            glow.style.left = cx + 'px';
            glow.style.top = cy + 'px';
            requestAnimationFrame(glowLoop);
        })();
    }

    // ══════════════════════════════════════
    // SCROLL PROGRESS BAR
    // ══════════════════════════════════════
    const progressBar = document.getElementById('scrollProgress');
    function updateProgress() {
        const scrolled = window.scrollY;
        const total = document.documentElement.scrollHeight - window.innerHeight;
        const pct = total > 0 ? (scrolled / total) * 100 : 0;
        progressBar.style.width = pct + '%';
    }

    // ══════════════════════════════════════
    // HEADER — scroll state
    // ══════════════════════════════════════
    const header = document.getElementById('header');
    function updateHeader() {
        header.classList.toggle('scrolled', window.scrollY > 60);
    }

    // ══════════════════════════════════════
    // MOBILE MENU
    // ══════════════════════════════════════
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

    // ══════════════════════════════════════
    // HERO — Image slideshow + text reveal
    // ══════════════════════════════════════
    const heroImages = document.querySelectorAll('.hero-img');
    const heroWords = document.querySelectorAll('.hero-word');
    const heroTag = document.querySelector('.hero-tag');
    const heroActions = document.querySelector('.hero-actions');
    const slideCurrent = document.getElementById('slideCurrent');
    let currentSlide = 0;
    let slideInterval;

    function initHero() {
        // Activate first slide
        if (heroImages.length) heroImages[0].classList.add('active');
        if (slideCurrent) slideCurrent.textContent = '01';

        // Reveal words with stagger
        heroWords.forEach((word, i) => {
            const delay = parseInt(word.dataset.delay) || 0;
            setTimeout(() => word.classList.add('visible'), 500 + delay * 180);
        });

        // Reveal tag & actions
        setTimeout(() => { if (heroTag) heroTag.classList.add('visible'); }, 400);
        setTimeout(() => { if (heroActions) heroActions.classList.add('visible'); }, 800);

        // Start slideshow
        slideInterval = setInterval(nextSlide, 5000);
    }

    function nextSlide() {
        heroImages[currentSlide].classList.remove('active');
        currentSlide = (currentSlide + 1) % heroImages.length;
        heroImages[currentSlide].classList.add('active');
        if (slideCurrent) slideCurrent.textContent = String(currentSlide + 1).padStart(2, '0');
    }

    // ══════════════════════════════════════
    // SCROLL REVEAL — [data-reveal]
    // ══════════════════════════════════════
    const revealEls = document.querySelectorAll('[data-reveal]');
    const revealObs = new IntersectionObserver(entries => {
        entries.forEach(e => {
            if (e.isIntersecting) {
                e.target.classList.add('visible');
                revealObs.unobserve(e.target);
            }
        });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    revealEls.forEach(el => revealObs.observe(el));

    // ══════════════════════════════════════
    // INTRO IMAGE REVEAL
    // ══════════════════════════════════════
    const introFrame = document.querySelector('.intro-img-frame');
    if (introFrame) {
        const introObs = new IntersectionObserver(entries => {
            entries.forEach(e => {
                if (e.isIntersecting) {
                    e.target.classList.add('revealed');
                    introObs.unobserve(e.target);
                }
            });
        }, { threshold: 0.3 });
        introObs.observe(introFrame);
    }

    // ══════════════════════════════════════
    // HORIZONTAL SCROLL SHOWCASE — drag to scroll
    // ══════════════════════════════════════
    const track = document.getElementById('showcaseTrack');
    if (track) {
        let isDown = false, startX, scrollLeft;
        track.addEventListener('mousedown', e => {
            isDown = true; track.style.cursor = 'grabbing';
            startX = e.pageX - track.offsetLeft;
            scrollLeft = track.scrollLeft;
        });
        track.addEventListener('mouseleave', () => { isDown = false; track.style.cursor = 'grab'; });
        track.addEventListener('mouseup', () => { isDown = false; track.style.cursor = 'grab'; });
        track.addEventListener('mousemove', e => {
            if (!isDown) return;
            e.preventDefault();
            const x = e.pageX - track.offsetLeft;
            track.scrollLeft = scrollLeft - (x - startX) * 1.5;
        });
    }

    // ══════════════════════════════════════
    // MOSAIC — Lightbox
    // ══════════════════════════════════════
    const lightbox = document.getElementById('lightbox');
    if (lightbox) {
        const lbImg = lightbox.querySelector('img');
        document.querySelectorAll('.mosaic-item').forEach(item => {
            item.addEventListener('click', () => {
                const img = item.querySelector('img');
                lbImg.src = img.src;
                lbImg.alt = img.alt || '';
                lightbox.classList.add('open');
                document.body.style.overflow = 'hidden';
            });
        });
        const closeLb = () => { lightbox.classList.remove('open'); document.body.style.overflow = ''; };
        lightbox.addEventListener('click', e => {
            if (e.target === lightbox || e.target.classList.contains('lightbox-close')) closeLb();
        });
        document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLb(); });
    }

    // ══════════════════════════════════════
    // STATS — Animated counters
    // ══════════════════════════════════════
    const statItems = document.querySelectorAll('.stat-item');
    let statsCounted = false;

    function animateStats() {
        if (statsCounted) return;
        statsCounted = true;
        statItems.forEach(item => {
            const target = parseInt(item.dataset.count);
            const suffix = item.dataset.suffix || '';
            const numEl = item.querySelector('.stat-number');
            const duration = 2000;
            const start = performance.now();

            function step(now) {
                const elapsed = now - start;
                const progress = Math.min(elapsed / duration, 1);
                // Ease out cubic
                const eased = 1 - Math.pow(1 - progress, 3);
                const current = Math.floor(eased * target);
                numEl.textContent = current.toLocaleString('hu-HU') + suffix;
                if (progress < 1) requestAnimationFrame(step);
            }
            requestAnimationFrame(step);
        });
    }

    const statsSection = document.getElementById('stats');
    if (statsSection) {
        const statsObs = new IntersectionObserver(entries => {
            entries.forEach(e => {
                if (e.isIntersecting) {
                    animateStats();
                    statsObs.unobserve(e.target);
                }
            });
        }, { threshold: 0.4 });
        statsObs.observe(statsSection);
    }

    // ══════════════════════════════════════
    // REVIEWS — Slider
    // ══════════════════════════════════════
    const reviewCards = document.querySelectorAll('.review-card');
    const reviewPrev = document.getElementById('reviewPrev');
    const reviewNext = document.getElementById('reviewNext');
    const reviewCurrentEl = document.getElementById('reviewCurrent');
    const reviewProgressBar = document.getElementById('reviewProgressBar');
    let reviewIndex = 0;
    let reviewAutoInterval;

    function showReview(idx) {
        reviewCards.forEach(c => { c.classList.remove('active'); c.style.transform = 'translateX(60px)'; });
        reviewCards[idx].classList.add('active');
        reviewCards[idx].style.transform = 'translateX(0)';
        if (reviewCurrentEl) reviewCurrentEl.textContent = idx + 1;
        if (reviewProgressBar) {
            const pct = ((idx) / reviewCards.length) * 100;
            reviewProgressBar.style.transform = `translateX(${pct * (reviewCards.length - 1) / (reviewCards.length > 1 ? 1 : 1)}%)`;
            reviewProgressBar.style.width = (100 / reviewCards.length) + '%';
            reviewProgressBar.style.transform = `translateX(${idx * 100}%)`;
        }
        reviewIndex = idx;
    }

    function nextReview() {
        showReview((reviewIndex + 1) % reviewCards.length);
    }
    function prevReview() {
        showReview((reviewIndex - 1 + reviewCards.length) % reviewCards.length);
    }

    if (reviewCards.length) {
        showReview(0);
        if (reviewNext) reviewNext.addEventListener('click', () => { nextReview(); resetReviewAuto(); });
        if (reviewPrev) reviewPrev.addEventListener('click', () => { prevReview(); resetReviewAuto(); });
        reviewAutoInterval = setInterval(nextReview, 5000);
    }
    function resetReviewAuto() {
        clearInterval(reviewAutoInterval);
        reviewAutoInterval = setInterval(nextReview, 5000);
    }

    // ══════════════════════════════════════
    // PARALLAX — subtle depth on scroll
    // ══════════════════════════════════════
    const parallaxEls = document.querySelectorAll('[data-parallax]');
    function updateParallax() {
        const scrollY = window.scrollY;
        parallaxEls.forEach(el => {
            const speed = parseFloat(el.dataset.parallax) || 0.1;
            const rect = el.getBoundingClientRect();
            const offset = (rect.top + scrollY - window.innerHeight / 2) * speed;
            el.style.transform = `translateY(${-offset}px)`;
        });
    }

    // ══════════════════════════════════════
    // MAGNETIC HOVER — mosaic items
    // ══════════════════════════════════════
    if (window.matchMedia('(pointer: fine)').matches) {
        document.querySelectorAll('[data-magnetic]').forEach(el => {
            el.addEventListener('mousemove', e => {
                const rect = el.getBoundingClientRect();
                const x = e.clientX - rect.left - rect.width / 2;
                const y = e.clientY - rect.top - rect.height / 2;
                el.style.transform = `translate(${x * 0.04}px, ${y * 0.04}px)`;
            });
            el.addEventListener('mouseleave', () => {
                el.style.transform = 'translate(0, 0)';
            });
        });
    }

    // ══════════════════════════════════════
    // TILT — showcase cards
    // ══════════════════════════════════════
    if (window.matchMedia('(pointer: fine)').matches) {
        document.querySelectorAll('[data-tilt]').forEach(card => {
            card.addEventListener('mousemove', e => {
                const rect = card.getBoundingClientRect();
                const x = (e.clientX - rect.left) / rect.width - 0.5;
                const y = (e.clientY - rect.top) / rect.height - 0.5;
                card.style.transform = `translateY(-8px) perspective(800px) rotateY(${x * 6}deg) rotateX(${-y * 6}deg)`;
            });
            card.addEventListener('mouseleave', () => {
                card.style.transform = 'translateY(0) perspective(800px) rotateY(0) rotateX(0)';
            });
        });
    }

    // ══════════════════════════════════════
    // MOSAIC — staggered reveal
    // ══════════════════════════════════════
    const mosaicItems = document.querySelectorAll('.mosaic-item');
    const mosaicObs = new IntersectionObserver(entries => {
        entries.forEach((e, i) => {
            if (e.isIntersecting) {
                setTimeout(() => {
                    e.target.style.opacity = '1';
                    e.target.style.transform = 'translateY(0)';
                }, i * 80);
                mosaicObs.unobserve(e.target);
            }
        });
    }, { threshold: 0.1 });
    mosaicItems.forEach(item => {
        item.style.opacity = '0';
        item.style.transform = 'translateY(30px)';
        item.style.transition = 'opacity 0.7s cubic-bezier(0.16,1,0.3,1), transform 0.7s cubic-bezier(0.16,1,0.3,1)';
        mosaicObs.observe(item);
    });

    // ══════════════════════════════════════
    // SCROLL LISTENER — unified
    // ══════════════════════════════════════
    function onScroll() {
        updateProgress();
        updateHeader();
        updateParallax();
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    // ══════════════════════════════════════
    // SMOOTH ANCHOR LINKS
    // ══════════════════════════════════════
    document.querySelectorAll('a[href^="#"]').forEach(a => {
        a.addEventListener('click', e => {
            const target = document.querySelector(a.getAttribute('href'));
            if (target) { e.preventDefault(); target.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
        });
    });

    // ══════════════════════════════════════
    // ACTIVE NAV LINK
    // ══════════════════════════════════════
    const path = location.pathname;
    const currentPage = path.split('/').pop() || 'index.html';
    document.querySelectorAll('.header-nav > a, .mobile-nav > a').forEach(a => {
        const href = a.getAttribute('href');
        if (href === currentPage || (currentPage === 'index.html' && href === 'index.html')) {
            a.classList.add('active');
        }
    });
});
