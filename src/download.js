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

async function main() {
    const input = process.argv[2];
    if (!input) {
        console.error('❌ لینک یا ID ویدیو را وارد کنید');
        process.exit(1);
    }

    const videoId = extractVideoId(input);
    if (!videoId) {
        console.error('❌ لینک یا ID نامعتبر است');
        process.exit(1);
    }

    const url = `https://youtube.com/watch?v=${videoId}`;
    const outDir = path.join('data', videoId);
    fs.mkdirSync(outDir, { recursive: true });

    console.log(`📹 Video ID: ${videoId}`);
    console.log(`🔗 URL: ${url}`);
    console.log(`📁 پوشه: ${outDir}\n`);

    const ytdlp = new YtDlp();

    const cookiesPath = path.join(__dirname, '..', 'cookies.txt');
    const hasCookies = fs.existsSync(cookiesPath) && fs.statSync(cookiesPath).size > 0;

    console.log('⬇️  شروع دانلود ویدیو...');

    const qualities = ['720p', '480p', '360p'];
    let success = false;

    for (const q of qualities) {
        try {
            console.log(`🎬 تلاش با کیفیت ${q}...`);

            const outputTemplate = path.join(outDir, '%(title)s.%(ext)s');

            const builder = ytdlp
                .download(url)
                .filter('mergevideo')
                .quality(q)
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
                console.log('🍪 استفاده از فایل کوکی');
                builder.addArgs('--cookies', cookiesPath);
            } else {
                console.log('🤖 استفاده از player_client=android');
                builder.addArgs('--extractor-args', 'youtube:player_client=android');
            }

            const result = await builder.run();

            console.log('\n✅ دانلود ویدیو موفق');
            console.log(`📂 فایل: ${result.filePaths.join(', ')}\n`);
            success = true;
            break;
        } catch (err) {
            console.log(`\n❌ خطا با کیفیت ${q}: ${err.message}`);
        }
    }

    if (!success) {
        console.error('\n❌ دانلود ویدیو با تمام کیفیت‌ها ناموفق بود');
        process.exit(1);
    }

    console.log(`✅ دانلود کامل شد → ${outDir}`);
}

main().catch(err => {
    console.error('❌ خطای کلی:', err.message);
    process.exit(1);
});
