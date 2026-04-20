// One-time compression of all existing uploads.
// Run: node compress.js
// Skips files already under 400KB. Max 1920px, 82% JPEG quality.

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const UPLOADS = path.join(__dirname, 'uploads');
const MAX_DIM = 1920;
const QUALITY = 82;
const SKIP_UNDER_BYTES = 400 * 1024; // skip already-small files

async function run() {
    const files = fs.readdirSync(UPLOADS).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
    let compressed = 0, skipped = 0, errors = 0;
    let savedBytes = 0;

    for (const file of files) {
        const fp = path.join(UPLOADS, file);
        const stat = fs.statSync(fp);
        if (stat.size < SKIP_UNDER_BYTES) { skipped++; continue; }

        try {
            const buf = fs.readFileSync(fp);
            const img = sharp(buf);
            const meta = await img.metadata();
            const needsResize = (meta.width > MAX_DIM || meta.height > MAX_DIM);

            let pipeline = img;
            if (needsResize) pipeline = pipeline.resize(MAX_DIM, MAX_DIM, { fit: 'inside', withoutEnlargement: true });

            const ext = path.extname(file).toLowerCase();
            let outBuf;
            if (ext === '.png') {
                outBuf = await pipeline.png({ quality: QUALITY, compressionLevel: 8 }).toBuffer();
            } else {
                outBuf = await pipeline.jpeg({ quality: QUALITY, mozjpeg: true }).toBuffer();
            }

            if (outBuf.length < stat.size) {
                savedBytes += stat.size - outBuf.length;
                fs.writeFileSync(fp, outBuf);
                process.stdout.write(`✓ ${file} ${(stat.size/1024/1024).toFixed(1)}MB → ${(outBuf.length/1024).toFixed(0)}KB\n`);
                compressed++;
            } else {
                skipped++;
            }
        } catch (e) {
            process.stdout.write(`✗ ${file}: ${e.message}\n`);
            errors++;
        }
    }

    console.log(`\nDone: ${compressed} compressed, ${skipped} skipped, ${errors} errors`);
    console.log(`Saved: ${(savedBytes / 1024 / 1024).toFixed(0)} MB`);
}

run().catch(console.error);
