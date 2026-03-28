const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

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
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, message: 'Mentve és újraépítve!' }));
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

    // API: Upload image
    if (req.method === 'POST' && req.url === '/api/upload') {
        const chunks = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', () => {
            const buffer = Buffer.concat(chunks);
            // Parse multipart form data (simple parser)
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
                    const ext = path.extname(part.filename).toLowerCase();
                    const safeName = Date.now() + '-' + part.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
                    const filePath = path.join(UPLOADS_DIR, safeName);
                    fs.writeFileSync(filePath, part.data);
                    results.push({ original: part.filename, url: 'uploads/' + safeName });
                }
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, files: results }));
        });
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

server.listen(PORT, () => {
    console.log(`\n  Silverframe Studio Admin`);
    console.log(`  =======================`);
    console.log(`  Admin panel: http://localhost:${PORT}/admin/`);
    console.log(`  Website:     http://localhost:${PORT}/`);
    console.log(`\n  Ctrl+C a leállításhoz\n`);
});
