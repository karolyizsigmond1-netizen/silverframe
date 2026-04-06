/* === Silverframe Studio Admin Panel === */
(function () {
    'use strict';

    let contentData = null;
    let dirty = false;
    let currentPage = null;
    let uploadCallback = null;
    let dragState = null; // { arrayPath, fromIndex }

    const $ = s => document.querySelector(s);
    const $$ = s => document.querySelectorAll(s);

    // ── Navigation structure ──
    const NAV = [
        {
            label: 'Főoldalak', items: [
                { id: 'global', title: 'Globális beállítások' },
                { id: 'pages.index', title: 'Főoldal' },
                { id: 'pages.about', title: 'Rólam' },
                { id: 'pages.portfolio', title: 'Portfólió' },
                { id: 'pages.services', title: 'Szolgáltatások' },
                { id: 'pages.contact', title: 'Kapcsolat' },
            ]
        },
        {
            label: 'Szolgáltatás oldalak', items: [
                { id: 'servicePages.portfolio-model', title: 'Portré / Modell' },
                { id: 'servicePages.maternity', title: 'Kismama' },
                { id: 'servicePages.boudoir', title: 'Boudoir' },
                { id: 'servicePages.family', title: 'Család' },
                { id: 'servicePages.couple', title: 'Pár' },
                { id: 'servicePages.business', title: 'Üzleti' },
                { id: 'servicePages.real-estate', title: 'Ingatlan' },
                { id: 'servicePages.wedding', title: 'Esküvő' },
                { id: 'servicePages.wedding-creative', title: 'Esküvő Kreatív' },
                { id: 'servicePages.event', title: 'Rendezvény' },
                { id: 'servicePages.pet', title: 'Állatfotó' },
                { id: 'servicePages.product', title: 'Termékfotó' },
            ]
        },
        {
            label: 'Portfólió galériák', items: [
                { id: 'portfolioPages.portrait', title: 'Portré' },
                { id: 'portfolioPages.maternity', title: 'Kismama' },
                { id: 'portfolioPages.boudoir', title: 'Boudoir' },
                { id: 'portfolioPages.family', title: 'Család' },
                { id: 'portfolioPages.couple', title: 'Pár' },
                { id: 'portfolioPages.business', title: 'Üzleti' },
                { id: 'portfolioPages.real-estate', title: 'Ingatlan' },
                { id: 'portfolioPages.wedding', title: 'Esküvő' },
                { id: 'portfolioPages.wedding-creative', title: 'Esküvő Kreatív' },
                { id: 'portfolioPages.event', title: 'Rendezvény' },
                { id: 'portfolioPages.pet', title: 'Állatfotó' },
                { id: 'portfolioPages.product', title: 'Termékfotó' },
            ]
        }
    ];

    // ── Page ID → site URL mapping ──
    function getPageUrl(pageId) {
        if (!pageId) return '/';
        if (pageId === 'global' || pageId === 'pages.index') return '/';
        if (pageId === 'pages.about') return '/about.html';
        if (pageId === 'pages.portfolio') return '/portfolio.html';
        if (pageId === 'pages.services') return '/services.html';
        if (pageId === 'pages.contact') return '/contact.html';
        if (pageId.startsWith('servicePages.')) return '/services/' + pageId.split('.')[1] + '.html';
        if (pageId.startsWith('portfolioPages.')) return '/portfolio/' + pageId.split('.')[1] + '.html';
        return '/';
    }

    // ── Init ──
    async function init() {
        buildSidebar();
        bindTopbar();
        bindUploadModal();
        bindConfirmModal();
        bindToolButtons();
        bindImageEditor();
        await loadContent();
    }

    // ── Load content from server ──
    async function loadContent() {
        try {
            const res = await fetch('/api/content');
            if (!res.ok) throw new Error('Nem sikerült betölteni');
            contentData = await res.json();
            toast('Tartalom betöltve', 'info');
        } catch (e) {
            toast('Hiba: ' + e.message, 'error');
        }
    }

    // ── Save content to server ──
    async function saveContent() {
        if (!contentData) return;
        const btn = $('#save-btn');
        btn.classList.add('saving');
        btn.textContent = 'Mentés...';
        btn.disabled = true;

        try {
            const res = await fetch('/api/content', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(contentData)
            });
            const data = await res.json();
            if (data.success) {
                toast('Sikeresen mentve és újraépítve!', 'success');
                setDirty(false);
            } else {
                toast('Hiba: ' + (data.message || 'Ismeretlen hiba'), 'error');
            }
        } catch (e) {
            toast('Mentési hiba: ' + e.message, 'error');
        }

        btn.classList.remove('saving');
        btn.textContent = 'Mentés';
        updateSaveBtn();
    }

    // ── Dirty state ──
    function setDirty(val) {
        dirty = val;
        updateSaveBtn();
    }

    function updateSaveBtn() {
        const btn = $('#save-btn');
        const badge = $('#unsaved-badge');
        btn.disabled = !dirty;
        badge.classList.toggle('hidden', !dirty);
    }

    // ── Sidebar ──
    function buildSidebar() {
        const nav = $('#sidebar-nav');
        let html = '';
        for (const group of NAV) {
            html += `<div class="nav-group-label">${group.label}</div>`;
            for (const item of group.items) {
                html += `<div class="nav-item" data-page="${item.id}">${item.title}</div>`;
            }
        }
        nav.innerHTML = html;
        nav.addEventListener('click', e => {
            const item = e.target.closest('.nav-item');
            if (!item) return;
            selectPage(item.dataset.page);
        });
    }

    function selectPage(pageId) {
        currentPage = pageId;
        $$('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.page === pageId));
        const navItem = NAV.flatMap(g => g.items).find(i => i.id === pageId);
        $('#page-title').textContent = navItem ? navItem.title : pageId;
        renderEditor(pageId);
    }

    // ── Topbar ──
    function bindTopbar() {
        $('#save-btn').addEventListener('click', saveContent);
    }

    // ── Tool buttons (dedup & cleanup) ──
    function bindToolButtons() {
        $('#btn-dedup').addEventListener('click', async () => {
            const confirmed = await confirmAction(
                'Duplikátumok törlése',
                'Az azonos tartalmú képek közül csak egy marad meg, a hivatkozások automatikusan frissülnek.'
            );
            if (!confirmed) return;
            try {
                toast('Duplikátumok keresése...', 'info');
                const res = await fetch('/api/dedup-uploads', { method: 'POST' });
                const data = await res.json();
                if (data.success) {
                    if (data.duplicatesRemoved === 0) {
                        toast('Nincsenek duplikátumok!', 'info');
                    } else {
                        toast(`${data.duplicatesRemoved} duplikátum törölve, ${data.referencesUpdated} hivatkozás frissítve!`, 'success');
                        // Reload content since references may have changed
                        await loadContent();
                        if (currentPage) renderEditor(currentPage);
                    }
                }
            } catch (e) {
                toast('Hiba: ' + e.message, 'error');
            }
        });

        $('#btn-rename').addEventListener('click', () => openRenameModal());

        $('#btn-cleanup').addEventListener('click', async () => {
            const confirmed = await confirmAction(
                'Nem használt képek törlése',
                'Minden kép törlődik az uploads mappából, amit a content.json nem használ. Ez nem vonható vissza!'
            );
            if (!confirmed) return;
            try {
                toast('Nem használt képek keresése...', 'info');
                const res = await fetch('/api/cleanup-uploads', { method: 'POST' });
                const data = await res.json();
                if (data.success) {
                    if (data.removed === 0) {
                        toast('Nincs nem használt kép!', 'info');
                    } else {
                        toast(`${data.removed} nem használt kép törölve! (${data.kept} megtartva)`, 'success');
                    }
                }
            } catch (e) {
                toast('Hiba: ' + e.message, 'error');
            }
        });

        $('#btn-collections').addEventListener('click', () => openCollections());

        $('#btn-batch-process').addEventListener('click', () => openBatchProcess());
    }

    // ── Resolve nested path ──
    function getByPath(obj, path) {
        return path.split('.').reduce((o, k) => (o && o[k] !== undefined) ? o[k] : undefined, obj);
    }

    function setByPath(obj, path, value) {
        const keys = path.split('.');
        let cur = obj;
        for (let i = 0; i < keys.length - 1; i++) {
            if (cur[keys[i]] === undefined) cur[keys[i]] = {};
            cur = cur[keys[i]];
        }
        cur[keys[keys.length - 1]] = value;
    }

    // ── Render editor for a page ──
    function renderEditor(pageId) {
        const area = $('#editor-area');
        const scrollTop = area.scrollTop;
        if (!contentData) { area.innerHTML = '<p>Tartalom betöltése...</p>'; return; }

        const data = getByPath(contentData, pageId);
        if (!data) { area.innerHTML = '<p>Nincs adat ehhez az oldalhoz.</p>'; return; }

        if (pageId === 'global') {
            area.innerHTML = renderGlobalEditor(data);
        } else if (pageId.startsWith('servicePages.')) {
            area.innerHTML = renderServicePageEditor(data, pageId);
        } else if (pageId.startsWith('portfolioPages.')) {
            area.innerHTML = renderPortfolioPageEditor(data, pageId);
        } else {
            area.innerHTML = renderGenericPageEditor(data, pageId);
        }

        bindFieldEvents(area);
        initDragReorder(area);
        initFileDropOnImages(area);
        initFileDropOnGalleryCards(area);
        initBulkUploadZones(area);
        initImageLightbox(area);
        initCollapsible(area);
        initShowOnSite(area);
        initImageEditButtons(area);

        area.scrollTop = scrollTop;
    }

    // ── Field renderers ──
    function textField(label, path, value, hint) {
        const val = value || '';
        return `<div class="field-group">
            <div class="field-label-row">
                <label class="field-label">${label}</label>
                <button class="btn-show-on-site" data-show-text="${esc(val)}" title="Megjelenítés az oldalon">&#128065;</button>
            </div>
            <input class="field-input" type="text" data-path="${path}" value="${esc(val)}">
            ${hint ? `<div class="field-hint">${hint}</div>` : ''}
        </div>`;
    }

    function textareaField(label, path, value, tall) {
        const val = value || '';
        return `<div class="field-group">
            <div class="field-label-row">
                <label class="field-label">${label}</label>
                <button class="btn-show-on-site" data-show-text="${esc(val)}" title="Megjelenítés az oldalon">&#128065;</button>
            </div>
            <textarea class="field-textarea${tall ? ' tall' : ''}" data-path="${path}">${esc(val)}</textarea>
        </div>`;
    }

    function imageField(label, path, value) {
        const src = value || '';
        const previewSrc = src ? (src.startsWith('http') ? src : '/' + src) : '';
        return `<div class="field-group">
            <label class="field-label">${label}</label>
            <div class="image-field" data-drop-upload="true" data-upload-target="${path}">
                <input class="field-input" type="text" data-path="${path}" value="${esc(src)}">
                <button class="btn-upload" data-upload-for="${path}">Feltöltés</button>
                ${previewSrc
                    ? `<img class="image-preview" src="${previewSrc}" alt="Preview" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="image-placeholder" style="display:none">&#128247;</div><button class="btn-edit-image" data-edit-src="${esc(previewSrc)}" data-edit-target="${path}" title="Szerkesztés (vágás/átméretezés)">&#9998;</button>`
                    : `<div class="image-placeholder">&#128247;</div>`}
                <div class="drop-label">Ejtse ide a képet</div>
            </div>
        </div>`;
    }

    function esc(str) {
        return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function selectField(label, path, value, options) {
        const opts = options.map(o => {
            const val = typeof o === 'string' ? o : o.value;
            const text = typeof o === 'string' ? o : o.label;
            return `<option value="${esc(val)}"${val === value ? ' selected' : ''}>${esc(text)}</option>`;
        }).join('');
        return `<div class="field-group">
            <label class="field-label">${label}</label>
            <select class="field-select" data-path="${path}">${opts}</select>
        </div>`;
    }

    function numberField(label, path, value, hint) {
        return `<div class="field-group">
            <label class="field-label">${label}</label>
            <input class="field-input" type="number" data-path="${path}" value="${value || ''}" min="1" max="60">
            ${hint ? `<div class="field-hint">${hint}</div>` : ''}
        </div>`;
    }

    // ── Global editor ──
    function renderGlobalEditor(data) {
        let html = '<div class="field-section"><div class="field-section-title">Globális beállítások</div>';
        html += textField('Weboldal neve', 'global.siteName', data.siteName);
        html += textField('Telefon', 'global.phone', data.phone);
        html += textField('Email', 'global.email', data.email);
        html += textField('Facebook URL', 'global.facebook', data.facebook);
        html += textField('Instagram URL', 'global.instagram', data.instagram);
        html += textField('Cím', 'global.address', data.address);
        html += '</div>';

        // Design settings
        html += '<div class="field-section"><div class="field-section-title">Dizájn beállítások</div>';
        html += selectField('Gomb stílus', 'global.buttonStyle', data.buttonStyle || 'square', [
            { value: 'square', label: 'Szögletes (alapértelmezett)' },
            { value: 'rounded', label: 'Lekerekített' }
        ]);
        html += '</div>';

        // Service categories
        html += '<div class="field-section"><div class="field-section-title">Szolgáltatás kategóriák</div>';
        html += '<div class="array-list" data-array-path="serviceCategories">';
        if (contentData.serviceCategories) {
            contentData.serviceCategories.forEach((cat, i) => {
                html += `<div class="array-item" draggable="false" data-index="${i}">
                    <div class="drag-handle" title="Húzza az áthelyezéshez">&#8942;&#8942;</div>
                    <div class="array-item-header">
                        <span class="array-item-number">#${i + 1}</span>
                    </div>
                    ${textField('Név', 'serviceCategories.' + i + '.name', cat.name)}
                    ${textField('Link', 'serviceCategories.' + i + '.href', cat.href)}
                    ${imageField('Kép', 'serviceCategories.' + i + '.img', cat.img)}
                </div>`;
            });
        }
        html += '</div></div>';
        return html;
    }

    // ── Generic page editor ──
    function renderGenericPageEditor(data, pageId) {
        let html = '';
        html += '<div class="field-section"><div class="field-section-title">Oldal beállítások</div>';
        if (data.title !== undefined) html += textField('Oldal cím (title)', pageId + '.title', data.title);
        if (data.metaDesc !== undefined) html += textareaField('Meta leírás', pageId + '.metaDesc', data.metaDesc);
        html += '</div>';
        html += renderObjectFields(data, pageId, ['title', 'metaDesc']);
        return html;
    }

    // ── Service page editor ──
    function renderServicePageEditor(data, pageId) {
        let html = '';

        // Meta
        html += '<div class="field-section"><div class="field-section-title">SEO & Meta</div>';
        html += textField('Oldal cím', pageId + '.title', data.title);
        html += textareaField('Meta leírás', pageId + '.metaDesc', data.metaDesc);
        html += imageField('OG kép', pageId + '.ogImage', data.ogImage);
        html += '</div>';

        // Hero
        html += '<div class="field-section"><div class="field-section-title">Hero szekció</div>';
        html += imageField('Hero kép', pageId + '.heroImage', data.heroImage);
        html += textField('Hero címke', pageId + '.heroLabel', data.heroLabel);
        html += textField('Hero cím', pageId + '.heroTitle', data.heroTitle);
        html += textField('Breadcrumb', pageId + '.breadcrumb', data.breadcrumb);
        html += '</div>';

        // Intro
        html += '<div class="field-section"><div class="field-section-title">Bemutató szekció</div>';
        html += textField('Címke', pageId + '.introLabel', data.introLabel);
        html += textField('Cím', pageId + '.introTitle', data.introTitle);
        if (data.introDesc && Array.isArray(data.introDesc)) {
            html += '<div class="field-group"><label class="field-label">Bekezdések</label>';
            html += '<div class="array-list" data-array-path="' + pageId + '.introDesc">';
            data.introDesc.forEach((p, i) => {
                html += `<div class="array-item" draggable="false" data-index="${i}">
                    <div class="drag-handle" title="Húzza az áthelyezéshez">&#8942;&#8942;</div>
                    <div class="array-item-header">
                        <span class="array-item-number">Bekezdés #${i + 1}</span>
                        <div class="array-item-actions">
                            <button class="btn-icon danger" data-remove-array="${pageId}.introDesc" data-index="${i}" title="Törlés">&#10005;</button>
                        </div>
                    </div>
                    <textarea class="field-textarea" data-path="${pageId}.introDesc.${i}">${esc(p)}</textarea>
                </div>`;
            });
            html += '</div>';
            html += `<button class="btn-add" data-add-array="${pageId}.introDesc" data-template="string">+ Bekezdés hozzáadása</button>`;
            html += '</div>';
        }
        if (data.introImage) {
            html += imageField('Bemutató kép', pageId + '.introImage.src', data.introImage.src);
            html += textField('Kép alt szöveg', pageId + '.introImage.alt', data.introImage.alt);
        }
        html += '</div>';

        // Packages
        if (data.packages && data.packages.length > 0) {
            html += '<div class="field-section"><div class="field-section-title">Csomagok</div>';
            html += '<div class="array-list" data-array-path="' + pageId + '.packages">';
            data.packages.forEach((pkg, pi) => {
                html += `<div class="array-item" draggable="false" data-index="${pi}">
                    <div class="drag-handle" title="Húzza az áthelyezéshez">&#8942;&#8942;</div>
                    <div class="array-item-header">
                        <span class="array-item-number">Csomag #${pi + 1}</span>
                        <div class="array-item-actions">
                            <button class="btn-icon danger" data-remove-array="${pageId}.packages" data-index="${pi}" title="Törlés">&#10005;</button>
                        </div>
                    </div>
                    ${textField('Csomag neve', pageId + '.packages.' + pi + '.name', pkg.name)}
                    ${textareaField('Csomag leírás', pageId + '.packages.' + pi + '.desc', pkg.desc)}
                    <div class="nested-array">
                        <label class="field-label">Elemek</label>`;
                if (pkg.items) {
                    pkg.items.forEach((item, ii) => {
                        html += `<div class="nested-item">
                            <div class="array-item-header">
                                <span class="array-item-number">Elem #${ii + 1}</span>
                                <div class="array-item-actions">
                                    <button class="btn-icon danger" data-remove-array="${pageId}.packages.${pi}.items" data-index="${ii}" title="Törlés">&#10005;</button>
                                </div>
                            </div>
                            ${textField('Elem cím', pageId + '.packages.' + pi + '.items.' + ii + '.title', item.title)}
                            ${textField('Elem leírás', pageId + '.packages.' + pi + '.items.' + ii + '.desc', item.desc)}
                        </div>`;
                    });
                }
                html += `<button class="btn-add" data-add-array="${pageId}.packages.${pi}.items" data-template="packageItem">+ Elem hozzáadása</button>`;
                html += '</div></div>';
            });
            html += '</div>';
            html += `<button class="btn-add" data-add-array="${pageId}.packages" data-template="package">+ Csomag hozzáadása</button>`;
            html += '</div>';
        }

        // Gallery
        if (data.gallery) {
            html += renderGallerySection(data.gallery, pageId + '.gallery');
        }

        // CTA
        html += '<div class="field-section"><div class="field-section-title">CTA szekció</div>';
        if (data.ctaLabel !== undefined) html += textField('CTA címke', pageId + '.ctaLabel', data.ctaLabel);
        if (data.ctaTitle !== undefined) html += textField('CTA cím', pageId + '.ctaTitle', data.ctaTitle);
        if (data.ctaButton !== undefined) html += textField('CTA gomb szöveg', pageId + '.ctaButton', data.ctaButton);
        html += '</div>';

        // Navigation
        html += '<div class="field-section"><div class="field-section-title">Navigáció</div>';
        if (data.prevService) {
            html += textField('Előző szolgáltatás neve', pageId + '.prevService.name', data.prevService.name);
            html += textField('Előző szolgáltatás link', pageId + '.prevService.href', data.prevService.href);
        }
        if (data.nextService) {
            html += textField('Következő szolgáltatás neve', pageId + '.nextService.name', data.nextService.name);
            html += textField('Következő szolgáltatás link', pageId + '.nextService.href', data.nextService.href);
        }
        html += '</div>';

        return html;
    }

    // ── Portfolio page editor ──
    function renderPortfolioPageEditor(data, pageId) {
        let html = '';

        html += '<div class="field-section"><div class="field-section-title">SEO & Meta</div>';
        html += textField('Oldal cím', pageId + '.title', data.title);
        html += textareaField('Meta leírás', pageId + '.metaDesc', data.metaDesc);
        html += '</div>';

        html += '<div class="field-section"><div class="field-section-title">Hero szekció</div>';
        html += imageField('Hero kép', pageId + '.heroImage', data.heroImage);
        html += textField('Hero címke', pageId + '.heroLabel', data.heroLabel);
        html += textField('Hero cím', pageId + '.heroTitle', data.heroTitle);
        html += textField('Breadcrumb', pageId + '.breadcrumb', data.breadcrumb);
        html += '</div>';

        if (data.gallery) {
            html += renderGallerySection(data.gallery, pageId + '.gallery');
        }

        html += '<div class="field-section"><div class="field-section-title">CTA szekció</div>';
        if (data.ctaLabel !== undefined) html += textField('CTA címke', pageId + '.ctaLabel', data.ctaLabel);
        if (data.ctaTitle !== undefined) html += textField('CTA cím', pageId + '.ctaTitle', data.ctaTitle);
        if (data.ctaButton !== undefined) html += textField('CTA gomb szöveg', pageId + '.ctaButton', data.ctaButton);
        if (data.ctaLink !== undefined) html += textField('CTA link', pageId + '.ctaLink', data.ctaLink);
        html += '</div>';

        return html;
    }

    // ── Gallery section with bulk upload ──
    function renderGallerySection(gallery, basePath) {
        let html = '<div class="field-section"><div class="field-section-title">Galéria (' + gallery.length + ' kép)</div>';
        html += '<div class="gallery-grid" data-array-path="' + basePath + '">';
        gallery.forEach((img, i) => {
            const src = img.src || '';
            const previewSrc = src ? (src.startsWith('http') ? src : '/' + src) : '';
            html += `<div class="gallery-card" draggable="true" data-index="${i}" data-src-path="${basePath}.${i}.src">
                <span class="gallery-card-index">${i + 1}</span>
                <div class="gallery-img-wrap">
                    ${previewSrc
                        ? `<img src="${previewSrc}" alt="${esc(img.alt || '')}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="gallery-placeholder" style="display:none">Nincs kép</div>`
                        : `<div class="gallery-placeholder">Nincs kép</div>`}
                </div>
                <div class="gallery-card-actions">
                    ${previewSrc ? `<button class="btn-icon" data-edit-src="${esc(previewSrc)}" data-edit-target="${basePath}.${i}.src" title="Szerkesztés">&#9998;</button>` : ''}
                    <button class="btn-icon" data-move-up="${basePath}" data-index="${i}" title="Fel">&#8593;</button>
                    <button class="btn-icon danger" data-remove-array="${basePath}" data-index="${i}" title="Törlés">&#10005;</button>
                </div>
                <div class="card-drop-label">Ejtse ide a képet</div>
                <div class="gallery-card-body">
                    <input class="field-input" type="text" data-path="${basePath}.${i}.src" value="${esc(src)}" placeholder="Kép elérési út">
                    <input class="field-input" type="text" data-path="${basePath}.${i}.alt" value="${esc(img.alt || '')}" placeholder="Alt szöveg">
                    ${img.title !== undefined ? `<input class="field-input" type="text" data-path="${basePath}.${i}.title" value="${esc(img.title || '')}" placeholder="Cím">` : ''}
                    ${img.subtitle !== undefined ? `<input class="field-input" type="text" data-path="${basePath}.${i}.subtitle" value="${esc(img.subtitle || '')}" placeholder="Alcím">` : ''}
                </div>
            </div>`;
        });
        html += '</div>';

        // Bulk upload drop zone
        html += `<div class="bulk-upload-zone" data-bulk-upload="${basePath}">
            <div class="bulk-upload-icon">&#128247;</div>
            <div class="bulk-upload-text">Húzzon ide képeket vagy kattintson a tallózáshoz</div>
            <div class="bulk-upload-hint">Egyszerre több képet is feltölthet</div>
            <input type="file" class="bulk-upload-input" accept="image/*" multiple>
        </div>`;

        html += `<button class="btn-add" data-add-array="${basePath}" data-template="galleryItem" style="margin-top:12px">+ Kép hozzáadása (üres)</button>`;
        html += '</div>';
        return html;
    }

    // ── Render remaining object fields generically ──
    function renderObjectFields(data, basePath, skip) {
        let html = '';
        for (const key of Object.keys(data)) {
            if (skip && skip.includes(key)) continue;
            const val = data[key];
            const path = basePath + '.' + key;

            if (val === null || val === undefined) continue;

            if (typeof val === 'number') {
                html += '<div class="field-section">' + numberField(key, path, val) + '</div>';
            } else if (typeof val === 'string') {
                if (key.toLowerCase().includes('image') || key.toLowerCase().includes('img') || key.toLowerCase().includes('src')) {
                    html += '<div class="field-section">' + imageField(key, path, val) + '</div>';
                } else if (val.length > 100) {
                    html += '<div class="field-section">' + textareaField(key, path, val, true) + '</div>';
                } else {
                    html += '<div class="field-section">' + textField(key, path, val) + '</div>';
                }
            } else if (Array.isArray(val)) {
                html += '<div class="field-section"><div class="field-section-title">' + key + '</div>';
                if (val.length > 0 && typeof val[0] === 'string') {
                    const isImageArray = key.toLowerCase().includes('image') || key.toLowerCase().includes('img');
                    html += '<div class="array-list" data-array-path="' + path + '">';
                    val.forEach((item, i) => {
                        html += `<div class="array-item" draggable="false" data-index="${i}">
                            <div class="drag-handle" title="Húzza az áthelyezéshez">&#8942;&#8942;</div>
                            <div class="array-item-header">
                                <span class="array-item-number">#${i + 1}</span>
                                <div class="array-item-actions">
                                    <button class="btn-icon danger" data-remove-array="${path}" data-index="${i}">&#10005;</button>
                                </div>
                            </div>
                            ${isImageArray ? imageField('Kép', path + '.' + i, item) : `<textarea class="field-textarea" data-path="${path}.${i}">${esc(item)}</textarea>`}
                        </div>`;
                    });
                    html += '</div>';
                    html += `<button class="btn-add" data-add-array="${path}" data-template="string">+ Hozzáadás</button>`;
                } else if (val.length > 0 && typeof val[0] === 'object') {
                    if (val[0].src !== undefined) {
                        html += renderGallerySection(val, path).replace(/^<div class="field-section">.*?<\/div>/, '').replace(/<\/div>$/, '');
                    } else {
                        html += '<div class="array-list" data-array-path="' + path + '">';
                        val.forEach((item, i) => {
                            html += `<div class="array-item" draggable="false" data-index="${i}">
                                <div class="drag-handle" title="Húzza az áthelyezéshez">&#8942;&#8942;</div>
                                <div class="array-item-header">
                                    <span class="array-item-number">#${i + 1}</span>
                                    <div class="array-item-actions">
                                        <button class="btn-icon danger" data-remove-array="${path}" data-index="${i}">&#10005;</button>
                                    </div>
                                </div>`;
                            for (const k of Object.keys(item)) {
                                if (typeof item[k] === 'string') {
                                    html += textField(k, path + '.' + i + '.' + k, item[k]);
                                }
                            }
                            html += '</div>';
                        });
                        html += '</div>';
                    }
                }
                html += '</div>';
            } else if (typeof val === 'object') {
                html += '<div class="field-section"><div class="field-section-title">' + key + '</div>';
                for (const k of Object.keys(val)) {
                    const v = val[k];
                    const p = path + '.' + k;
                    if (typeof v === 'string') {
                        if (k.toLowerCase().includes('src') || k.toLowerCase().includes('image')) {
                            html += imageField(k, p, v);
                        } else {
                            html += textField(k, p, v);
                        }
                    } else if (Array.isArray(v)) {
                        html += renderObjectFields({ [k]: v }, path, []);
                    }
                }
                html += '</div>';
            }
        }
        return html;
    }

    // ── Bind field change events ──
    function bindFieldEvents(container) {
        // Text inputs, textareas, selects, and number inputs
        container.querySelectorAll('[data-path]').forEach(el => {
            const handler = () => {
                let val = el.value;
                // Convert number inputs to actual numbers
                if (el.type === 'number') val = parseFloat(val) || 0;
                setByPath(contentData, el.dataset.path, val);
                setDirty(true);
                // Update the show-on-site button text for this field
                const row = el.closest('.field-group');
                if (row) {
                    const btn = row.querySelector('.btn-show-on-site');
                    if (btn) btn.dataset.showText = el.value;
                }
            };
            el.addEventListener('input', handler);
            // Selects also need change event
            if (el.tagName === 'SELECT') el.addEventListener('change', handler);
        });

        // Upload buttons
        container.querySelectorAll('[data-upload-for]').forEach(btn => {
            btn.addEventListener('click', () => {
                const targetPath = btn.dataset.uploadFor;
                openUploadModal(url => {
                    setByPath(contentData, targetPath, url);
                    setDirty(true);
                    renderEditor(currentPage);
                });
            });
        });

        // Remove array item (with confirm)
        container.querySelectorAll('[data-remove-array]').forEach(btn => {
            btn.addEventListener('mousedown', e => e.stopPropagation());
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                e.preventDefault();
                const confirmed = await confirmAction('Biztosan törli?', 'Ez a művelet nem vonható vissza.');
                if (!confirmed) return;
                const arrPath = btn.dataset.removeArray;
                const index = parseInt(btn.dataset.index);
                const arr = getByPath(contentData, arrPath);
                if (arr && Array.isArray(arr)) {
                    arr.splice(index, 1);
                    setDirty(true);
                    renderEditor(currentPage);
                }
            });
        });

        // Move up
        container.querySelectorAll('[data-move-up]').forEach(btn => {
            btn.addEventListener('mousedown', e => e.stopPropagation());
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const arrPath = btn.dataset.moveUp;
                const index = parseInt(btn.dataset.index);
                const arr = getByPath(contentData, arrPath);
                if (arr && index > 0) {
                    [arr[index - 1], arr[index]] = [arr[index], arr[index - 1]];
                    setDirty(true);
                    renderEditor(currentPage);
                }
            });
        });

        // Move down
        container.querySelectorAll('[data-move-down]').forEach(btn => {
            btn.addEventListener('click', () => {
                const arrPath = btn.dataset.moveDown;
                const index = parseInt(btn.dataset.index);
                const arr = getByPath(contentData, arrPath);
                if (arr && index < arr.length - 1) {
                    [arr[index], arr[index + 1]] = [arr[index + 1], arr[index]];
                    setDirty(true);
                    renderEditor(currentPage);
                }
            });
        });

        // Add array item
        container.querySelectorAll('[data-add-array]').forEach(btn => {
            btn.addEventListener('click', () => {
                const arrPath = btn.dataset.addArray;
                const template = btn.dataset.template;
                const arr = getByPath(contentData, arrPath);
                if (!arr) return;

                let newItem;
                switch (template) {
                    case 'string':
                        newItem = '';
                        break;
                    case 'galleryItem':
                        newItem = { src: '', alt: '' };
                        if (arr.length > 0 && arr[0].title !== undefined) {
                            newItem.title = '';
                            newItem.subtitle = '';
                        }
                        break;
                    case 'package':
                        newItem = { name: 'Új csomag', desc: '', items: [] };
                        break;
                    case 'packageItem':
                        newItem = { title: '', desc: '' };
                        break;
                    default:
                        newItem = '';
                }

                arr.push(newItem);
                setDirty(true);
                renderEditor(currentPage);
            });
        });
    }

    // ══════════════════════════════════════
    // ── SHOW ON SITE (highlight text) ──
    // ══════════════════════════════════════

    function initShowOnSite(container) {
        container.querySelectorAll('.btn-show-on-site').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const text = btn.dataset.showText || '';
                if (!text.trim()) {
                    toast('Nincs szöveg a megjelenítéshez', 'info');
                    return;
                }
                showOnSite(text);
            });
        });
    }

    let previewWindow = null;

    function showOnSite(rawText) {
        const url = getPageUrl(currentPage);
        // Strip HTML tags for search
        const searchText = rawText.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '').trim();
        if (!searchText) {
            toast('Nincs szöveg a megjelenítéshez', 'info');
            return;
        }

        // Open or reuse preview window
        previewWindow = window.open(url, 'silverframe-preview');
        if (!previewWindow) {
            toast('A felugró ablak blokkolva van. Engedélyezze a böngészőben!', 'error');
            return;
        }

        // Wait for page to load then highlight
        let attempts = 0;
        const maxAttempts = 50; // 10 seconds max
        const checker = setInterval(() => {
            attempts++;
            if (attempts > maxAttempts) {
                clearInterval(checker);
                return;
            }
            try {
                if (previewWindow.document.readyState === 'complete') {
                    clearInterval(checker);
                    // Small delay for rendering
                    setTimeout(() => highlightTextInWindow(previewWindow, searchText), 300);
                }
            } catch (e) {
                clearInterval(checker);
                toast('Nem sikerült elérni az oldalt', 'error');
            }
        }, 200);
    }

    function highlightTextInWindow(win, searchText) {
        try {
            // Remove any previous highlights
            win.document.querySelectorAll('.admin-highlight').forEach(el => {
                const parent = el.parentNode;
                parent.replaceChild(win.document.createTextNode(el.textContent), el);
                parent.normalize();
            });

            // Inject highlight style if not present
            if (!win.document.getElementById('admin-highlight-style')) {
                const style = win.document.createElement('style');
                style.id = 'admin-highlight-style';
                style.textContent = `
                    .admin-highlight {
                        background: #ffeb3b !important;
                        color: #000 !important;
                        padding: 2px 6px;
                        border-radius: 4px;
                        outline: 3px solid #ffeb3b;
                        animation: adminHighlightPulse 2s ease-in-out 3;
                    }
                    @keyframes adminHighlightPulse {
                        0%, 100% { outline-color: #ffeb3b; box-shadow: 0 0 0 0 rgba(255,235,59,0.4); }
                        50% { outline-color: #ff9800; box-shadow: 0 0 20px 4px rgba(255,152,0,0.3); }
                    }
                `;
                win.document.head.appendChild(style);
            }

            // Search for text using TreeWalker
            const body = win.document.body;
            const walker = win.document.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
                acceptNode: function (node) {
                    // Skip script/style
                    if (node.parentElement && (node.parentElement.tagName === 'SCRIPT' || node.parentElement.tagName === 'STYLE')) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    return NodeFilter.FILTER_ACCEPT;
                }
            });

            // Try exact match first, then partial
            let found = false;
            const searchLower = searchText.toLowerCase();

            // First pass: try to find the full text
            while (walker.nextNode()) {
                const node = walker.currentNode;
                const text = node.textContent;
                const idx = text.toLowerCase().indexOf(searchLower);
                if (idx !== -1) {
                    const range = win.document.createRange();
                    range.setStart(node, idx);
                    range.setEnd(node, idx + searchText.length);
                    const span = win.document.createElement('span');
                    span.className = 'admin-highlight';
                    range.surroundContents(span);
                    span.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    found = true;
                    break;
                }
            }

            // If not found, try first 30 chars
            if (!found && searchText.length > 30) {
                const shortSearch = searchText.substring(0, 30).toLowerCase();
                const walker2 = win.document.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
                    acceptNode: function (node) {
                        if (node.parentElement && (node.parentElement.tagName === 'SCRIPT' || node.parentElement.tagName === 'STYLE')) {
                            return NodeFilter.FILTER_REJECT;
                        }
                        return NodeFilter.FILTER_ACCEPT;
                    }
                });
                while (walker2.nextNode()) {
                    const node = walker2.currentNode;
                    const text = node.textContent;
                    const idx = text.toLowerCase().indexOf(shortSearch);
                    if (idx !== -1) {
                        const range = win.document.createRange();
                        const endIdx = Math.min(idx + searchText.length, text.length);
                        range.setStart(node, idx);
                        range.setEnd(node, endIdx);
                        const span = win.document.createElement('span');
                        span.className = 'admin-highlight';
                        range.surroundContents(span);
                        span.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        found = true;
                        break;
                    }
                }
            }

            if (!found) {
                toast('Szöveg nem található az oldalon (lehet, hogy még nincs mentve)', 'info');
            }
        } catch (e) {
            toast('Hiba a kiemelés során: ' + e.message, 'error');
        }
    }

    // ══════════════════════════════════════
    // ── DRAG & DROP REORDER ──
    // ══════════════════════════════════════

    function initDragReorder(container) {
        // Array lists (vertical drag via handle)
        container.querySelectorAll('.array-list[data-array-path]').forEach(list => {
            const arrayPath = list.dataset.arrayPath;
            list.querySelectorAll(':scope > .array-item').forEach(item => {
                const handle = item.querySelector('.drag-handle');
                if (!handle) return;

                handle.addEventListener('mousedown', () => { item.draggable = true; });
                item.addEventListener('dragend', () => { item.draggable = false; });

                item.addEventListener('dragstart', e => {
                    if (!item.draggable) { e.preventDefault(); return; }
                    if (e.dataTransfer.types.includes('Files')) return;
                    dragState = { arrayPath, fromIndex: parseInt(item.dataset.index) };
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', item.dataset.index);
                    requestAnimationFrame(() => item.classList.add('dragging'));
                });

                item.addEventListener('dragend', () => {
                    item.classList.remove('dragging');
                    list.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
                    dragState = null;
                });

                item.addEventListener('dragover', e => {
                    if (!dragState || dragState.arrayPath !== arrayPath) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    list.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
                    item.classList.add('drag-over');
                });

                item.addEventListener('dragleave', () => {
                    item.classList.remove('drag-over');
                });

                item.addEventListener('drop', e => {
                    e.preventDefault();
                    item.classList.remove('drag-over');
                    if (!dragState || dragState.arrayPath !== arrayPath) return;
                    const fromIndex = dragState.fromIndex;
                    const toIndex = parseInt(item.dataset.index);
                    if (fromIndex === toIndex) return;

                    const arr = getByPath(contentData, arrayPath);
                    if (!arr) return;
                    const moved = arr.splice(fromIndex, 1)[0];
                    arr.splice(toIndex, 0, moved);
                    setDirty(true);
                    dragState = null;
                    renderEditor(currentPage);
                });
            });
        });

        // Gallery grids (direct card drag)
        container.querySelectorAll('.gallery-grid[data-array-path]').forEach(grid => {
            const arrayPath = grid.dataset.arrayPath;
            grid.querySelectorAll(':scope > .gallery-card').forEach(card => {
                card.addEventListener('dragstart', e => {
                    if (e.target.closest('button, input, .btn-icon, .gallery-card-actions')) { e.preventDefault(); return; }
                    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) return;
                    dragState = { arrayPath, fromIndex: parseInt(card.dataset.index) };
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', card.dataset.index);
                    requestAnimationFrame(() => card.classList.add('dragging'));
                });

                card.addEventListener('dragend', () => {
                    card.classList.remove('dragging');
                    grid.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
                    dragState = null;
                });

                card.addEventListener('dragover', e => {
                    if (e.dataTransfer.types.includes('Files')) return;
                    if (!dragState || dragState.arrayPath !== arrayPath) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    grid.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
                    card.classList.add('drag-over');
                });

                card.addEventListener('dragleave', () => {
                    card.classList.remove('drag-over');
                });

                card.addEventListener('drop', e => {
                    if (e.dataTransfer.types.includes('Files')) return;
                    e.preventDefault();
                    card.classList.remove('drag-over');
                    if (!dragState || dragState.arrayPath !== arrayPath) return;
                    const fromIndex = dragState.fromIndex;
                    const toIndex = parseInt(card.dataset.index);
                    if (fromIndex === toIndex) return;

                    const arr = getByPath(contentData, arrayPath);
                    if (!arr) return;
                    const moved = arr.splice(fromIndex, 1)[0];
                    arr.splice(toIndex, 0, moved);
                    setDirty(true);
                    dragState = null;
                    renderEditor(currentPage);
                });
            });
        });
    }

    // ══════════════════════════════════════
    // ── FILE DROP ON IMAGE FIELDS ──
    // ══════════════════════════════════════

    function initFileDropOnImages(container) {
        container.querySelectorAll('[data-drop-upload]').forEach(zone => {
            zone.addEventListener('dragover', e => {
                if (!e.dataTransfer.types.includes('Files')) return;
                e.preventDefault();
                e.stopPropagation();
                zone.classList.add('drop-active');
            });

            zone.addEventListener('dragleave', e => {
                if (zone.contains(e.relatedTarget)) return;
                zone.classList.remove('drop-active');
            });

            zone.addEventListener('drop', async e => {
                e.preventDefault();
                e.stopPropagation();
                zone.classList.remove('drop-active');
                const files = e.dataTransfer.files;
                if (!files.length || !files[0].type.startsWith('image/')) return;
                const targetPath = zone.dataset.uploadTarget;
                await uploadAndSet(files[0], targetPath);
            });
        });
    }

    // ══════════════════════════════════════
    // ── FILE DROP ON GALLERY CARDS ──
    // ══════════════════════════════════════

    function initFileDropOnGalleryCards(container) {
        container.querySelectorAll('.gallery-card[data-src-path]').forEach(card => {
            card.addEventListener('dragover', e => {
                if (!e.dataTransfer.types.includes('Files')) return;
                e.preventDefault();
                e.stopPropagation();
                card.classList.add('file-drop-active');
            });

            card.addEventListener('dragleave', e => {
                if (card.contains(e.relatedTarget)) return;
                card.classList.remove('file-drop-active');
            });

            card.addEventListener('drop', async e => {
                if (!e.dataTransfer.types.includes('Files')) return;
                e.preventDefault();
                e.stopPropagation();
                card.classList.remove('file-drop-active');
                const files = e.dataTransfer.files;
                if (!files.length || !files[0].type.startsWith('image/')) return;
                const targetPath = card.dataset.srcPath;
                await uploadAndSet(files[0], targetPath);
            });
        });
    }

    // ══════════════════════════════════════
    // ── BULK UPLOAD FOR GALLERIES ──
    // ══════════════════════════════════════

    function initBulkUploadZones(container) {
        container.querySelectorAll('.bulk-upload-zone[data-bulk-upload]').forEach(zone => {
            const arrayPath = zone.dataset.bulkUpload;
            const input = zone.querySelector('.bulk-upload-input');

            // Click to open file picker
            zone.addEventListener('click', (e) => {
                if (e.target === input) return;
                input.click();
            });

            // File input change
            input.addEventListener('change', () => {
                if (input.files.length > 0) {
                    bulkUploadFiles(Array.from(input.files), arrayPath);
                }
                input.value = '';
            });

            // Drag over
            zone.addEventListener('dragover', e => {
                if (!e.dataTransfer.types.includes('Files')) return;
                e.preventDefault();
                e.stopPropagation();
                zone.classList.add('bulk-drag-active');
            });

            zone.addEventListener('dragleave', e => {
                if (zone.contains(e.relatedTarget)) return;
                zone.classList.remove('bulk-drag-active');
            });

            // Drop multiple files
            zone.addEventListener('drop', async e => {
                e.preventDefault();
                e.stopPropagation();
                zone.classList.remove('bulk-drag-active');
                const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
                if (files.length === 0) return;
                await bulkUploadFiles(files, arrayPath);
            });
        });
    }

    async function bulkUploadFiles(files, arrayPath) {
        const arr = getByPath(contentData, arrayPath);
        if (!arr) return;

        // Determine if gallery items have title/subtitle
        const hasTitle = arr.length > 0 && arr[0].title !== undefined;

        toast(`${files.length} kép feltöltése...`, 'info');

        const formData = new FormData();
        for (const f of files) {
            formData.append('images', f, f.name);
        }

        try {
            const res = await fetch('/api/upload', { method: 'POST', body: formData });
            const data = await res.json();
            if (data.success && data.files) {
                let added = 0;
                let reused = 0;
                for (const uploaded of data.files) {
                    const newItem = { src: uploaded.url, alt: '' };
                    if (hasTitle) {
                        newItem.title = '';
                        newItem.subtitle = '';
                    }
                    arr.push(newItem);
                    added++;
                    if (uploaded.reused) reused++;
                }
                setDirty(true);
                renderEditor(currentPage);
                const msg = reused > 0
                    ? `${added} kép hozzáadva (${reused} már létezett, újrahasználva)!`
                    : `${added} kép sikeresen feltöltve!`;
                toast(msg, 'success');
            }
        } catch (err) {
            toast('Feltöltési hiba: ' + err.message, 'error');
        }
    }

    // ── Shared upload helper (single file) ──
    async function uploadAndSet(file, targetPath) {
        const formData = new FormData();
        formData.append('images', file, file.name);
        try {
            toast('Feltöltés...', 'info');
            const res = await fetch('/api/upload', { method: 'POST', body: formData });
            const data = await res.json();
            if (data.success && data.files && data.files.length > 0) {
                setByPath(contentData, targetPath, data.files[0].url);
                setDirty(true);
                renderEditor(currentPage);
                toast(data.files[0].reused ? 'Meglévő kép újrahasználva!' : 'Kép feltöltve!', 'success');
            }
        } catch (err) {
            toast('Feltöltési hiba: ' + err.message, 'error');
        }
    }

    // ══════════════════════════════════════
    // ── IMAGE LIGHTBOX ──
    // ══════════════════════════════════════

    function initImageLightbox(container) {
        container.querySelectorAll('.image-preview, .gallery-img-wrap img').forEach(img => {
            img.addEventListener('click', e => {
                if (!img.src || img.style.display === 'none') return;
                e.stopPropagation();
                const overlay = document.createElement('div');
                overlay.className = 'image-lightbox';
                const bigImg = document.createElement('img');
                bigImg.src = img.src;
                overlay.appendChild(bigImg);
                overlay.addEventListener('click', () => overlay.remove());
                document.addEventListener('keydown', function handler(ev) {
                    if (ev.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', handler); }
                });
                document.body.appendChild(overlay);
            });
        });
    }

    // ══════════════════════════════════════
    // ── COLLAPSIBLE SECTIONS ──
    // ══════════════════════════════════════

    function initCollapsible(container) {
        container.querySelectorAll('.field-section-title').forEach(title => {
            title.addEventListener('click', e => {
                if (e.target.closest('button')) return;
                title.parentElement.classList.toggle('collapsed');
            });
        });
    }

    // ══════════════════════════════════════
    // ── CONFIRM MODAL ──
    // ══════════════════════════════════════

    let confirmResolve = null;

    function bindConfirmModal() {
        const modal = $('#confirm-modal');
        const yesBtn = $('#confirm-yes');
        const noBtn = $('#confirm-no');
        const backdrop = modal.querySelector('.modal-backdrop');

        yesBtn.addEventListener('click', () => { modal.classList.add('hidden'); if (confirmResolve) confirmResolve(true); });
        noBtn.addEventListener('click', () => { modal.classList.add('hidden'); if (confirmResolve) confirmResolve(false); });
        backdrop.addEventListener('click', () => { modal.classList.add('hidden'); if (confirmResolve) confirmResolve(false); });
    }

    function confirmAction(title, message) {
        return new Promise(resolve => {
            confirmResolve = resolve;
            $('#confirm-title').textContent = title;
            $('#confirm-message').textContent = message;
            $('#confirm-modal').classList.remove('hidden');
        });
    }

    // ══════════════════════════════════════
    // ── UPLOAD MODAL ──
    // ══════════════════════════════════════

    function bindUploadModal() {
        const modal = $('#image-upload-modal');
        const zone = $('#upload-zone');
        const input = $('#upload-input');
        const preview = $('#upload-preview');
        const confirmBtn = $('#upload-confirm');
        const cancelBtn = $('#upload-cancel');
        const backdrop = modal.querySelector('.modal-backdrop');

        cancelBtn.addEventListener('click', closeUploadModal);
        backdrop.addEventListener('click', closeUploadModal);

        zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
        zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
        zone.addEventListener('drop', e => {
            e.preventDefault();
            zone.classList.remove('dragover');
            handleFiles(e.dataTransfer.files);
        });

        input.addEventListener('change', () => {
            handleFiles(input.files);
            input.value = '';
        });

        async function handleFiles(files) {
            if (!files.length) return;
            const formData = new FormData();
            for (const f of files) formData.append('images', f, f.name);

            try {
                const res = await fetch('/api/upload', { method: 'POST', body: formData });
                const data = await res.json();
                if (data.success && data.files) {
                    preview.innerHTML = '';
                    data.files.forEach((f, i) => {
                        const img = document.createElement('img');
                        img.src = '/' + f.url;
                        img.dataset.url = f.url;
                        if (i === 0) img.classList.add('selected');
                        img.addEventListener('click', () => {
                            preview.querySelectorAll('img').forEach(im => im.classList.remove('selected'));
                            img.classList.add('selected');
                        });
                        preview.appendChild(img);
                    });
                    confirmBtn.disabled = false;
                }
            } catch (e) {
                toast('Feltöltési hiba: ' + e.message, 'error');
            }
        }

        confirmBtn.addEventListener('click', () => {
            const selected = preview.querySelector('img.selected');
            if (selected && uploadCallback) {
                uploadCallback(selected.dataset.url);
            }
            closeUploadModal();
        });
    }

    function openUploadModal(callback) {
        uploadCallback = callback;
        $('#upload-preview').innerHTML = '';
        $('#upload-confirm').disabled = true;
        $('#image-upload-modal').classList.remove('hidden');
    }

    function closeUploadModal() {
        $('#image-upload-modal').classList.add('hidden');
        uploadCallback = null;
    }

    // ══════════════════════════════════════
    // ── IMAGE EDITOR (Crop & Resize) ──
    // ══════════════════════════════════════

    let editorState = {
        img: null,           // loaded Image element
        targetPath: null,    // content.json path to update
        mode: 'crop',        // 'crop' or 'resize'
        aspect: null,        // null=free, or number like 1, 4/3, 16/9
        lockRatio: true,     // for resize mode
        // Crop rectangle (in image coordinates)
        cropX: 0, cropY: 0, cropW: 0, cropH: 0,
        // Canvas display scale
        scale: 1,
        // Mouse state
        dragging: false,
        dragType: null,      // 'new', 'move', 'nw','ne','sw','se','n','s','e','w'
        dragStartX: 0, dragStartY: 0,
        dragStartCrop: null,
    };

    function initImageEditButtons(container) {
        container.querySelectorAll('[data-edit-src]').forEach(btn => {
            btn.addEventListener('mousedown', e => e.stopPropagation());
            btn.addEventListener('click', e => {
                e.stopPropagation();
                e.preventDefault();
                const src = btn.dataset.editSrc;
                const target = btn.dataset.editTarget;
                openImageEditor(src, target);
            });
        });
    }

    function openImageEditor(src, targetPath) {
        const modal = $('#image-editor-modal');
        const canvas = $('#editor-canvas');

        editorState.targetPath = targetPath;
        editorState.mode = 'crop';
        editorState.aspect = null;
        editorState.lockRatio = true;

        // Reset mode buttons
        $$('.editor-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === 'crop'));
        $$('.aspect-btn').forEach(b => b.classList.toggle('active', b.dataset.aspect === 'free'));
        $('#crop-aspect-group').classList.remove('hidden');
        $('#resize-controls').classList.add('hidden');
        $('#editor-preview-row').classList.add('hidden');

        // Load image
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            editorState.img = img;
            // Set crop to full image
            editorState.cropX = 0;
            editorState.cropY = 0;
            editorState.cropW = img.naturalWidth;
            editorState.cropH = img.naturalHeight;

            // Fit canvas to container
            const wrap = $('#editor-canvas-wrap');
            const maxW = wrap.clientWidth - 4;
            const maxH = Math.min(window.innerHeight * 0.55, 600);
            editorState.scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
            canvas.width = Math.round(img.naturalWidth * editorState.scale);
            canvas.height = Math.round(img.naturalHeight * editorState.scale);

            // Resize fields
            $('#resize-w').value = img.naturalWidth;
            $('#resize-h').value = img.naturalHeight;

            // Info
            $('#editor-original-size').textContent = `Eredeti: ${img.naturalWidth} × ${img.naturalHeight}`;
            updateCropInfo();

            drawEditor();
            modal.classList.remove('hidden');
        };
        img.onerror = () => {
            toast('Nem sikerült betölteni a képet (külső URL?)', 'error');
        };
        img.src = src;
    }

    function drawEditor() {
        const { img, scale, cropX, cropY, cropW, cropH, mode } = editorState;
        if (!img) return;
        const canvas = $('#editor-canvas');
        const ctx = canvas.getContext('2d');

        // Clear and draw image
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        if (mode === 'crop') {
            // Dark overlay outside crop
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            const sx = cropX * scale, sy = cropY * scale;
            const sw = cropW * scale, sh = cropH * scale;

            // Top
            ctx.fillRect(0, 0, canvas.width, sy);
            // Bottom
            ctx.fillRect(0, sy + sh, canvas.width, canvas.height - sy - sh);
            // Left
            ctx.fillRect(0, sy, sx, sh);
            // Right
            ctx.fillRect(sx + sw, sy, canvas.width - sx - sw, sh);

            // Crop border
            ctx.strokeStyle = '#c9a96e';
            ctx.lineWidth = 2;
            ctx.strokeRect(sx, sy, sw, sh);

            // Rule of thirds lines
            ctx.strokeStyle = 'rgba(201,169,110,0.3)';
            ctx.lineWidth = 1;
            for (let i = 1; i <= 2; i++) {
                ctx.beginPath();
                ctx.moveTo(sx + (sw * i / 3), sy);
                ctx.lineTo(sx + (sw * i / 3), sy + sh);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(sx, sy + (sh * i / 3));
                ctx.lineTo(sx + sw, sy + (sh * i / 3));
                ctx.stroke();
            }

            // Corner handles
            ctx.fillStyle = '#c9a96e';
            const hs = 8;
            const corners = [
                [sx, sy], [sx + sw, sy],
                [sx, sy + sh], [sx + sw, sy + sh]
            ];
            for (const [cx, cy] of corners) {
                ctx.fillRect(cx - hs / 2, cy - hs / 2, hs, hs);
            }
            // Edge handles
            const edges = [
                [sx + sw / 2, sy], [sx + sw / 2, sy + sh],
                [sx, sy + sh / 2], [sx + sw, sy + sh / 2]
            ];
            for (const [cx, cy] of edges) {
                ctx.fillRect(cx - hs / 2, cy - hs / 2, hs, hs);
            }
        }
    }

    function updateCropInfo() {
        const { cropW, cropH } = editorState;
        $('#editor-crop-size').textContent = `Kijelölés: ${Math.round(cropW)} × ${Math.round(cropH)}`;
    }

    function updatePreview() {
        const { img, mode, cropX, cropY, cropW, cropH } = editorState;
        if (!img || mode !== 'crop') return;
        const previewRow = $('#editor-preview-row');
        const pc = $('#editor-preview-canvas');
        const pctx = pc.getContext('2d');

        if (cropW < 2 || cropH < 2) {
            previewRow.classList.add('hidden');
            return;
        }

        previewRow.classList.remove('hidden');
        const maxPW = 200, maxPH = 120;
        const ps = Math.min(maxPW / cropW, maxPH / cropH, 1);
        pc.width = Math.round(cropW * ps);
        pc.height = Math.round(cropH * ps);
        pctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, pc.width, pc.height);
    }

    function bindImageEditor() {
        const modal = $('#image-editor-modal');
        const canvas = $('#editor-canvas');

        // Close
        $('#editor-cancel').addEventListener('click', () => modal.classList.add('hidden'));
        modal.querySelector('.modal-backdrop').addEventListener('click', () => modal.classList.add('hidden'));

        // Reset
        $('#editor-reset').addEventListener('click', () => {
            if (!editorState.img) return;
            editorState.cropX = 0;
            editorState.cropY = 0;
            editorState.cropW = editorState.img.naturalWidth;
            editorState.cropH = editorState.img.naturalHeight;
            $('#resize-w').value = editorState.img.naturalWidth;
            $('#resize-h').value = editorState.img.naturalHeight;
            updateCropInfo();
            drawEditor();
            updatePreview();
        });

        // Mode buttons
        $$('.editor-mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                $$('.editor-mode-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                editorState.mode = btn.dataset.mode;
                $('#crop-aspect-group').classList.toggle('hidden', btn.dataset.mode !== 'crop');
                $('#resize-controls').classList.toggle('hidden', btn.dataset.mode !== 'resize');
                $('#editor-preview-row').classList.toggle('hidden', btn.dataset.mode !== 'crop');
                drawEditor();
            });
        });

        // Aspect ratio buttons
        $$('.aspect-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                $$('.aspect-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const val = btn.dataset.aspect;
                if (val === 'free') {
                    editorState.aspect = null;
                } else {
                    const [w, h] = val.split(':').map(Number);
                    editorState.aspect = w / h;
                    // Adjust current crop to match aspect
                    constrainCropToAspect();
                    drawEditor();
                    updateCropInfo();
                    updatePreview();
                }
            });
        });

        // Resize inputs
        const rw = $('#resize-w');
        const rh = $('#resize-h');
        const lockBtn = $('#resize-lock');

        lockBtn.addEventListener('click', () => {
            editorState.lockRatio = !editorState.lockRatio;
            lockBtn.style.color = editorState.lockRatio ? 'var(--accent)' : 'var(--text-dim)';
        });

        rw.addEventListener('input', () => {
            if (!editorState.img) return;
            const w = parseInt(rw.value) || 1;
            if (editorState.lockRatio) {
                const ratio = editorState.img.naturalHeight / editorState.img.naturalWidth;
                rh.value = Math.round(w * ratio);
            }
        });

        rh.addEventListener('input', () => {
            if (!editorState.img) return;
            const h = parseInt(rh.value) || 1;
            if (editorState.lockRatio) {
                const ratio = editorState.img.naturalWidth / editorState.img.naturalHeight;
                rw.value = Math.round(h * ratio);
            }
        });

        // ── Crop mouse handlers ──
        canvas.addEventListener('mousedown', e => {
            if (editorState.mode !== 'crop') return;
            const rect = canvas.getBoundingClientRect();
            const mx = (e.clientX - rect.left);
            const my = (e.clientY - rect.top);
            const s = editorState.scale;

            // Check if near a handle
            const handle = getHandle(mx, my);
            if (handle) {
                editorState.dragging = true;
                editorState.dragType = handle;
            } else if (isInsideCrop(mx, my)) {
                editorState.dragging = true;
                editorState.dragType = 'move';
            } else {
                editorState.dragging = true;
                editorState.dragType = 'new';
                editorState.cropX = mx / s;
                editorState.cropY = my / s;
                editorState.cropW = 0;
                editorState.cropH = 0;
            }
            editorState.dragStartX = mx;
            editorState.dragStartY = my;
            editorState.dragStartCrop = {
                x: editorState.cropX, y: editorState.cropY,
                w: editorState.cropW, h: editorState.cropH
            };
        });

        canvas.addEventListener('mousemove', e => {
            if (editorState.mode !== 'crop') return;
            const rect = canvas.getBoundingClientRect();
            const mx = (e.clientX - rect.left);
            const my = (e.clientY - rect.top);

            // Update cursor
            if (!editorState.dragging) {
                const handle = getHandle(mx, my);
                if (handle === 'nw' || handle === 'se') canvas.style.cursor = 'nwse-resize';
                else if (handle === 'ne' || handle === 'sw') canvas.style.cursor = 'nesw-resize';
                else if (handle === 'n' || handle === 's') canvas.style.cursor = 'ns-resize';
                else if (handle === 'e' || handle === 'w') canvas.style.cursor = 'ew-resize';
                else if (isInsideCrop(mx, my)) canvas.style.cursor = 'move';
                else canvas.style.cursor = 'crosshair';
                return;
            }

            const s = editorState.scale;
            const dx = (mx - editorState.dragStartX) / s;
            const dy = (my - editorState.dragStartY) / s;
            const sc = editorState.dragStartCrop;
            const imgW = editorState.img.naturalWidth;
            const imgH = editorState.img.naturalHeight;

            if (editorState.dragType === 'move') {
                editorState.cropX = clamp(sc.x + dx, 0, imgW - sc.w);
                editorState.cropY = clamp(sc.y + dy, 0, imgH - sc.h);
            } else if (editorState.dragType === 'new') {
                let newW = dx;
                let newH = dy;
                if (editorState.aspect) {
                    newH = Math.abs(newW) / editorState.aspect * Math.sign(newH || 1);
                }
                editorState.cropW = Math.abs(newW);
                editorState.cropH = Math.abs(newH);
                if (newW < 0) editorState.cropX = sc.x + newW;
                else editorState.cropX = sc.x;
                if (newH < 0) editorState.cropY = sc.y + (editorState.aspect ? -Math.abs(newH) : newH);
                else editorState.cropY = editorState.aspect ? sc.y : sc.y;
                // Clamp to image bounds
                editorState.cropX = clamp(editorState.cropX, 0, imgW);
                editorState.cropY = clamp(editorState.cropY, 0, imgH);
                editorState.cropW = Math.min(editorState.cropW, imgW - editorState.cropX);
                editorState.cropH = Math.min(editorState.cropH, imgH - editorState.cropY);
            } else {
                // Handle resize
                resizeCropByHandle(editorState.dragType, dx, dy, sc, imgW, imgH);
            }

            updateCropInfo();
            drawEditor();
        });

        canvas.addEventListener('mouseup', () => {
            if (editorState.dragging) {
                editorState.dragging = false;
                // Normalize negative sizes
                if (editorState.cropW < 0) {
                    editorState.cropX += editorState.cropW;
                    editorState.cropW = -editorState.cropW;
                }
                if (editorState.cropH < 0) {
                    editorState.cropY += editorState.cropH;
                    editorState.cropH = -editorState.cropH;
                }
                updatePreview();
            }
        });

        canvas.addEventListener('mouseleave', () => {
            if (editorState.dragging) {
                editorState.dragging = false;
                updatePreview();
            }
        });

        // ── Apply / Save ──
        $('#editor-apply').addEventListener('click', async () => {
            if (!editorState.img) return;
            const { img, mode, cropX, cropY, cropW, cropH } = editorState;

            let outW, outH, sx, sy, sw, sh;

            if (mode === 'crop') {
                sx = Math.round(cropX);
                sy = Math.round(cropY);
                sw = Math.round(cropW);
                sh = Math.round(cropH);
                outW = sw;
                outH = sh;
                if (outW < 1 || outH < 1) {
                    toast('A kijelölés túl kicsi', 'error');
                    return;
                }
            } else {
                // Resize: use full image, scale to target
                sx = 0; sy = 0;
                sw = img.naturalWidth;
                sh = img.naturalHeight;
                outW = parseInt($('#resize-w').value) || img.naturalWidth;
                outH = parseInt($('#resize-h').value) || img.naturalHeight;
            }

            // Render to offscreen canvas
            const offscreen = document.createElement('canvas');
            offscreen.width = outW;
            offscreen.height = outH;
            const octx = offscreen.getContext('2d');
            octx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);

            // Convert to blob
            offscreen.toBlob(async (blob) => {
                if (!blob) {
                    toast('Hiba a kép feldolgozásakor', 'error');
                    return;
                }
                const formData = new FormData();
                formData.append('images', blob, 'edited-' + Date.now() + '.jpg');

                try {
                    toast('Szerkesztett kép feltöltése...', 'info');
                    const res = await fetch('/api/upload', { method: 'POST', body: formData });
                    const data = await res.json();
                    if (data.success && data.files && data.files.length > 0) {
                        setByPath(contentData, editorState.targetPath, data.files[0].url);
                        setDirty(true);
                        modal.classList.add('hidden');
                        renderEditor(currentPage);
                        toast(`Kép elmentve (${outW}×${outH})!`, 'success');
                    }
                } catch (err) {
                    toast('Feltöltési hiba: ' + err.message, 'error');
                }
            }, 'image/jpeg', 0.92);
        });
    }

    function getHandle(mx, my) {
        const s = editorState.scale;
        const { cropX, cropY, cropW, cropH } = editorState;
        const sx = cropX * s, sy = cropY * s;
        const sw = cropW * s, sh = cropH * s;
        const r = 10; // hit radius

        const pts = {
            'nw': [sx, sy], 'n': [sx + sw / 2, sy], 'ne': [sx + sw, sy],
            'w': [sx, sy + sh / 2], 'e': [sx + sw, sy + sh / 2],
            'sw': [sx, sy + sh], 's': [sx + sw / 2, sy + sh], 'se': [sx + sw, sy + sh]
        };

        for (const [name, [px, py]] of Object.entries(pts)) {
            if (Math.abs(mx - px) < r && Math.abs(my - py) < r) return name;
        }
        return null;
    }

    function isInsideCrop(mx, my) {
        const s = editorState.scale;
        const { cropX, cropY, cropW, cropH } = editorState;
        const sx = cropX * s, sy = cropY * s;
        return mx >= sx && mx <= sx + cropW * s && my >= sy && my <= sy + cropH * s;
    }

    function resizeCropByHandle(handle, dx, dy, sc, imgW, imgH) {
        let { x, y, w, h } = { x: sc.x, y: sc.y, w: sc.w, h: sc.h };

        if (handle.includes('e')) { w = sc.w + dx; }
        if (handle.includes('w')) { x = sc.x + dx; w = sc.w - dx; }
        if (handle.includes('s')) { h = sc.h + dy; }
        if (handle.includes('n')) { y = sc.y + dy; h = sc.h - dy; }

        // Enforce aspect ratio
        if (editorState.aspect) {
            if (handle === 'n' || handle === 's') {
                w = h * editorState.aspect;
            } else {
                h = w / editorState.aspect;
            }
            if (handle.includes('n')) y = sc.y + sc.h - h;
            if (handle.includes('w')) x = sc.x + sc.w - w;
        }

        // Minimum size
        if (w < 10) w = 10;
        if (h < 10) h = 10;

        // Clamp to image
        x = clamp(x, 0, imgW - 10);
        y = clamp(y, 0, imgH - 10);
        w = Math.min(w, imgW - x);
        h = Math.min(h, imgH - y);

        editorState.cropX = x;
        editorState.cropY = y;
        editorState.cropW = w;
        editorState.cropH = h;
    }

    function constrainCropToAspect() {
        const { img, aspect, cropX, cropY, cropW, cropH } = editorState;
        if (!aspect || !img) return;
        const imgW = img.naturalWidth;
        const imgH = img.naturalHeight;

        // Keep center, adjust width or height to match aspect
        const cx = cropX + cropW / 2;
        const cy = cropY + cropH / 2;
        let newW = cropW;
        let newH = cropW / aspect;
        if (newH > cropH) {
            newH = cropH;
            newW = cropH * aspect;
        }
        editorState.cropW = Math.min(newW, imgW);
        editorState.cropH = Math.min(newH, imgH);
        editorState.cropX = clamp(cx - editorState.cropW / 2, 0, imgW - editorState.cropW);
        editorState.cropY = clamp(cy - editorState.cropH / 2, 0, imgH - editorState.cropH);
    }

    function clamp(val, min, max) {
        return Math.max(min, Math.min(max, val));
    }

    // ══════════════════════════════════════
    // ── BATCH RENAME TOOL ──
    // ══════════════════════════════════════

    let renameFiles = []; // { file: File, preview: dataUrl } OR { serverUrl: string, name: string, preview: string }

    // Shared: populate a collection dropdown + text input pair
    async function populateCollectionDropdown(selectEl, textInputEl) {
        selectEl.innerHTML = '<option value="">+ Új gyűjtemény...</option>';
        textInputEl.style.display = 'block';
        try {
            const res = await fetch('/api/collections');
            const data = await res.json();
            if (data.collections && data.collections.length > 0) {
                for (const col of data.collections) {
                    const opt = document.createElement('option');
                    opt.value = col.name;
                    opt.textContent = `${col.name} (${col.files.length} kép)`;
                    selectEl.appendChild(opt);
                }
            }
        } catch (e) { /* ignore */ }
        // Bind toggle: show text input only when "new" is selected
        selectEl.onchange = () => {
            textInputEl.style.display = selectEl.value === '' ? 'block' : 'none';
        };
        selectEl.value = '';
        textInputEl.style.display = 'block';
    }

    // Get the collection name from a select+input pair
    function getCollectionName(selectEl, textInputEl) {
        if (selectEl.value) return selectEl.value;
        return textInputEl.value.trim();
    }

    function openRenameModal() {
        renameFiles = [];
        const modal = $('#rename-modal');
        modal.classList.remove('hidden');
        $('#rename-file-list').innerHTML = '';
        $('#rename-genre').value = '';
        $('#rename-start').value = '1';
        $('#rename-apply').disabled = true;
        $$('.rename-genre-btn').forEach(b => b.classList.remove('active'));
        updateRenamePreview();
        bindRenameModal();
        populateCollectionDropdown($('#rename-collection-select'), $('#rename-collection-name'));
    }

    let renameModalBound = false;

    function bindRenameModal() {
        if (renameModalBound) return;
        renameModalBound = true;

        const modal = $('#rename-modal');
        const dropZone = $('#rename-drop-zone');
        const fileInput = $('#rename-file-input');
        const genreInput = $('#rename-genre');
        const startInput = $('#rename-start');

        // Close
        $('#rename-cancel').addEventListener('click', () => modal.classList.add('hidden'));
        modal.querySelector('.modal-backdrop').addEventListener('click', () => modal.classList.add('hidden'));

        // File drop zone — click opens file picker
        dropZone.addEventListener('click', e => {
            if (e.target === fileInput) return;
            fileInput.click();
        });

        dropZone.addEventListener('dragover', e => {
            e.preventDefault();
            dropZone.classList.add('drag-active');
        });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-active'));

        // Drop handler — supports both files and folders
        dropZone.addEventListener('drop', async e => {
            e.preventDefault();
            dropZone.classList.remove('drag-active');
            const items = e.dataTransfer.items;
            if (items && items.length > 0 && items[0].webkitGetAsEntry) {
                // Use entry API to read folders recursively
                const allFiles = [];
                const entries = [];
                for (let i = 0; i < items.length; i++) {
                    const entry = items[i].webkitGetAsEntry();
                    if (entry) entries.push(entry);
                }
                await collectFilesFromEntries(entries, allFiles);
                addRenameFiles(allFiles.filter(f => f.type.startsWith('image/')));
            } else {
                // Fallback: plain file list
                addRenameFiles(Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/')));
            }
        });

        fileInput.addEventListener('change', () => {
            addRenameFiles(Array.from(fileInput.files));
            fileInput.value = '';
        });

        // Folder browse button
        const folderInput = $('#rename-folder-input');
        $('#rename-browse-folder').addEventListener('click', () => folderInput.click());
        folderInput.addEventListener('change', () => {
            const imgs = Array.from(folderInput.files).filter(f => f.type.startsWith('image/'));
            if (imgs.length > 0) {
                addRenameFiles(imgs);
                toast(`${imgs.length} kép betöltve a mappából`, 'success');
            } else {
                toast('Nem található kép a mappában', 'info');
            }
            folderInput.value = '';
        });

        // Collection picker
        const colPicker = $('#rename-collection-picker');
        $('#rename-from-collection').addEventListener('click', async () => {
            colPicker.classList.toggle('hidden');
            if (!colPicker.classList.contains('hidden')) {
                await loadRenameCollections();
            }
        });
        $('#rename-col-close').addEventListener('click', () => colPicker.classList.add('hidden'));
        $('#rename-col-select-all').addEventListener('click', () => {
            const imgs = colPicker.querySelectorAll('.rename-col-img');
            const allSelected = Array.from(imgs).every(i => i.classList.contains('selected'));
            imgs.forEach(i => i.classList.toggle('selected', !allSelected));
        });
        $('#rename-col-add').addEventListener('click', () => {
            const selected = colPicker.querySelectorAll('.rename-col-img.selected');
            if (selected.length === 0) { toast('Jelöljön ki képeket!', 'info'); return; }
            for (const el of selected) {
                const url = el.dataset.url;
                const name = el.dataset.name;
                const preview = el.querySelector('img').src;
                // Avoid duplicates
                if (renameFiles.some(rf => rf.serverUrl === url)) continue;
                renameFiles.push({ serverUrl: url, name, preview, file: null });
            }
            renderRenameFileList();
            updateRenamePreview();
            colPicker.classList.add('hidden');
            toast(`${selected.length} kép hozzáadva a gyűjteményből`, 'success');
        });

        // Genre quick buttons
        $('#rename-genre-buttons').addEventListener('click', e => {
            const btn = e.target.closest('.rename-genre-btn');
            if (!btn) return;
            $$('.rename-genre-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            genreInput.value = btn.dataset.genre;
            updateRenamePreview();
        });

        // Text input for genre
        genreInput.addEventListener('input', () => {
            // Deselect quick buttons if user types custom
            const val = genreInput.value.trim().toLowerCase();
            $$('.rename-genre-btn').forEach(b => {
                b.classList.toggle('active', b.dataset.genre === val);
            });
            updateRenamePreview();
        });

        // Start number
        startInput.addEventListener('input', () => updateRenamePreview());

        // Show/hide collection name input
        $('#rename-dest-collection').addEventListener('change', e => {
            $('#rename-collection-name').style.display = e.target.checked ? 'block' : 'none';
        });

        // Apply
        $('#rename-apply').addEventListener('click', executeRename);
    }

    // Load collections into the rename tool's inline picker
    async function loadRenameCollections() {
        const list = $('#rename-col-list');
        const imagesDiv = $('#rename-col-images');
        const actionsDiv = $('#rename-col-actions');
        list.innerHTML = '<div class="rename-col-loading">Betöltés...</div>';
        imagesDiv.classList.add('hidden');
        actionsDiv.classList.add('hidden');

        try {
            const res = await fetch('/api/collections');
            const data = await res.json();
            if (!data.collections || data.collections.length === 0) {
                list.innerHTML = '<div class="rename-col-empty">Még nincsenek gyűjtemények. Használja a "Mentés gyűjteménybe" opciót az átnevezésnél.</div>';
                return;
            }
            list.innerHTML = data.collections.map(col =>
                `<button class="rename-col-btn" data-col-name="${esc(col.name)}">${esc(col.name)}<span class="col-btn-count">(${col.files.length})</span></button>`
            ).join('');

            // Store data for image display
            list._colData = data.collections;

            list.querySelectorAll('.rename-col-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    list.querySelectorAll('.rename-col-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    const col = list._colData.find(c => c.name === btn.dataset.colName);
                    showRenameCollectionImages(col);
                });
            });
        } catch (e) {
            list.innerHTML = '<div class="rename-col-empty">Hiba a betöltésnél</div>';
        }
    }

    function showRenameCollectionImages(col) {
        const imagesDiv = $('#rename-col-images');
        const actionsDiv = $('#rename-col-actions');

        if (!col || col.files.length === 0) {
            imagesDiv.innerHTML = '<div class="rename-col-empty">Üres gyűjtemény</div>';
            imagesDiv.classList.remove('hidden');
            actionsDiv.classList.add('hidden');
            return;
        }

        imagesDiv.innerHTML = col.files.map(f => {
            const src = f.url.startsWith('http') ? f.url : '/' + f.url;
            return `<div class="rename-col-img" data-url="${esc(f.url)}" data-name="${esc(f.name)}">
                <img src="${src}" alt="${esc(f.name)}" onerror="this.style.opacity='0.3'">
                <div class="rename-col-img-name" title="${esc(f.name)}">${esc(f.name)}</div>
            </div>`;
        }).join('');

        // Toggle selection on click
        imagesDiv.querySelectorAll('.rename-col-img').forEach(img => {
            img.addEventListener('click', () => img.classList.toggle('selected'));
        });

        imagesDiv.classList.remove('hidden');
        actionsDiv.classList.remove('hidden');
    }

    // Recursively collect File objects from drag-and-dropped entries (files + folders)
    async function collectFilesFromEntries(entries, result) {
        for (const entry of entries) {
            if (entry.isFile) {
                const file = await new Promise(resolve => entry.file(resolve));
                result.push(file);
            } else if (entry.isDirectory) {
                const reader = entry.createReader();
                const subEntries = await new Promise(resolve => reader.readEntries(resolve));
                await collectFilesFromEntries(subEntries, result);
            }
        }
    }

    function addRenameFiles(files) {
        for (const file of files) {
            if (!file.type.startsWith('image/')) continue;
            // Read preview
            const reader = new FileReader();
            reader.onload = e => {
                renameFiles.push({ file, preview: e.target.result });
                renderRenameFileList();
                updateRenamePreview();
            };
            reader.readAsDataURL(file);
        }
    }

    function renderRenameFileList() {
        const list = $('#rename-file-list');
        list.innerHTML = renameFiles.map((rf, i) => {
            const displayName = rf.file ? rf.file.name : rf.name;
            const badge = rf.serverUrl ? '<span style="font-size:0.6rem;color:var(--accent);margin-left:4px">oldalról</span>' : '';
            return `<div class="rename-file-item">
                <img src="${rf.preview}" alt="">
                <span>${displayName}${badge}</span>
                <button class="remove-file" data-remove-rename="${i}" title="Eltávolítás">&times;</button>
            </div>`;
        }).join('');

        // Bind remove buttons
        list.querySelectorAll('[data-remove-rename]').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.removeRename);
                renameFiles.splice(idx, 1);
                renderRenameFileList();
                updateRenamePreview();
            });
        });
    }

    function getRenameList() {
        const genre = $('#rename-genre').value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        const start = parseInt($('#rename-start').value) || 1;
        if (!genre || renameFiles.length === 0) return [];

        return renameFiles.map((rf, i) => {
            const num = String(start + i).padStart(3, '0');
            const originalName = rf.file ? rf.file.name : rf.name;
            const ext = originalName.includes('.') ? '.' + originalName.split('.').pop().toLowerCase() : '.jpg';
            const newName = `silverframe_${genre}_${num}${ext}`;
            return { file: rf.file || null, serverUrl: rf.serverUrl || null, original: originalName, newName };
        });
    }

    function updateRenamePreview() {
        const preview = $('#rename-preview');
        const list = getRenameList();

        if (list.length === 0) {
            preview.innerHTML = '<span class="rename-preview-empty">Válasszon képeket és műfajt az előnézet megjelenítéséhez</span>';
            $('#rename-apply').disabled = true;
            return;
        }

        preview.innerHTML = list.map(item => `
            <div class="rename-preview-item">
                <span class="rename-preview-old">${item.original}</span>
                <span class="rename-preview-arrow">→</span>
                <span class="rename-preview-new">${item.newName}</span>
            </div>
        `).join('');

        $('#rename-apply').disabled = false;
    }

    async function executeRename() {
        const list = getRenameList();
        if (list.length === 0) return;

        const destCollection = $('#rename-dest-collection').checked;
        const destDownload = $('#rename-dest-download').checked;

        if (!destCollection && !destDownload) {
            toast('Válasszon legalább egy mentési célhelyet!', 'error');
            return;
        }

        if (destCollection) {
            const colName = getCollectionName($('#rename-collection-select'), $('#rename-collection-name'));
            if (!colName) {
                toast('Válasszon gyűjteményt vagy adjon meg egy nevet!', 'error');
                return;
            }
        }

        const applyBtn = $('#rename-apply');
        applyBtn.disabled = true;
        applyBtn.textContent = 'Feldolgozás...';

        try {
            let uploadedFiles = []; // { url, newName }

            // Split list into local files (need upload) and server files (already uploaded)
            const localItems = list.filter(item => item.file);
            const serverItems = list.filter(item => item.serverUrl);

            // ── Upload local files to server if needed ──
            if (destCollection && localItems.length > 0) {
                const formData = new FormData();
                for (const item of localItems) {
                    formData.append('images', item.file, item.file.name);
                }

                applyBtn.textContent = 'Feltöltés...';
                toast(`${localItems.length} kép feltöltése...`, 'info');
                const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
                const uploadData = await uploadRes.json();

                if (!uploadData.success || !uploadData.files) {
                    toast('Feltöltési hiba', 'error');
                    return;
                }

                // Rename uploaded files
                const renameOps = uploadData.files.map((uploaded, i) => ({
                    oldUrl: uploaded.url,
                    newName: localItems[i].newName
                }));

                applyBtn.textContent = 'Átnevezés...';
                const renameRes = await fetch('/api/batch-rename', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ files: renameOps })
                });
                const renameData = await renameRes.json();

                if (renameData.success) {
                    const results = renameData.results.filter(r => r.success);
                    uploadedFiles.push(...results.map(r => ({ url: r.newUrl, newName: r.newUrl.split('/').pop() })));
                    toast(`${results.length} helyi kép feltöltve és átnevezve!`, 'success');
                }
            }

            // ── Rename server-side files (from collections) ──
            if (serverItems.length > 0) {
                const renameOps = serverItems.map(item => ({
                    oldUrl: item.serverUrl,
                    newName: item.newName
                }));

                applyBtn.textContent = 'Átnevezés (oldalon lévő képek)...';
                const renameRes = await fetch('/api/batch-rename', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ files: renameOps })
                });
                const renameData = await renameRes.json();

                if (renameData.success) {
                    const results = renameData.results.filter(r => r.success);
                    uploadedFiles.push(...results.map(r => ({ url: r.newUrl, newName: r.newUrl.split('/').pop() })));
                    toast(`${results.length} gyűjteménybeli kép átnevezve!`, 'success');
                }
            }

            // ── Save to collection ──
            if (destCollection && uploadedFiles.length > 0) {
                const colName = getCollectionName($('#rename-collection-select'), $('#rename-collection-name'));
                applyBtn.textContent = 'Mentés gyűjteménybe...';
                const colRes = await fetch('/api/collections/save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: colName, files: uploadedFiles })
                });
                const colData = await colRes.json();
                if (colData.success) {
                    toast(`Gyűjteménybe mentve: "${colName}" (${uploadedFiles.length} kép)`, 'success');
                }
            }

            // ── Download to computer ──
            if (destDownload) {
                applyBtn.textContent = 'Letöltés...';
                toast('Képek letöltése...', 'info');
                for (const item of list) {
                    if (item.file) {
                        await downloadRenamedFile(item.file, item.newName);
                    } else if (item.serverUrl) {
                        await downloadServerFile(item.serverUrl, item.newName);
                    }
                    await new Promise(r => setTimeout(r, 200));
                }
                toast(`${list.length} kép letöltve!`, 'success');
            }

            // Reload and close
            await loadContent();
            if (currentPage) renderEditor(currentPage);
            $('#rename-modal').classList.add('hidden');

        } catch (e) {
            toast('Hiba: ' + e.message, 'error');
        } finally {
            applyBtn.textContent = 'Indítás';
            applyBtn.disabled = false;
        }
    }

    function downloadRenamedFile(file, newName) {
        return new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = () => {
                const a = document.createElement('a');
                a.href = reader.result;
                a.download = newName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                resolve();
            };
            reader.readAsDataURL(file);
        });
    }

    async function downloadServerFile(serverUrl, newName) {
        try {
            const src = serverUrl.startsWith('http') ? serverUrl : '/' + serverUrl;
            const res = await fetch(src);
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = newName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (e) {
            toast('Letöltési hiba: ' + e.message, 'error');
        }
    }

    // ══════════════════════════════════════
    // ── COLLECTIONS BROWSER ──
    // ══════════════════════════════════════

    let collectionsData = null;
    let collectionsBound = false;

    function openCollections() {
        const modal = $('#collections-modal');
        modal.classList.remove('hidden');
        bindCollectionsModal();
        loadCollections();
    }

    function bindCollectionsModal() {
        if (collectionsBound) return;
        collectionsBound = true;

        const modal = $('#collections-modal');
        $('#collections-close').addEventListener('click', () => modal.classList.add('hidden'));
        modal.querySelector('.modal-backdrop').addEventListener('click', () => modal.classList.add('hidden'));
    }

    async function loadCollections() {
        const sidebar = $('#collections-sidebar');
        sidebar.innerHTML = '<div class="collections-loading">Betöltés...</div>';
        $('#collections-content').innerHTML = '<div class="collections-empty">Válasszon egy gyűjteményt a bal oldalon</div>';

        try {
            const res = await fetch('/api/collections');
            collectionsData = await res.json();

            if (!collectionsData.collections || collectionsData.collections.length === 0) {
                sidebar.innerHTML = '<div class="collections-empty" style="font-size:0.78rem;padding:16px;text-align:center">Még nincsenek gyűjtemények.<br><br>Használja a "Képek átnevezése" eszközt és válassza a "Mentés gyűjteménybe" opciót.</div>';
                return;
            }

            sidebar.innerHTML = collectionsData.collections.map(col => `
                <div class="collections-sidebar-item" data-col-name="${esc(col.name)}">
                    <div>
                        <div>${esc(col.name)}</div>
                        <span class="col-count">${col.files.length} kép</span>
                    </div>
                    <button class="col-delete" data-delete-col="${esc(col.name)}" title="Gyűjtemény törlése">&times;</button>
                </div>
            `).join('');

            // Bind click
            sidebar.querySelectorAll('.collections-sidebar-item').forEach(item => {
                item.addEventListener('click', e => {
                    if (e.target.closest('.col-delete')) return;
                    sidebar.querySelectorAll('.collections-sidebar-item').forEach(i => i.classList.remove('active'));
                    item.classList.add('active');
                    showCollection(item.dataset.colName);
                });
            });

            // Bind delete
            sidebar.querySelectorAll('[data-delete-col]').forEach(btn => {
                btn.addEventListener('click', async e => {
                    e.stopPropagation();
                    const name = btn.dataset.deleteCol;
                    const confirmed = await confirmAction('Gyűjtemény törlése', `Biztosan törli a "${name}" gyűjteményt? (A képek megmaradnak az uploads mappában.)`);
                    if (!confirmed) return;
                    await fetch('/api/collections/delete', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name })
                    });
                    toast(`"${name}" gyűjtemény törölve`, 'success');
                    loadCollections();
                });
            });
        } catch (e) {
            sidebar.innerHTML = '<div class="collections-empty">Hiba a betöltésnél</div>';
        }
    }

    function showCollection(name) {
        const content = $('#collections-content');
        const col = collectionsData.collections.find(c => c.name === name);
        if (!col || col.files.length === 0) {
            content.innerHTML = '<div class="collections-empty">Üres gyűjtemény</div>';
            return;
        }

        content.innerHTML = '<div class="collections-grid">' + col.files.map(f => {
            const src = f.url.startsWith('http') ? f.url : '/' + f.url;
            return `
                <div class="collection-item" draggable="true" data-collection-url="${esc(f.url)}">
                    <img src="${src}" alt="${esc(f.name)}" onerror="this.style.display='none'">
                    <div class="collection-item-name" title="${esc(f.name)}">${esc(f.name)}</div>
                    <div class="collection-item-actions">
                        <button title="Másolás az aktuális oldalra" data-col-use="${esc(f.url)}">&#10010;</button>
                        <button class="danger" title="Eltávolítás a gyűjteményből" data-col-remove="${esc(f.url)}" data-col-parent="${esc(name)}">&times;</button>
                    </div>
                </div>
            `;
        }).join('') + '</div>';

        // Bind drag for use in gallery
        content.querySelectorAll('.collection-item[draggable]').forEach(item => {
            item.addEventListener('dragstart', e => {
                e.dataTransfer.setData('text/plain', item.dataset.collectionUrl);
                e.dataTransfer.effectAllowed = 'copy';
            });
        });

        // Bind "use" button — copy URL to clipboard and show toast
        content.querySelectorAll('[data-col-use]').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                const url = btn.dataset.colUse;
                navigator.clipboard.writeText(url).then(() => {
                    toast('Kép elérési út másolva! Illessze be egy kép mezőbe.', 'success');
                });
            });
        });

        // Bind remove from collection
        content.querySelectorAll('[data-col-remove]').forEach(btn => {
            btn.addEventListener('click', async e => {
                e.stopPropagation();
                const fileUrl = btn.dataset.colRemove;
                const parentName = btn.dataset.colParent;
                await fetch('/api/collections/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: parentName, fileUrl })
                });
                // Refresh
                await loadCollections();
                // Re-select the same collection
                const sidebar = $('#collections-sidebar');
                const item = sidebar.querySelector(`[data-col-name="${parentName}"]`);
                if (item) {
                    item.classList.add('active');
                    showCollection(parentName);
                } else {
                    $('#collections-content').innerHTML = '<div class="collections-empty">Válasszon egy gyűjteményt a bal oldalon</div>';
                }
            });
        });
    }

    // ══════════════════════════════════════
    // ── BATCH PROCESS TOOL ──
    // ══════════════════════════════════════

    let batchFiles = []; // { file: File, preview: dataUrl, origW: number, origH: number }
    let batchModalBound = false;

    function openBatchProcess() {
        batchFiles = [];
        const modal = $('#batch-process-modal');
        modal.classList.remove('hidden');
        $('#batch-file-list').innerHTML = '';
        $('#batch-preview').innerHTML = '<span class="batch-preview-empty">Válasszon képeket a feldolgozás előnézetéhez</span>';
        $('#batch-apply').disabled = true;
        $('#batch-progress').classList.add('hidden');
        $('#batch-collection-picker').classList.add('hidden');
        // Reset tabs to "resolution"
        $$('.batch-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'resolution'));
        $$('.batch-tab-panel').forEach(p => p.classList.remove('active'));
        $('#batch-panel-resolution').classList.add('active');
        // Reset size buttons — select Full HD in resolution tab
        $$('.batch-size-btn').forEach(b => b.classList.remove('active'));
        const fullHdBtn = document.querySelector('#batch-panel-resolution .batch-size-btn[data-w="1920"]');
        if (fullHdBtn) fullHdBtn.classList.add('active');
        updateResolutionInfo();
        // Reset mode
        $$('.batch-mode-option').forEach(o => o.classList.remove('active'));
        $$('.batch-mode-option')[0].classList.add('active');
        document.querySelector('input[name="batch-mode"][value="cover"]').checked = true;
        // Reset quality
        $('#batch-quality').value = 90;
        $('#batch-quality-val').textContent = '90%';
        // Reset destination
        document.querySelector('input[name="batch-dest"][value="uploads"]').checked = true;
        $('#batch-gallery-select').classList.add('hidden');
        $('#batch-collection-select-wrap').classList.add('hidden');
        // Populate gallery dropdown
        populateBatchGallerySelect();
        bindBatchModal();
    }

    function updateResolutionInfo() {
        const { w, h } = getBatchTargetSize();
        const megapixels = ((w * h) / 1000000).toFixed(1);
        $('#batch-res-label').innerHTML = `Kimeneti méret: <strong>${w} × ${h} px</strong>  (${megapixels} MP)`;
    }

    function populateBatchGallerySelect() {
        const select = $('#batch-gallery-target');
        if (!contentData) { select.innerHTML = '<option>Nincs elérhető galéria</option>'; return; }
        let options = '';
        // Service pages galleries
        if (contentData.servicePages) {
            for (const key of Object.keys(contentData.servicePages)) {
                const page = contentData.servicePages[key];
                if (page.gallery) {
                    const navItem = NAV.flatMap(g => g.items).find(i => i.id === 'servicePages.' + key);
                    const label = navItem ? navItem.title : key;
                    options += `<option value="servicePages.${key}.gallery">${label} (szolgáltatás)</option>`;
                }
            }
        }
        // Portfolio pages galleries
        if (contentData.portfolioPages) {
            for (const key of Object.keys(contentData.portfolioPages)) {
                const page = contentData.portfolioPages[key];
                if (page.gallery) {
                    const navItem = NAV.flatMap(g => g.items).find(i => i.id === 'portfolioPages.' + key);
                    const label = navItem ? navItem.title : key;
                    options += `<option value="portfolioPages.${key}.gallery">${label} (portfólió)</option>`;
                }
            }
        }
        select.innerHTML = options || '<option>Nincs elérhető galéria</option>';
    }

    function bindBatchModal() {
        if (batchModalBound) return;
        batchModalBound = true;

        const modal = $('#batch-process-modal');
        const dropZone = $('#batch-drop-zone');
        const fileInput = $('#batch-file-input');

        // Close
        $('#batch-cancel').addEventListener('click', () => modal.classList.add('hidden'));
        modal.querySelector('.modal-backdrop').addEventListener('click', () => modal.classList.add('hidden'));

        // File drop zone
        dropZone.addEventListener('click', e => {
            if (e.target === fileInput) return;
            fileInput.click();
        });

        dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-active'); });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-active'));
        dropZone.addEventListener('drop', async e => {
            e.preventDefault();
            dropZone.classList.remove('drag-active');
            const items = e.dataTransfer.items;
            if (items && items.length > 0 && items[0].webkitGetAsEntry) {
                const allFiles = [];
                const entries = [];
                for (let i = 0; i < items.length; i++) {
                    const entry = items[i].webkitGetAsEntry();
                    if (entry) entries.push(entry);
                }
                await collectFilesFromEntries(entries, allFiles);
                addBatchFiles(allFiles.filter(f => f.type.startsWith('image/')));
            } else {
                addBatchFiles(Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/')));
            }
        });

        fileInput.addEventListener('change', () => {
            addBatchFiles(Array.from(fileInput.files));
            fileInput.value = '';
        });

        // Folder browse
        const batchFolderInput = $('#batch-folder-input');
        $('#batch-browse-folder').addEventListener('click', () => batchFolderInput.click());
        batchFolderInput.addEventListener('change', () => {
            const imgs = Array.from(batchFolderInput.files).filter(f => f.type.startsWith('image/'));
            if (imgs.length > 0) {
                addBatchFiles(imgs);
                toast(`${imgs.length} kép betöltve a mappából`, 'success');
            } else {
                toast('Nem található kép a mappában', 'info');
            }
            batchFolderInput.value = '';
        });

        // Collection picker
        const batchColPicker = $('#batch-collection-picker');
        $('#batch-from-collection').addEventListener('click', async () => {
            batchColPicker.classList.toggle('hidden');
            if (!batchColPicker.classList.contains('hidden')) {
                await loadBatchCollections();
            }
        });
        $('#batch-col-close').addEventListener('click', () => batchColPicker.classList.add('hidden'));
        $('#batch-col-select-all').addEventListener('click', () => {
            const imgs = batchColPicker.querySelectorAll('.rename-col-img');
            const allSelected = Array.from(imgs).every(i => i.classList.contains('selected'));
            imgs.forEach(i => i.classList.toggle('selected', !allSelected));
        });
        $('#batch-col-add').addEventListener('click', () => {
            const selected = batchColPicker.querySelectorAll('.rename-col-img.selected');
            if (selected.length === 0) { toast('Jelöljön ki képeket!', 'info'); return; }
            for (const el of selected) {
                const url = el.dataset.url;
                const name = el.dataset.name;
                const preview = el.querySelector('img').src;
                if (batchFiles.some(bf => bf.serverUrl === url)) continue;
                batchFiles.push({ serverUrl: url, name, preview, file: null, origW: 0, origH: 0 });
            }
            // Load dimensions for server images
            loadBatchServerDimensions();
            renderBatchFileList();
            updateBatchPreview();
            batchColPicker.classList.add('hidden');
            toast(`${selected.length} kép hozzáadva a gyűjteményből`, 'success');
        });

        // Tab bar
        $('#batch-tab-bar').addEventListener('click', e => {
            const tab = e.target.closest('.batch-tab');
            if (!tab) return;
            $$('.batch-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            $$('.batch-tab-panel').forEach(p => p.classList.remove('active'));
            const panel = $(`#batch-panel-${tab.dataset.tab}`);
            if (panel) panel.classList.add('active');
            // If switching to custom tab, no preset is active
            if (tab.dataset.tab === 'custom') {
                $$('.batch-size-btn').forEach(b => b.classList.remove('active'));
            }
            updateResolutionInfo();
            updateBatchPreview();
        });

        // Size preset clicks (works across both resolution & usecase panels)
        $$('.batch-tab-panel.batch-size-presets').forEach(panel => {
            panel.addEventListener('click', e => {
                const btn = e.target.closest('.batch-size-btn');
                if (!btn) return;
                // Deselect all buttons in ALL panels
                $$('.batch-size-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                updateResolutionInfo();
                updateBatchPreview();
            });
        });

        // Custom size inputs
        $('#batch-custom-w').addEventListener('input', () => { updateResolutionInfo(); updateBatchPreview(); });
        $('#batch-custom-h').addEventListener('input', () => { updateResolutionInfo(); updateBatchPreview(); });

        // Mode options
        $$('.batch-mode-option').forEach(opt => {
            opt.addEventListener('click', () => {
                $$('.batch-mode-option').forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
                opt.querySelector('input[type="radio"]').checked = true;
                updateBatchPreview();
            });
        });

        // Quality slider
        $('#batch-quality').addEventListener('input', e => {
            $('#batch-quality-val').textContent = e.target.value + '%';
        });

        // Destination options
        $$('.batch-dest-option').forEach(opt => {
            opt.addEventListener('click', () => {
                const radio = opt.querySelector('input[type="radio"]');
                radio.checked = true;
                $('#batch-gallery-select').classList.toggle('hidden', radio.value !== 'gallery');
                $('#batch-collection-select-wrap').classList.toggle('hidden', radio.value !== 'collection');
                if (radio.value === 'collection') {
                    populateCollectionDropdown($('#batch-collection-target'), $('#batch-collection-name'));
                }
            });
        });

        // Apply
        $('#batch-apply').addEventListener('click', executeBatchProcess);
    }

    // Load collections into the batch process inline picker
    async function loadBatchCollections() {
        const list = $('#batch-col-list');
        const imagesDiv = $('#batch-col-images');
        const actionsDiv = $('#batch-col-actions');
        list.innerHTML = '<div class="rename-col-loading">Betöltés...</div>';
        imagesDiv.classList.add('hidden');
        actionsDiv.classList.add('hidden');

        try {
            const res = await fetch('/api/collections');
            const data = await res.json();
            if (!data.collections || data.collections.length === 0) {
                list.innerHTML = '<div class="rename-col-empty">Még nincsenek gyűjtemények.</div>';
                return;
            }
            list.innerHTML = data.collections.map(col =>
                `<button class="rename-col-btn" data-col-name="${esc(col.name)}">${esc(col.name)}<span class="col-btn-count">(${col.files.length})</span></button>`
            ).join('');
            list._colData = data.collections;

            list.querySelectorAll('.rename-col-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    list.querySelectorAll('.rename-col-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    const col = list._colData.find(c => c.name === btn.dataset.colName);
                    showBatchCollectionImages(col);
                });
            });
        } catch (e) {
            list.innerHTML = '<div class="rename-col-empty">Hiba a betöltésnél</div>';
        }
    }

    function showBatchCollectionImages(col) {
        const imagesDiv = $('#batch-col-images');
        const actionsDiv = $('#batch-col-actions');
        if (!col || col.files.length === 0) {
            imagesDiv.innerHTML = '<div class="rename-col-empty">Üres gyűjtemény</div>';
            imagesDiv.classList.remove('hidden');
            actionsDiv.classList.add('hidden');
            return;
        }
        imagesDiv.innerHTML = col.files.map(f => {
            const src = f.url.startsWith('http') ? f.url : '/' + f.url;
            return `<div class="rename-col-img" data-url="${esc(f.url)}" data-name="${esc(f.name)}">
                <img src="${src}" alt="${esc(f.name)}" onerror="this.style.opacity='0.3'">
                <div class="rename-col-img-name" title="${esc(f.name)}">${esc(f.name)}</div>
            </div>`;
        }).join('');
        imagesDiv.querySelectorAll('.rename-col-img').forEach(img => {
            img.addEventListener('click', () => img.classList.toggle('selected'));
        });
        imagesDiv.classList.remove('hidden');
        actionsDiv.classList.remove('hidden');
    }

    // Load original dimensions for server-side images added from collections
    function loadBatchServerDimensions() {
        for (const bf of batchFiles) {
            if (bf.serverUrl && bf.origW === 0) {
                const img = new Image();
                img.onload = () => {
                    bf.origW = img.naturalWidth;
                    bf.origH = img.naturalHeight;
                    renderBatchFileList();
                    updateBatchPreview();
                };
                img.src = bf.preview;
            }
        }
    }

    function addBatchFiles(files) {
        for (const file of files) {
            if (!file.type.startsWith('image/')) continue;
            const reader = new FileReader();
            reader.onload = e => {
                // Get original dimensions
                const img = new Image();
                img.onload = () => {
                    batchFiles.push({
                        file,
                        preview: e.target.result,
                        origW: img.naturalWidth,
                        origH: img.naturalHeight
                    });
                    renderBatchFileList();
                    updateBatchPreview();
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        }
    }

    function renderBatchFileList() {
        const list = $('#batch-file-list');
        list.innerHTML = batchFiles.map((bf, i) => {
            const name = bf.file ? bf.file.name : bf.name;
            const sizeText = bf.file ? `${(bf.file.size / 1024).toFixed(0)} KB` : 'oldalról';
            const dims = bf.origW ? `${bf.origW}×${bf.origH}` : '...';
            return `<div class="batch-file-item">
                <img src="${bf.preview}" alt="">
                <div class="batch-file-info">
                    <span class="batch-file-name">${name}</span>
                    <span class="batch-file-size">${dims} · ${sizeText}</span>
                </div>
                <button class="remove-file" data-remove-batch="${i}" title="Eltávolítás">&times;</button>
            </div>`;
        }).join('');

        list.querySelectorAll('[data-remove-batch]').forEach(btn => {
            btn.addEventListener('click', () => {
                batchFiles.splice(parseInt(btn.dataset.removeBatch), 1);
                renderBatchFileList();
                updateBatchPreview();
            });
        });
    }

    function getBatchTargetSize() {
        // Check if custom tab is active
        const activeTab = document.querySelector('.batch-tab.active');
        if (activeTab && activeTab.dataset.tab === 'custom') {
            return {
                w: parseInt($('#batch-custom-w').value) || 1200,
                h: parseInt($('#batch-custom-h').value) || 800
            };
        }
        // Otherwise use the selected preset button
        const activeBtn = document.querySelector('.batch-size-btn.active');
        if (activeBtn) {
            return {
                w: parseInt(activeBtn.dataset.w),
                h: parseInt(activeBtn.dataset.h)
            };
        }
        return { w: 1920, h: 1080 };
    }

    function getBatchMode() {
        const checked = document.querySelector('input[name="batch-mode"]:checked');
        return checked ? checked.value : 'cover';
    }

    function updateBatchPreview() {
        const preview = $('#batch-preview');
        updateResolutionInfo();

        if (batchFiles.length === 0) {
            preview.innerHTML = '<span class="batch-preview-empty">Válasszon képeket a feldolgozás előnézetéhez</span>';
            $('#batch-apply').disabled = true;
            return;
        }

        const { w, h } = getBatchTargetSize();
        const mode = getBatchMode();
        const modeName = mode === 'cover' ? 'Kitöltés' : mode === 'fit' ? 'Beillesztés' : 'Nyújtás';

        preview.innerHTML = batchFiles.map((bf, i) => {
            const scaleRatio = Math.max(w / bf.origW, h / bf.origH);
            const scaleLabel = scaleRatio > 1 ? `&#8593; ${(scaleRatio).toFixed(1)}×` : `&#8595; ${(1 / scaleRatio).toFixed(1)}×`;
            return `
                <div class="batch-preview-item">
                    <img src="${bf.preview}" alt="${bf.file.name}">
                    <div class="batch-preview-name" title="${bf.file.name}">${bf.file.name}</div>
                    <div class="batch-preview-dims">${bf.origW}×${bf.origH} → ${w}×${h} (${scaleLabel} ${modeName})</div>
                </div>
            `;
        }).join('');

        $('#batch-apply').disabled = false;
    }

    // Step-down resize for high-quality downscaling:
    // Halves the image repeatedly until close to target, then does a final draw.
    // This avoids the blurry/pixelated result of a single large downscale.
    function stepDownResize(source, targetW, targetH) {
        let currentW = source.naturalWidth || source.width;
        let currentH = source.naturalHeight || source.height;
        let current = source;

        // Keep halving while both dimensions are > 2× target
        while (currentW / 2 > targetW && currentH / 2 > targetH) {
            const stepCanvas = document.createElement('canvas');
            stepCanvas.width = Math.round(currentW / 2);
            stepCanvas.height = Math.round(currentH / 2);
            const stepCtx = stepCanvas.getContext('2d');
            stepCtx.imageSmoothingEnabled = true;
            stepCtx.imageSmoothingQuality = 'high';
            stepCtx.drawImage(current, 0, 0, stepCanvas.width, stepCanvas.height);
            current = stepCanvas;
            currentW = stepCanvas.width;
            currentH = stepCanvas.height;
        }

        // Final draw to exact target size
        const finalCanvas = document.createElement('canvas');
        finalCanvas.width = targetW;
        finalCanvas.height = targetH;
        const finalCtx = finalCanvas.getContext('2d');
        finalCtx.imageSmoothingEnabled = true;
        finalCtx.imageSmoothingQuality = 'high';
        finalCtx.drawImage(current, 0, 0, targetW, targetH);
        return finalCanvas;
    }

    function processImageOnCanvas(imgElement, targetW, targetH, mode) {
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        const srcW = imgElement.naturalWidth;
        const srcH = imgElement.naturalHeight;

        if (mode === 'stretch') {
            // Stretch to exact dimensions via step-down
            const resized = stepDownResize(imgElement, targetW, targetH);
            ctx.drawImage(resized, 0, 0);
        } else if (mode === 'cover') {
            // Cover: crop source to match target aspect, then resize
            const targetAspect = targetW / targetH;
            const srcAspect = srcW / srcH;
            let cropX = 0, cropY = 0, cropW = srcW, cropH = srcH;
            if (srcAspect > targetAspect) {
                // Source is wider — crop sides
                cropW = Math.round(srcH * targetAspect);
                cropX = Math.round((srcW - cropW) / 2);
            } else {
                // Source is taller — crop top/bottom
                cropH = Math.round(srcW / targetAspect);
                cropY = Math.round((srcH - cropH) / 2);
            }
            // Draw cropped region to intermediate canvas at source resolution
            const cropCanvas = document.createElement('canvas');
            cropCanvas.width = cropW;
            cropCanvas.height = cropH;
            const cropCtx = cropCanvas.getContext('2d');
            cropCtx.drawImage(imgElement, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
            // Then step-down resize to target
            const resized = stepDownResize(cropCanvas, targetW, targetH);
            ctx.drawImage(resized, 0, 0);
        } else {
            // Fit: scale to fit inside, center with black background
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, targetW, targetH);
            const scale = Math.min(targetW / srcW, targetH / srcH);
            const scaledW = Math.round(srcW * scale);
            const scaledH = Math.round(srcH * scale);
            // Step-down resize the image to the fitted size
            const resized = stepDownResize(imgElement, scaledW, scaledH);
            const offsetX = Math.round((targetW - scaledW) / 2);
            const offsetY = Math.round((targetH - scaledH) / 2);
            ctx.drawImage(resized, offsetX, offsetY);
        }

        return canvas;
    }

    async function executeBatchProcess() {
        if (batchFiles.length === 0) return;

        const { w, h } = getBatchTargetSize();
        const mode = getBatchMode();
        const quality = parseInt($('#batch-quality').value) / 100;
        const dest = document.querySelector('input[name="batch-dest"]:checked').value;

        // Validate collection name if saving to collection
        if (dest === 'collection') {
            const colName = getCollectionName($('#batch-collection-target'), $('#batch-collection-name'));
            if (!colName) {
                toast('Válasszon gyűjteményt vagy adjon meg egy nevet!', 'error');
                return;
            }
        }

        const applyBtn = $('#batch-apply');
        applyBtn.disabled = true;
        applyBtn.textContent = 'Feldolgozás...';

        const progressEl = $('#batch-progress');
        const progressFill = $('#batch-progress-fill');
        const progressText = $('#batch-progress-text');
        progressEl.classList.remove('hidden');
        progressFill.style.width = '0%';

        try {
            const processedBlobs = [];
            const total = batchFiles.length;

            // Step 1: Process each image on canvas
            for (let i = 0; i < total; i++) {
                const bf = batchFiles[i];
                progressText.textContent = `Feldolgozás: ${i + 1} / ${total}`;
                progressFill.style.width = ((i + 1) / total * 50) + '%';

                // Load image (works for both dataURL and server URL)
                const imgSrc = bf.serverUrl ? (bf.serverUrl.startsWith('http') ? bf.serverUrl : '/' + bf.serverUrl) : bf.preview;
                const img = await new Promise((resolve, reject) => {
                    const el = new Image();
                    el.crossOrigin = 'anonymous';
                    el.onload = () => resolve(el);
                    el.onerror = reject;
                    el.src = imgSrc;
                });

                // Process
                const canvas = processImageOnCanvas(img, w, h, mode);

                // Convert to blob
                const blob = await new Promise(resolve => {
                    canvas.toBlob(resolve, 'image/jpeg', quality);
                });

                const originalName = bf.file ? bf.file.name : bf.name;
                const ext = originalName.includes('.') ? '.' + originalName.split('.').pop().toLowerCase() : '.jpg';
                const cleanName = originalName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9._-]/g, '_');
                const outputName = cleanName + '_' + w + 'x' + h + (ext === '.png' ? '.jpg' : ext);

                processedBlobs.push({ blob, name: outputName });
            }

            // Step 2: Upload all processed images
            progressText.textContent = 'Feltöltés...';
            progressFill.style.width = '60%';

            const formData = new FormData();
            for (const pb of processedBlobs) {
                formData.append('images', pb.blob, pb.name);
            }

            const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
            const uploadData = await uploadRes.json();

            if (!uploadData.success || !uploadData.files) {
                toast('Feltöltési hiba!', 'error');
                return;
            }

            progressFill.style.width = '85%';

            // Step 3: If destination is gallery, add to gallery
            if (dest === 'gallery') {
                const galleryPath = $('#batch-gallery-target').value;
                if (galleryPath) {
                    const arr = getByPath(contentData, galleryPath);
                    if (arr && Array.isArray(arr)) {
                        const hasTitle = arr.length > 0 && arr[0].title !== undefined;
                        for (const uploaded of uploadData.files) {
                            const newItem = { src: uploaded.url, alt: '' };
                            if (hasTitle) { newItem.title = ''; newItem.subtitle = ''; }
                            arr.push(newItem);
                        }
                        setDirty(true);
                        if (currentPage) renderEditor(currentPage);
                    }
                }
            }

            // Step 3b: If destination is collection, save to collection
            if (dest === 'collection') {
                const colName = getCollectionName($('#batch-collection-target'), $('#batch-collection-name'));
                if (colName) {
                    const colFiles = uploadData.files.map(f => ({ url: f.url, newName: f.url.split('/').pop() }));
                    await fetch('/api/collections/save', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: colName, files: colFiles })
                    });
                }
            }

            progressFill.style.width = '100%';
            progressText.textContent = 'Kész!';

            const reused = uploadData.files.filter(f => f.reused).length;
            let msg = `${uploadData.files.length} kép feldolgozva és feltöltve (${w}×${h})!`;
            if (reused > 0) msg += ` (${reused} már létezett)`;
            if (dest === 'gallery') {
                const galleryPath = $('#batch-gallery-target').value;
                const navItem = NAV.flatMap(g => g.items).find(i => galleryPath.startsWith(i.id));
                msg += ` Hozzáadva: ${navItem ? navItem.title : galleryPath}`;
            }
            if (dest === 'collection') {
                const colName = getCollectionName($('#batch-collection-target'), $('#batch-collection-name'));
                msg += ` Gyűjteménybe mentve: "${colName}"`;
            }
            toast(msg, 'success');

            // Show result URLs
            const preview = $('#batch-preview');
            preview.innerHTML = uploadData.files.map(f => {
                const src = '/' + f.url;
                return `
                    <div class="batch-preview-item">
                        <img src="${src}" alt="">
                        <div class="batch-preview-name" title="${f.url}">${f.url.split('/').pop()}</div>
                        <div class="batch-preview-dims">${w}×${h} · Feltöltve &#10003;</div>
                    </div>
                `;
            }).join('');

            await loadContent();
            if (currentPage) renderEditor(currentPage);

            // Don't auto-close — let user see results
            applyBtn.textContent = 'Kész! Bezáráshoz kattintson a Mégse gombra';

        } catch (e) {
            toast('Hiba: ' + e.message, 'error');
        } finally {
            applyBtn.disabled = false;
            setTimeout(() => {
                applyBtn.textContent = '⚡ Feldolgozás és feltöltés';
            }, 5000);
        }
    }

    // ── Toast notifications ──
    function toast(message, type) {
        const container = $('#toast-container');
        const el = document.createElement('div');
        el.className = 'toast ' + (type || 'info');
        el.textContent = message;
        container.appendChild(el);
        setTimeout(() => {
            el.classList.add('fade-out');
            setTimeout(() => el.remove(), 300);
        }, 3000);
    }

    // ── Start ──
    document.addEventListener('DOMContentLoaded', init);
})();
