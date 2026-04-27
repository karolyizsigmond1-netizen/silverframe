const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

// Load .env
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
        const eq = line.indexOf('=');
        if (eq > 0) {
            const k = line.slice(0, eq).trim();
            const v = line.slice(eq + 1).trim();
            if (k && !process.env[k]) process.env[k] = v;
        }
    });
}
let sharp; try { sharp = require('sharp'); } catch(e) { sharp = null; }

async function compressImage(buf, ext) {
    if (!sharp) return buf;
    try {
        const img = sharp(buf);
        const meta = await img.metadata();
        const needsResize = meta.width > 1920 || meta.height > 1920;
        let p = needsResize ? img.resize(1920, 1920, { fit: 'inside', withoutEnlargement: true }) : img;
        return ext === '.png'
            ? await p.png({ compressionLevel: 8 }).toBuffer()
            : await p.jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    } catch(e) { return buf; }
}

const PORT = 3000;
const ROOT = __dirname;
const CONTENT_FILE = path.join(ROOT, 'content.json');
const UPLOADS_DIR = path.join(ROOT, 'uploads');

const MIME = {
    '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
    '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
    '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2'
};

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const server = http.createServer((req, res) => {
    // CORS headers for admin
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    // API: Get content
    if (req.method === 'GET' && req.url === '/api/content') {
        try {
            const data = fs.readFileSync(CONTENT_FILE, 'utf-8');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(data);
        } catch (e) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'content.json not found. Run: node build.js --extract' }));
        }
        return;
    }

    // API: Save content + rebuild
    if (req.method === 'POST' && req.url === '/api/content') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const json = JSON.parse(body);
                // Backup current content
                if (fs.existsSync(CONTENT_FILE)) {
                    fs.copyFileSync(CONTENT_FILE, CONTENT_FILE + '.bak');
                }
                fs.writeFileSync(CONTENT_FILE, JSON.stringify(json, null, 2), 'utf-8');
                // Run build
                try {
                    execSync('node build.js', { cwd: ROOT, stdio: 'pipe', timeout: 30000 });
                    // Sync with GitHub — do this BEFORE responding so the client knows the outcome
                    let gitWarning = null;
                    try {
                        try { execSync('git pull --no-rebase', { cwd: ROOT, stdio: 'pipe', timeout: 30000 }); } catch(e) {}
                        execSync('git add -A && git commit -m "Tartalom frissítés" && git push', { cwd: ROOT, stdio: 'pipe', timeout: 60000 });
                        console.log('  ✓ GitHub push sikeres');
                    } catch (gitErr) {
                        const msg = gitErr.message || '';
                        // "nothing to commit" is not an error
                        if (!msg.includes('nothing to commit') && !msg.includes('nothing added')) {
                            gitWarning = 'GitHub push hiba – az oldal esetleg nem frissült. Részletek: ' + msg.split('\n')[0];
                            console.log('  ⚠ GitHub push hiba:', msg.split('\n')[0]);
                        }
                    }
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: true,
                        message: gitWarning ? 'Mentve és újraépítve, de GitHub feltöltés sikertelen!' : 'Mentve, újraépítve és feltöltve GitHub-ra!',
                        warning: gitWarning || null
                    }));
                } catch (buildErr) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'Build hiba: ' + buildErr.message }));
                }
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Érvénytelen JSON' }));
            }
        });
        return;
    }

    // API: Upload image (with deduplication)
    if (req.method === 'POST' && req.url === '/api/upload') {
        const chunks = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', async () => {
            const buffer = Buffer.concat(chunks);
            const boundary = req.headers['content-type'].split('boundary=')[1];
            if (!boundary) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing boundary' }));
                return;
            }
            const parts = parseMultipart(buffer, boundary);
            const results = [];
            for (const part of parts) {
                if (part.filename) {
                    const ext = path.extname(part.filename).toLowerCase() || '.jpg';
                    // Compress before hashing so duplicate detection works on compressed version
                    const data = /\.(jpg|jpeg|png|webp)$/i.test(part.filename)
                        ? await compressImage(part.data, ext)
                        : part.data;
                    const hash = crypto.createHash('md5').update(data).digest('hex').substring(0, 12);
                    const existing = findExistingByHash(hash, ext);
                    if (existing) {
                        results.push({ original: part.filename, url: 'uploads/' + existing, reused: true });
                    } else {
                        const safeName = hash + '-' + part.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
                        fs.writeFileSync(path.join(UPLOADS_DIR, safeName), data);
                        results.push({ original: part.filename, url: 'uploads/' + safeName });
                    }
                }
            }
            const reusedCount = results.filter(r => r.reused).length;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, files: results, reusedCount }));
        });
        return;
    }

    // API: Cleanup uploads — remove files not referenced in content.json
    if (req.method === 'POST' && req.url === '/api/cleanup-uploads') {
        try {
            const content = fs.readFileSync(CONTENT_FILE, 'utf-8');
            const allUploads = fs.readdirSync(UPLOADS_DIR);
            // Find all "uploads/xxx" references in content.json
            const referenced = new Set();
            const matches = content.match(/uploads\/[^"\\]+/g) || [];
            for (const m of matches) {
                referenced.add(m.replace('uploads/', ''));
            }
            let removed = 0;
            const removedFiles = [];
            for (const file of allUploads) {
                if (!referenced.has(file)) {
                    fs.unlinkSync(path.join(UPLOADS_DIR, file));
                    removedFiles.push(file);
                    removed++;
                }
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, removed, removedFiles, kept: referenced.size }));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
        }
        return;
    }

    // API: Deduplicate uploads — merge identical files, update content.json
    if (req.method === 'POST' && req.url === '/api/dedup-uploads') {
        try {
            let content = fs.readFileSync(CONTENT_FILE, 'utf-8');
            const allUploads = fs.readdirSync(UPLOADS_DIR);

            // Hash all existing files
            const hashMap = {}; // hash → first filename
            const dupes = []; // { duplicate, keepAs }
            for (const file of allUploads) {
                const filePath = path.join(UPLOADS_DIR, file);
                const data = fs.readFileSync(filePath);
                const hash = crypto.createHash('md5').update(data).digest('hex').substring(0, 12);
                if (hashMap[hash]) {
                    dupes.push({ duplicate: file, keepAs: hashMap[hash] });
                } else {
                    hashMap[hash] = file;
                }
            }

            // Replace references and delete duplicates
            let replaced = 0;
            for (const { duplicate, keepAs } of dupes) {
                const oldRef = 'uploads/' + duplicate;
                const newRef = 'uploads/' + keepAs;
                if (content.includes(oldRef)) {
                    content = content.split(oldRef).join(newRef);
                    replaced++;
                }
                fs.unlinkSync(path.join(UPLOADS_DIR, duplicate));
            }

            // Save updated content.json
            if (replaced > 0) {
                fs.writeFileSync(CONTENT_FILE, content, 'utf-8');
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, duplicatesRemoved: dupes.length, referencesUpdated: replaced }));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
        }
        return;
    }

    // API: Batch rename uploaded files
    if (req.method === 'POST' && req.url === '/api/batch-rename') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { files } = JSON.parse(body);
                // files = [{ oldUrl: "uploads/abc.jpg", newName: "silverframe_portrait_001.jpg" }, ...]
                let content = fs.readFileSync(CONTENT_FILE, 'utf-8');
                const results = [];
                let updated = 0;

                for (const { oldUrl, newName } of files) {
                    const oldFile = oldUrl.replace('uploads/', '');
                    const oldPath = path.join(UPLOADS_DIR, oldFile);
                    const newPath = path.join(UPLOADS_DIR, newName);

                    if (!fs.existsSync(oldPath)) {
                        results.push({ oldUrl, error: 'Fájl nem található' });
                        continue;
                    }
                    // Don't overwrite existing files
                    if (fs.existsSync(newPath) && oldPath !== newPath) {
                        results.push({ oldUrl, error: 'Már létezik ilyen nevű fájl' });
                        continue;
                    }

                    fs.renameSync(oldPath, newPath);
                    // Update all references in content.json
                    const oldRef = 'uploads/' + oldFile;
                    const newRef = 'uploads/' + newName;
                    if (content.includes(oldRef)) {
                        content = content.split(oldRef).join(newRef);
                        updated++;
                    }
                    results.push({ oldUrl, newUrl: 'uploads/' + newName, success: true });
                }

                // Save updated content
                fs.writeFileSync(CONTENT_FILE, content, 'utf-8');

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, results, referencesUpdated: updated }));
            } catch (e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message }));
            }
        });
        return;
    }

    // API: List all uploaded files
    if (req.method === 'GET' && req.url === '/api/uploads') {
        try {
            const files = fs.readdirSync(UPLOADS_DIR).map(f => {
                const stat = fs.statSync(path.join(UPLOADS_DIR, f));
                return { name: f, url: 'uploads/' + f, size: stat.size, modified: stat.mtime };
            });
            files.sort((a, b) => new Date(b.modified) - new Date(a.modified));
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, files }));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
        }
        return;
    }

    // API: Get collections
    if (req.method === 'GET' && req.url === '/api/collections') {
        try {
            const colFile = path.join(ROOT, 'uploads', 'collections.json');
            if (fs.existsSync(colFile)) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(fs.readFileSync(colFile, 'utf-8'));
            } else {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ collections: [] }));
            }
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
        }
        return;
    }

    // API: Save to collection
    if (req.method === 'POST' && req.url === '/api/collections/save') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { name, files } = JSON.parse(body);
                // files = [{ url, newName }]
                const colFile = path.join(ROOT, 'uploads', 'collections.json');
                let data = { collections: [] };
                if (fs.existsSync(colFile)) {
                    data = JSON.parse(fs.readFileSync(colFile, 'utf-8'));
                }
                // Find or create collection
                let col = data.collections.find(c => c.name === name);
                if (!col) {
                    col = { name, created: new Date().toISOString(), files: [] };
                    data.collections.push(col);
                }
                // Add files (avoid duplicates)
                for (const f of files) {
                    if (!col.files.find(cf => cf.url === f.url)) {
                        col.files.push({ url: f.url, name: f.newName || f.url.split('/').pop(), added: new Date().toISOString() });
                    }
                }
                col.updated = new Date().toISOString();
                fs.writeFileSync(colFile, JSON.stringify(data, null, 2), 'utf-8');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, collection: col }));
            } catch (e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message }));
            }
        });
        return;
    }

    // API: Delete collection or remove items from collection
    if (req.method === 'POST' && req.url === '/api/collections/delete') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { name, fileUrl } = JSON.parse(body);
                const colFile = path.join(ROOT, 'uploads', 'collections.json');
                if (!fs.existsSync(colFile)) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true }));
                    return;
                }
                const data = JSON.parse(fs.readFileSync(colFile, 'utf-8'));
                if (fileUrl) {
                    // Remove single file from collection
                    const col = data.collections.find(c => c.name === name);
                    if (col) col.files = col.files.filter(f => f.url !== fileUrl);
                } else {
                    // Delete entire collection
                    data.collections = data.collections.filter(c => c.name !== name);
                }
                fs.writeFileSync(colFile, JSON.stringify(data, null, 2), 'utf-8');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            } catch (e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message }));
            }
        });
        return;
    }

    // API: Google Calendar availability (FreeBusy)
    if (req.method === 'GET' && req.url.startsWith('/api/availability')) {
        const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?') + 1) : '';
        const params = Object.fromEntries(qs.split('&').map(p => p.split('=')));
        const year  = parseInt(params.year)  || new Date().getFullYear();
        const month = parseInt(params.month) || new Date().getMonth();
        const calId = process.env.GOOGLE_CALENDAR_ID;
        const apiKey = process.env.GOOGLE_CALENDAR_KEY;
        if (!apiKey || !calId) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Calendar not configured' }));
            return;
        }
        const timeMin = new Date(year, month, 1).toISOString();
        const timeMax = new Date(year, month + 1, 0, 23, 59, 59).toISOString();
        const postData = JSON.stringify({ timeMin, timeMax, items: [{ id: calId }] });
        const apiReq = https.request({
            hostname: 'www.googleapis.com',
            path: '/calendar/v3/freeBusy?key=' + apiKey,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
        }, apiRes => {
            let body = '';
            apiRes.on('data', c => body += c);
            apiRes.on('end', () => {
                try {
                    const parsed = JSON.parse(body);
                    const busy = parsed.calendars?.[calId]?.busy || [];
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ busy }));
                } catch(e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Parse error', raw: body.slice(0, 200) }));
                }
            });
        });
        apiReq.on('error', e => {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
        });
        apiReq.write(postData);
        apiReq.end();
        return;
    }

    // Static file serving
    let urlPath = req.url.split('?')[0];
    if (urlPath.endsWith('/')) urlPath += 'index.html';
    let filePath = path.join(ROOT, decodeURIComponent(urlPath));

    // Security: prevent directory traversal
    if (!filePath.startsWith(ROOT)) {
        res.writeHead(403); res.end('Forbidden'); return;
    }

    const ext = path.extname(filePath);
    const contentType = MIME[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/html' });
            res.end('<h1>404 - Nem található</h1>');
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(data);
        }
    });
});

// Check if a file with matching hash prefix already exists in uploads
function findExistingByHash(hash, ext) {
    try {
        const files = fs.readdirSync(UPLOADS_DIR);
        for (const file of files) {
            if (file.startsWith(hash) && path.extname(file).toLowerCase() === ext) {
                return file;
            }
        }
    } catch (e) {}
    return null;
}

// Simple multipart parser
function parseMultipart(buffer, boundary) {
    const parts = [];
    const boundaryBuf = Buffer.from('--' + boundary);
    let start = buffer.indexOf(boundaryBuf) + boundaryBuf.length + 2;

    while (start < buffer.length) {
        const end = buffer.indexOf(boundaryBuf, start);
        if (end === -1) break;

        const partData = buffer.slice(start, end - 2); // -2 for \r\n before boundary
        const headerEnd = partData.indexOf('\r\n\r\n');
        if (headerEnd === -1) { start = end + boundaryBuf.length + 2; continue; }

        const headers = partData.slice(0, headerEnd).toString();
        const body = partData.slice(headerEnd + 4);

        const nameMatch = headers.match(/name="([^"]+)"/);
        const filenameMatch = headers.match(/filename="([^"]+)"/);

        parts.push({
            name: nameMatch ? nameMatch[1] : '',
            filename: filenameMatch ? filenameMatch[1] : null,
            data: body
        });

        start = end + boundaryBuf.length + 2;
    }
    return parts;
}

// Auto-pull latest changes from GitHub on startup
try {
    console.log('\n  ⏳ GitHub szinkronizálás...');
    execSync('git pull --no-rebase', { cwd: ROOT, stdio: 'pipe', timeout: 30000 });
    console.log('  ✓ Legfrissebb verzió letöltve');
} catch (pullErr) {
    console.log('  ⚠ Git pull hiba:', pullErr.message.split('\n')[0]);
}

server.listen(PORT, () => {
    console.log(`\n  Silverframe Studio Admin`);
    console.log(`  =======================`);
    console.log(`  Admin panel: http://localhost:${PORT}/admin/`);
    console.log(`  Website:     http://localhost:${PORT}/`);
    console.log(`\n  Ctrl+C a leállításhoz\n`);
});
