const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { YtDlp } = require('ytdlp-nodejs');

const execFileAsync = promisify(execFile);

function extractVideoId(url) {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
        /^([a-zA-Z0-9_-]{11})$/
    ];
    for (const p of patterns) {
        const m = url.match(p);
        if (m) return m[1];
    }
    return null;
}

function getFileSize(file) {
    return fs.statSync(file).size;
}

async function splitWith7zip(filePath, outDir) {
    const archiveBase = path.join(
        outDir,
        path.basename(filePath, path.extname(filePath))
    ) + '.7z';

    console.log('\n📦 Splitting file into 50MB parts using 7zip...');

    await execFileAsync('7z', [
        'a',
        archiveBase,
        filePath,
        '-v50m',
        '-mx=0'
    ]);

    fs.unlinkSync(filePath);
    console.log('✅ Split completed and original file removed');
}

async function main() {
    const input = process.argv[2];
    const quality = process.argv[3];

    if (!input) {
        console.error('❌ Please provide video URL or ID');
        process.exit(1);
    }

    const validQualities = ['1080', '720', '480', '360'];

    if (!quality || !validQualities.includes(quality)) {
        console.error('❌ Please choose a valid quality');
        console.error(`Available: ${validQualities.join(', ')}`);
        process.exit(1);
    }

    const videoId = extractVideoId(input);
    if (!videoId) {
        console.error('❌ Invalid URL or ID');
        process.exit(1);
    }

    const url = `https://youtube.com/watch?v=${videoId}`;
    const outDir = path.join('data', videoId);
    fs.mkdirSync(outDir, { recursive: true });

    console.log(`📹 Video ID: ${videoId}`);
    console.log(`🔗 URL: ${url}`);
    console.log(`🎬 Selected quality: ${quality}p`);
    console.log(`📁 Output directory: ${outDir}\n`);

    const ytdlp = new YtDlp();

    const cookiesPath = path.join(__dirname, '..', 'cookies.txt');
    const hasCookies = fs.existsSync(cookiesPath) && fs.statSync(cookiesPath).size > 0;

    console.log('⬇️ Starting download...');

    try {
        const outputTemplate = path.join(outDir, '%(title)s.%(ext)s');

        const builder = ytdlp
            .download(url)
            .filter('mergevideo')
            .quality(`${quality}p`)
            .type('mp4')
            .setOutputTemplate(outputTemplate)
            .embedMetadata()
            .embedThumbnail()
            .on('progress', p => {
                if (p.percentage_str) {
                    process.stdout.write(
                        `\r📊 ${p.percentage_str} - ${p.speed || ''} - ETA: ${p.eta || ''}`
                    );
                }
            });

        if (hasCookies) {
            console.log('🍪 Using cookies file');
            builder.addArgs('--cookies', cookiesPath);
        } else {
            console.log('🤖 Using player_client=android');
            builder.addArgs('--extractor-args', 'youtube:player_client=android');
        }

        const result = await builder.run();

        console.log('\n✅ Download finished');

        const filePath = result.filePaths[0];
        const size = getFileSize(filePath);

        const MAX_SIZE = 1.5 * 1024 * 1024 * 1024;
        const SPLIT_LIMIT = 50 * 1024 * 1024;

        console.log(`📦 File size: ${(size / 1024 / 1024).toFixed(2)} MB`);

        // If larger than 1.5GB → fail
        if (size > MAX_SIZE) {
            console.error('❌ File exceeds 1.5GB limit. Aborting commit.');
            process.exit(2);
        }

        // If ≤ 50MB → keep as is
        if (size <= SPLIT_LIMIT) {
            console.log('✅ File size ≤ 50MB. No split needed.');
            return;
        }

        // If between 50MB and 1.5GB → split
        await splitWith7zip(filePath, outDir);

        console.log('✅ File prepared for commit');

    } catch (err) {
        console.error('\n❌ Download failed:', err.message);
        process.exit(1);
    }
}

main().catch(err => {
    console.error('❌ Fatal error:', err.message);
    process.exit(1);
});
