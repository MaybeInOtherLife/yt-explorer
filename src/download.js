const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

function extractVideoId(input) {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
        /^([a-zA-Z0-9_-]{11})$/
    ];

    for (const p of patterns) {
        const m = input.match(p);
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

async function downloadVideo(url, outDir, quality, hasCookies, cookiesPath) {
    const height = quality.replace('p', '');

    const args = [
        '--no-playlist',
        '-f',
        `bestvideo[height<=${height}]+bestaudio/best[height<=${height}]`,
        '--merge-output-format', 'mp4',
        '--embed-metadata',
        '--embed-thumbnail',
        '--write-thumbnail',
        '--convert-thumbnails', 'jpg',
        '--output',
        path.join(outDir, '%(title)s.%(ext)s'),
        '--newline',
        url
    ];

    if (hasCookies) {
        args.push('--cookies', cookiesPath);
    } else {
        args.push('--extractor-args', 'youtube:player_client=android');
    }

    return new Promise((resolve, reject) => {
        const proc = execFile('yt-dlp', args);

        proc.stdout.on('data', d => process.stdout.write(d));
        proc.stderr.on('data', d => process.stderr.write(d));

        proc.on('close', code => {
            if (code === 0) resolve();
            else reject(new Error(`yt-dlp exited with code ${code}`));
        });
    });
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
    const hasCookies =
        fs.existsSync(cookiesPath) &&
        fs.statSync(cookiesPath).size > 0;

    console.log(hasCookies ? '🍪 Using cookies\n' : '⚠️ Using android client\n');

    const qualities = ['1080p', '720p', '480p', '360p'];
    const MAX_SIZE = 1.5 * 1024 * 1024 * 1024;

    let selectedQuality = null;

    for (const q of qualities) {
        try {
            console.log(`🔎 Checking ${q}...`);

            const info = await getVideoInfo(url, q, hasCookies, cookiesPath);

            let size = info.filesize || info.filesize_approx || 0;

            if (!size && info.requested_formats) {
                size = info.requested_formats.reduce(
                    (s, f) => s + (f.filesize || f.filesize_approx || 0),
                    0
                );
            }

            console.log(`📊 Size: ${formatSize(size)}`);

            if (size && size > MAX_SIZE) {
                console.log('⚠️ Too large, trying lower quality\n');
                continue;
            }

            selectedQuality = q;
            break;

        } catch (err) {
            console.log(`❌ Failed for ${q}: ${err.message}\n`);
        }
    }

    if (!selectedQuality) {
        console.error('❌ No quality under 1.5GB found');
        process.exit(1);
    }

    console.log(`✅ Selected quality: ${selectedQuality}\n`);
    console.log('⬇️ Starting download...\n');

    await downloadVideo(url, outDir, selectedQuality, hasCookies, cookiesPath);

    console.log('\n✅ Download completed');
}

main().catch(err => {
    console.error(`❌ Error: ${err.message}`);
    process.exit(1);
});
