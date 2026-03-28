/* === Silverframe Studio Admin Panel === */
(function () {
    'use strict';

    let contentData = null;
    let dirty = false;
    let currentPage = null;
    let uploadCallback = null;

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
                { id: 'servicePages.portrait-model', title: 'Portré / Modell' },
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

    // ── Init ──
    async function init() {
        buildSidebar();
        bindTopbar();
        bindUploadModal();
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
        if (dirty) {
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
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

        bindFieldEvents(area, pageId);
    }

    // ── Field renderers ──
    function textField(label, path, value, hint) {
        return `<div class="field-group">
            <label class="field-label">${label}</label>
            <input class="field-input" type="text" data-path="${path}" value="${esc(value || '')}">
            ${hint ? `<div class="field-hint">${hint}</div>` : ''}
        </div>`;
    }

    function textareaField(label, path, value, tall) {
        return `<div class="field-group">
            <label class="field-label">${label}</label>
            <textarea class="field-textarea${tall ? ' tall' : ''}" data-path="${path}">${esc(value || '')}</textarea>
        </div>`;
    }

    function imageField(label, path, value) {
        const src = value || '';
        const prefix = (currentPage && (currentPage.startsWith('servicePages.') || currentPage.startsWith('portfolioPages.'))) ? '../' : '';
        const previewSrc = src ? (src.startsWith('http') ? src : prefix + src) : '';
        return `<div class="field-group">
            <label class="field-label">${label}</label>
            <div class="image-field">
                <input class="field-input" type="text" data-path="${path}" value="${esc(src)}">
                <button class="btn-upload" data-upload-for="${path}">Feltöltés</button>
                ${previewSrc ? `<img class="image-preview" src="/${src}" alt="Preview">` : ''}
            </div>
        </div>`;
    }

    function esc(str) {
        return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

        // Service categories
        html += '<div class="field-section"><div class="field-section-title">Szolgáltatás kategóriák</div>';
        html += '<div class="array-list">';
        if (contentData.serviceCategories) {
            contentData.serviceCategories.forEach((cat, i) => {
                html += `<div class="array-item">
                    <div class="array-item-header">
                        <span class="array-item-number">#${i + 1}</span>
                    </div>
                    ${textField('Név', `serviceCategories.${i}.name`, cat.name)}
                    ${textField('Link', `serviceCategories.${i}.href`, cat.href)}
                    ${imageField('Kép', `serviceCategories.${i}.img`, cat.img)}
                </div>`;
            });
        }
        html += '</div></div>';
        return html;
    }

    // ── Generic page editor (index, about, portfolio, services, contact) ──
    function renderGenericPageEditor(data, pageId) {
        let html = '';
        html += '<div class="field-section"><div class="field-section-title">Oldal beállítások</div>';
        if (data.title !== undefined) html += textField('Oldal cím (title)', pageId + '.title', data.title);
        if (data.metaDesc !== undefined) html += textareaField('Meta leírás', pageId + '.metaDesc', data.metaDesc);
        html += '</div>';

        // Render all remaining keys
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
            html += '<div class="field-group"><label class="field-label">Bekezdések</label><div class="array-list" data-array-path="' + pageId + '.introDesc">';
            data.introDesc.forEach((p, i) => {
                html += `<div class="array-item">
                    <div class="array-item-header">
                        <span class="array-item-number">Bekezdés #${i + 1}</span>
                        <div class="array-item-actions">
                            <button class="btn-icon danger" data-remove-array="${pageId}.introDesc" data-index="${i}" title="Törlés">✕</button>
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
            html += '<div class="array-list">';
            data.packages.forEach((pkg, pi) => {
                html += `<div class="array-item">
                    <div class="array-item-header">
                        <span class="array-item-number">Csomag #${pi + 1}</span>
                        <div class="array-item-actions">
                            <button class="btn-icon" data-move-up="${pageId}.packages" data-index="${pi}" title="Fel">↑</button>
                            <button class="btn-icon" data-move-down="${pageId}.packages" data-index="${pi}" title="Le">↓</button>
                            <button class="btn-icon danger" data-remove-array="${pageId}.packages" data-index="${pi}" title="Törlés">✕</button>
                        </div>
                    </div>
                    ${textField('Csomag neve', `${pageId}.packages.${pi}.name`, pkg.name)}
                    ${textareaField('Csomag leírás', `${pageId}.packages.${pi}.desc`, pkg.desc)}
                    <div class="nested-array">
                        <label class="field-label">Elemek</label>`;
                if (pkg.items) {
                    pkg.items.forEach((item, ii) => {
                        html += `<div class="nested-item">
                            <div class="array-item-header">
                                <span class="array-item-number">Elem #${ii + 1}</span>
                                <div class="array-item-actions">
                                    <button class="btn-icon danger" data-remove-array="${pageId}.packages.${pi}.items" data-index="${ii}" title="Törlés">✕</button>
                                </div>
                            </div>
                            ${textField('Elem cím', `${pageId}.packages.${pi}.items.${ii}.title`, item.title)}
                            ${textField('Elem leírás', `${pageId}.packages.${pi}.items.${ii}.desc`, item.desc)}
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

        // Gallery
        if (data.gallery) {
            html += renderGallerySection(data.gallery, pageId + '.gallery');
        }

        // CTA
        html += '<div class="field-section"><div class="field-section-title">CTA szekció</div>';
        if (data.ctaLabel !== undefined) html += textField('CTA címke', pageId + '.ctaLabel', data.ctaLabel);
        if (data.ctaTitle !== undefined) html += textField('CTA cím', pageId + '.ctaTitle', data.ctaTitle);
        if (data.ctaButton !== undefined) html += textField('CTA gomb szöveg', pageId + '.ctaButton', data.ctaButton);
        if (data.ctaLink !== undefined) html += textField('CTA link', pageId + '.ctaLink', data.ctaLink);
        html += '</div>';

        return html;
    }

    // ── Gallery section ──
    function renderGallerySection(gallery, basePath) {
        let html = '<div class="field-section"><div class="field-section-title">Galéria</div>';
        html += '<div class="gallery-grid">';
        gallery.forEach((img, i) => {
            const src = img.src || '';
            html += `<div class="gallery-card">
                <img src="/${src}" alt="${esc(img.alt || '')}" onerror="this.style.display='none'">
                <div class="gallery-card-actions">
                    <button class="btn-icon" data-move-up="${basePath}" data-index="${i}" title="Fel">↑</button>
                    <button class="btn-icon danger" data-remove-array="${basePath}" data-index="${i}" title="Törlés">✕</button>
                </div>
                <div class="gallery-card-body">
                    <input class="field-input" type="text" data-path="${basePath}.${i}.src" value="${esc(src)}" placeholder="Kép elérési út">
                    <input class="field-input" type="text" data-path="${basePath}.${i}.alt" value="${esc(img.alt || '')}" placeholder="Alt szöveg">
                    ${img.title !== undefined ? `<input class="field-input" type="text" data-path="${basePath}.${i}.title" value="${esc(img.title || '')}" placeholder="Cím">` : ''}
                    ${img.subtitle !== undefined ? `<input class="field-input" type="text" data-path="${basePath}.${i}.subtitle" value="${esc(img.subtitle || '')}" placeholder="Alcím">` : ''}
                </div>
            </div>`;
        });
        html += '</div>';
        html += `<button class="btn-add" data-add-array="${basePath}" data-template="galleryItem" style="margin-top:12px">+ Kép hozzáadása</button>`;
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

            if (typeof val === 'string') {
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
                    html += '<div class="array-list" data-array-path="' + path + '">';
                    val.forEach((item, i) => {
                        html += `<div class="array-item">
                            <div class="array-item-header">
                                <span class="array-item-number">#${i + 1}</span>
                                <div class="array-item-actions">
                                    <button class="btn-icon danger" data-remove-array="${path}" data-index="${i}">✕</button>
                                </div>
                            </div>
                            <textarea class="field-textarea" data-path="${path}.${i}">${esc(item)}</textarea>
                        </div>`;
                    });
                    html += '</div>';
                    html += `<button class="btn-add" data-add-array="${path}" data-template="string">+ Hozzáadás</button>`;
                } else if (val.length > 0 && typeof val[0] === 'object') {
                    if (val[0].src !== undefined) {
                        // Gallery-like
                        html += renderGallerySection(val, path).replace(/<div class="field-section">.*?<\/div>/, '').replace(/<\/div>$/, '');
                    } else {
                        html += '<div class="array-list">';
                        val.forEach((item, i) => {
                            html += `<div class="array-item">
                                <div class="array-item-header">
                                    <span class="array-item-number">#${i + 1}</span>
                                    <div class="array-item-actions">
                                        <button class="btn-icon danger" data-remove-array="${path}" data-index="${i}">✕</button>
                                    </div>
                                </div>`;
                            for (const k of Object.keys(item)) {
                                if (typeof item[k] === 'string') {
                                    html += textField(k, `${path}.${i}.${k}`, item[k]);
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
                        // Render nested arrays recursively
                        html += renderObjectFields({ [k]: v }, path, []);
                    }
                }
                html += '</div>';
            }
        }
        return html;
    }

    // ── Bind field change events ──
    function bindFieldEvents(container, pageId) {
        // Text inputs and textareas
        container.querySelectorAll('[data-path]').forEach(el => {
            el.addEventListener('input', () => {
                setByPath(contentData, el.dataset.path, el.value);
                setDirty(true);
            });
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

        // Remove array item
        container.querySelectorAll('[data-remove-array]').forEach(btn => {
            btn.addEventListener('click', () => {
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
            btn.addEventListener('click', () => {
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
                        // Check if existing items have title/subtitle
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

    // ── Upload modal ──
    function bindUploadModal() {
        const modal = $('#image-upload-modal');
        const zone = $('#upload-zone');
        const input = $('#upload-input');
        const preview = $('#upload-preview');
        const confirmBtn = $('#upload-confirm');
        const cancelBtn = $('#upload-cancel');
        const backdrop = modal.querySelector('.modal-backdrop');

        let uploadedFiles = [];

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
                    uploadedFiles = data.files;
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
