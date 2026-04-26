const fs = require('fs');
const path = require('path');
const { YtDlp } = require('ytdlp-nodejs');

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

// Convert bytes to human readable format
function formatSize(bytes) {
    if (!bytes) return 'unknown';

    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;

    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// Fetch metadata to estimate file size for a specific quality
async function getVideoInfo(url, quality, hasCookies, cookiesPath) {
    const ytdlp = new YtDlp();

    const builder = ytdlp
        .getInfo(url)
        .quality(quality)
        .type('mp4');

    if (hasCookies) {
        builder.addArgs('--cookies', cookiesPath);
    } else {
        builder.addArgs('--extractor-args', 'youtube:player_client=android');
    }

    return builder.run();
}

async function main() {

    const input = process.argv[2];

    if (!input) {
        console.error('❌ Please provide video URL or ID');
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
    console.log(`📁 Directory: ${outDir}\n`);

    const cookiesPath = path.join(__dirname, '..', 'cookies.txt');
    const hasCookies = fs.existsSync(cookiesPath) && fs.statSync(cookiesPath).size > 0;

    const qualities = ['1080p','720p','480p','360p'];

    const MAX_SIZE = 1.5 * 1024 * 1024 * 1024; // 1.5GB limit

    let selectedQuality = null;

    // Select the first quality that is below the size limit
    for (const q of qualities) {

        try {

            console.log(`🔎 Checking quality ${q} ...`);

            const info = await getVideoInfo(url, q, hasCookies, cookiesPath);

            const size = info.filesize || info.filesize_approx || 0;

            console.log(`📊 Candidate → Quality: ${q} | Estimated Size: ${formatSize(size)}`);

            if (size && size > MAX_SIZE) {
                console.log(`⚠️ Size is larger than 1.5GB → trying lower quality\n`);
                continue;
            }

            selectedQuality = q;
            break;

        } catch (err) {
            console.log(`❌ Failed checking ${q}: ${err.message}\n`);
        }

    }

    if (!selectedQuality) {
        console.error('❌ No quality fits the 1.5GB limit');
        process.exit(1);
    }

    console.log(`✅ Selected quality: ${selectedQuality}\n`);
    console.log(`⬇️ Starting download...\n`);

    const outputTemplate = path.join(outDir, '%(title)s.%(ext)s');

    const ytdlp = new YtDlp();

    const builder = ytdlp
        .download(url)
        .filter('mergevideo')
        .quality(selectedQuality)
        .type('mp4')
        .setOutputTemplate(outputTemplate)
        .embedMetadata()
        .embedThumbnail()
        .on('progress', p => {
            if (p.percentage_str) {
                process.stdout.write(`\r📥 ${p.percentage_str} - ${p.speed || ''} - ETA: ${p.eta || ''}`);
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

    console.log('\n✅ Download successful');
    console.log(`📂 File: ${result.filePaths.join(', ')}`);
    console.log(`✅ Saved in: ${outDir}`);
}

main().catch(err => {
    console.error('❌ Fatal error:', err.message);
    process.exit(1);
});
