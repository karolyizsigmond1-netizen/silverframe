// Generate small thumbnails for grid tiles / cards: uploads/x.jpg → thumbs/x.jpg
// Run: node make-thumbs.js   (build.js runs it automatically)
// Only creates missing thumbs, so repeat runs are fast. Removes thumbs whose original is gone.

const fs = require('fs');
const path = require('path');

const UPLOADS = path.join(__dirname, 'uploads');
const THUMBS = path.join(__dirname, 'thumbs');
const MAX_DIM = 900;
const QUALITY = 76;

async function run() {
    let sharp;
    try { sharp = require('sharp'); } catch (e) { console.log('  ⚠ sharp not installed — thumbnails skipped'); return; }
    if (!fs.existsSync(THUMBS)) fs.mkdirSync(THUMBS);

    const files = fs.readdirSync(UPLOADS).filter(f => /\.(jpe?g|png|webp)$/i.test(f));
    const originals = new Set(files);
    let made = 0, errors = 0;

    for (const file of files) {
        const out = path.join(THUMBS, file);
        if (fs.existsSync(out)) continue;
        try {
            let p = sharp(path.join(UPLOADS, file)).rotate()
                .resize(MAX_DIM, MAX_DIM, { fit: 'inside', withoutEnlargement: true });
            p = /\.png$/i.test(file) ? p.png({ compressionLevel: 9 }) : p.jpeg({ quality: QUALITY, mozjpeg: true });
            await p.toFile(out);
            made++;
        } catch (e) {
            errors++;
            console.log(`  ✗ thumb ${file}: ${e.message}`);
        }
    }

    let removed = 0;
    for (const f of fs.readdirSync(THUMBS)) {
        if (!originals.has(f)) { fs.unlinkSync(path.join(THUMBS, f)); removed++; }
    }

    if (made || removed || errors) console.log(`  ✓ thumbs: ${made} created, ${removed} removed, ${errors} errors`);
}

run();
