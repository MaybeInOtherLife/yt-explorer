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

function formatSize(bytes) {
    if (!bytes) return 'unknown';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

async function getVideoInfo(url, quality, hasCookies, cookiesPath) {
    const height = quality.replace('p', '');

    const args = [
        '--dump-json',
        '--no-playlist',
        '-f',
        `bestvideo[height<=${height}]+bestaudio/best[height<=${height}]`,
        url
    ];

    if (hasCookies) {
        args.push('--cookies', cookiesPath);
    } else {
        args.push('--extractor-args', 'youtube:player_client=android');
    }

    const { stdout } = await execFileAsync('yt-dlp', args);
    return JSON.parse(stdout);
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

    if (hasCookies) {
        console.log('🍪 Using cookies file\n');
    } else {
        console.log('🤖 Using android client\n');
    }

    const qualities = ['1080p', '720p', '480p', '360p'];
    const MAX_SIZE = 1.5 * 1024 * 1024 * 1024;

    let selectedQuality = null;
    let estimatedSize = 0;

    // Iterate from highest to lowest quality until size is under limit
    for (const q of qualities) {
        try {
            console.log(`🔎 Checking quality ${q}...`);

            const info = await getVideoInfo(url, q, hasCookies, cookiesPath);

            let size = info.filesize || info.filesize_approx || 0;

            if (!size && info.requested_formats) {
                size = info.requested_formats.reduce(
                    (s, f) => s + (f.filesize || f.filesize_approx || 0),
                    0
                );
            }

            console.log(`📊 Estimated size: ${formatSize(size)}`);

            if (size && size > MAX_SIZE) {
                console.log('⚠️ Size exceeds 1.5GB, trying lower quality\n');
                continue;
            }

            selectedQuality = q;
            estimatedSize = size;
            break;

        } catch (err) {
            console.log(`❌ Failed checking ${q}: ${err.message}\n`);
        }
    }

    if (!selectedQuality) {
        console.error('❌ No quality under 1.5GB found');
        process.exit(1);
    }

    console.log(`\n✅ Selected quality: ${selectedQuality}`);
    console.log(`📦 Estimated size: ${formatSize(estimatedSize)}`);
    console.log('⬇️  Starting download...\n');

    const ytdlp = new YtDlp();
    const outputTemplate = path.join(outDir, '%(title)s.%(ext)s');

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
                process.stdout.write(`\r📊 ${p.percentage_str} - ${p.speed || ''} - ETA: ${p.eta || ''}`);
            }
        });

    if (hasCookies) {
        builder.addArgs('--cookies', cookiesPath);
    } else {
        builder.addArgs('--extractor-args', 'youtube:player_client=android');
    }

    try {
        const result = await builder.run();
        console.log('\n✅ Download successful');
        console.log(`📂 Files: ${result.filePaths.join(', ')}`);
    } catch (err) {
        console.error(`\n❌ Download failed: ${err.message}`);
        process.exit(1);
    }
}

main().catch(err => {
    console.error(`❌ Fatal error: ${err.message}`);
    process.exit(1);
});
