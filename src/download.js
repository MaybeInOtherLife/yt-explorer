const fs = require('fs');
const path = require('path');
const { spawnSync, execSync } = require('child_process');

function extractVideoId(url) {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
        /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
        /^([a-zA-Z0-9_-]{11})$/
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }

    return null;
}

function runYtDlp(args, options = {}) {
    return spawnSync('yt-dlp', args, {
        encoding: 'utf8',
        stdio: options.stdio || ['ignore', 'pipe', 'pipe'],
        ...options
    });
}

function checkYtDlpInstalled() {
    const result = runYtDlp(['--version']);

    if (result.error || result.status !== 0) {
        console.error('❌ yt-dlp نصب نیست یا در PATH قرار ندارد.');
        console.error('نصب یا آپدیت:');
        console.error('pip install -U yt-dlp');
        process.exit(1);
    }

    console.log(`✅ yt-dlp version: ${result.stdout.trim()}`);
}

function buildCommonArgs({ hasCookies, cookiesPath, client }) {
    const args = [];

    if (hasCookies) {
        args.push('--cookies', cookiesPath);
    }

    if (client) {
        args.push('--extractor-args', `youtube:player_client=${client}`);
    }

    return args;
}

function getVideoInfo({ url, hasCookies, cookiesPath, client }) {
    const args = [
        ...buildCommonArgs({ hasCookies, cookiesPath, client }),
        '--dump-json',
        '--skip-download',
        '--no-warnings',
        url
    ];

    const result = runYtDlp(args);

    if (result.status !== 0) {
        return {
            ok: false,
            error: result.stderr || result.stdout || 'Unknown error'
        };
    }

    try {
        const info = JSON.parse(result.stdout);
        return {
            ok: true,
            info
        };
    } catch (error) {
        return {
            ok: false,
            error: `خطا در parse کردن JSON: ${error.message}`
        };
    }
}

function isRealVideoFormat(format) {
    return format &&
        format.format_id &&
        format.vcodec &&
        format.vcodec !== 'none' &&
        format.ext !== 'mhtml' &&
        format.protocol !== 'mhtml';
}

function isAudioFormat(format) {
    return format &&
        format.format_id &&
        format.acodec &&
        format.acodec !== 'none' &&
        (!format.vcodec || format.vcodec === 'none');
}

function isProgressiveFormat(format) {
    return format &&
        format.format_id &&
        format.vcodec &&
        format.vcodec !== 'none' &&
        format.acodec &&
        format.acodec !== 'none';
}

function scoreVideo(format) {
    const height = format.height || 0;
    const tbr = format.tbr || 0;
    const fps = format.fps || 0;

    let score = 0;

    // اولویت با رزولوشن
    score += height * 100000;

    // بعد bitrate
    score += tbr * 100;

    // بعد fps
    score += fps;

    // MP4/H264 معمولا سازگارتر است
    if (format.ext === 'mp4') score += 500000;
    if (format.vcodec && format.vcodec.startsWith('avc1')) score += 300000;

    return score;
}

function scoreAudio(format) {
    const abr = format.abr || 0;
    const tbr = format.tbr || 0;

    let score = 0;

    score += abr * 1000;
    score += tbr * 100;

    // m4a معمولا برای merge به mp4 مناسب‌تر است
    if (format.ext === 'm4a') score += 50000;
    if (format.acodec && format.acodec.includes('mp4a')) score += 30000;

    return score;
}

function pickBestFormat(info, maxHeight = 720) {
    const formats = Array.isArray(info.formats) ? info.formats : [];

    const realVideos = formats.filter(isRealVideoFormat);
    const audios = formats.filter(isAudioFormat);
    const progressive = formats.filter(isProgressiveFormat);

    if (realVideos.length === 0 && progressive.length === 0) {
        return {
            ok: false,
            reason: 'هیچ فرمت ویدیویی واقعی پیدا نشد. احتمالا مشکل n challenge یا محدودیت ویدیو وجود دارد.'
        };
    }

    console.log('\n📋 فرمت‌های ویدیویی پیدا شده:');

    const printableVideos = [...realVideos, ...progressive]
        .filter((f, index, arr) => arr.findIndex(x => x.format_id === f.format_id) === index)
        .sort((a, b) => {
            const ah = a.height || 0;
            const bh = b.height || 0;
            return bh - ah;
        });

    for (const f of printableVideos) {
        console.log(
            `- id=${f.format_id} | ext=${f.ext} | height=${f.height || '-'} | fps=${f.fps || '-'} | vcodec=${f.vcodec || '-'} | acodec=${f.acodec || '-'} | tbr=${f.tbr || '-'}`
        );
    }

    console.log('\n🎧 فرمت‌های صوتی پیدا شده:');

    for (const f of audios.sort((a, b) => scoreAudio(b) - scoreAudio(a)).slice(0, 10)) {
        console.log(
            `- id=${f.format_id} | ext=${f.ext} | acodec=${f.acodec || '-'} | abr=${f.abr || '-'} | tbr=${f.tbr || '-'}`
        );
    }

    // 1. بهترین video-only mp4 تا 720
    let candidateVideos = realVideos.filter(f =>
        f.height &&
        f.height <= maxHeight &&
        f.ext === 'mp4'
    );

    if (candidateVideos.length === 0) {
        // 2. بهترین video-only هر فرمتی تا 720
        candidateVideos = realVideos.filter(f =>
            f.height &&
            f.height <= maxHeight
        );
    }

    if (candidateVideos.length > 0 && audios.length > 0) {
        const bestVideo = candidateVideos.sort((a, b) => scoreVideo(b) - scoreVideo(a))[0];
        const bestAudio = audios.sort((a, b) => scoreAudio(b) - scoreAudio(a))[0];

        return {
            ok: true,
            type: 'video+audio',
            format: `${bestVideo.format_id}+${bestAudio.format_id}`,
            video: bestVideo,
            audio: bestAudio,
            description: `ویدیو جدا + صدا جدا: ${bestVideo.format_id}+${bestAudio.format_id}`
        };
    }

    // 3. بهترین progressive تا 720
    let progressiveCandidates = progressive.filter(f =>
        f.height &&
        f.height <= maxHeight
    );

    if (progressiveCandidates.length === 0) {
        progressiveCandidates = progressive;
    }

    if (progressiveCandidates.length > 0) {
        const bestProgressive = progressiveCandidates.sort((a, b) => scoreVideo(b) - scoreVideo(a))[0];

        return {
            ok: true,
            type: 'progressive',
            format: bestProgressive.format_id,
            video: bestProgressive,
            audio: null,
            description: `فرمت progressive: ${bestProgressive.format_id}`
        };
    }

    // 4. fallback نهایی
    if (realVideos.length > 0) {
        const bestVideo = realVideos.sort((a, b) => scoreVideo(b) - scoreVideo(a))[0];

        if (audios.length > 0) {
            const bestAudio = audios.sort((a, b) => scoreAudio(b) - scoreAudio(a))[0];

            return {
                ok: true,
                type: 'fallback-video+audio',
                format: `${bestVideo.format_id}+${bestAudio.format_id}`,
                video: bestVideo,
                audio: bestAudio,
                description: `fallback ویدیو + صدا: ${bestVideo.format_id}+${bestAudio.format_id}`
            };
        }

        return {
            ok: true,
            type: 'fallback-video-only',
            format: bestVideo.format_id,
            video: bestVideo,
            audio: null,
            description: `fallback فقط ویدیو: ${bestVideo.format_id}`
        };
    }

    return {
        ok: false,
        reason: 'فرمت قابل دانلود مناسب پیدا نشد.'
    };
}

function downloadVideo({ url, outputDir, format, hasCookies, cookiesPath, client }) {
    const args = [
        ...buildCommonArgs({ hasCookies, cookiesPath, client }),

        '-f',
        format,

        '--merge-output-format',
        'mp4',

        '-o',
        path.join(outputDir, '%(title)s.%(ext)s'),

        url
    ];

    console.log('\n⬇️ در حال دانلود...');
    console.log(`🎯 فرمت انتخاب‌شده: ${format}`);

    const result = runYtDlp(args, {
        stdio: 'inherit'
    });

    return result.status === 0;
}

function downloadMetadata({ url, outputDir, hasCookies, cookiesPath, client }) {
    const args = [
        ...buildCommonArgs({ hasCookies, cookiesPath, client }),

        '--write-info-json',
        '--skip-download',

        '-o',
        path.join(outputDir, 'info'),

        url
    ];

    console.log('\n📄 دانلود متادیتا...');

    const result = runYtDlp(args, {
        stdio: 'inherit'
    });

    return result.status === 0;
}

// -------------------------
// Main
// -------------------------

const videoUrl = process.argv[2];

if (!videoUrl) {
    console.error('❌ خطا: لطفاً لینک یا ID ویدیو یوتیوب را وارد کنید');
    process.exit(1);
}

const videoId = extractVideoId(videoUrl);

if (!videoId) {
    console.error('❌ خطا: لینک یا ID نامعتبر است');
    process.exit(1);
}

const youtubeUrl = `https://youtube.com/watch?v=${videoId}`;

console.log(`📹 Video ID: ${videoId}`);
console.log(`🔗 URL: ${youtubeUrl}`);

checkYtDlpInstalled();

const outputDir = path.join('data', videoId);
fs.mkdirSync(outputDir, { recursive: true });

console.log(`📁 پوشه خروجی: ${outputDir}`);

const cookiesPath = path.join(__dirname, '..', 'cookies.txt');
const hasCookies = fs.existsSync(cookiesPath);

if (hasCookies) {
    console.log(`🍪 cookies.txt پیدا شد: ${cookiesPath}`);
} else {
    console.log('⚠️ cookies.txt پیدا نشد. بدون کوکی ادامه می‌دهیم.');
}

const clients = hasCookies
    ? ['web', 'mweb', 'android', 'ios']
    : ['mweb', 'android', 'ios', 'web'];

let success = false;
let lastError = null;

for (const client of clients) {
    console.log('\n-----------------------------------');
    console.log(`🔍 تلاش با client: ${client}`);
    console.log('-----------------------------------');

    const infoResult = getVideoInfo({
        url: youtubeUrl,
        hasCookies,
        cookiesPath,
        client
    });

    if (!infoResult.ok) {
        console.warn(`⚠️ گرفتن اطلاعات با client=${client} ناموفق بود.`);
        console.warn(infoResult.error);
        lastError = infoResult.error;
        continue;
    }

    const picked = pickBestFormat(infoResult.info, 720);

    if (!picked.ok) {
        console.warn(`⚠️ انتخاب فرمت با client=${client} ناموفق بود.`);
        console.warn(picked.reason);
        lastError = picked.reason;
        continue;
    }

    console.log('\n✅ فرمت مناسب انتخاب شد');
    console.log(`🧩 نوع: ${picked.type}`);
    console.log(`🎯 format: ${picked.format}`);
    console.log(`📝 توضیح: ${picked.description}`);

    if (picked.video) {
        console.log(
            `🎬 Video: id=${picked.video.format_id}, ext=${picked.video.ext}, height=${picked.video.height || '-'}, vcodec=${picked.video.vcodec || '-'}`
        );
    }

    if (picked.audio) {
        console.log(
            `🎧 Audio: id=${picked.audio.format_id}, ext=${picked.audio.ext}, acodec=${picked.audio.acodec || '-'}, abr=${picked.audio.abr || '-'}`
        );
    }

    const downloaded = downloadVideo({
        url: youtubeUrl,
        outputDir,
        format: picked.format,
        hasCookies,
        cookiesPath,
        client
    });

    if (!downloaded) {
        console.warn(`⚠️ دانلود با client=${client} شکست خورد.`);
        lastError = `Download failed with client=${client}`;
        continue;
    }

    console.log('✅ دانلود ویدیو موفق بود');

    const metadataOk = downloadMetadata({
        url: youtubeUrl,
        outputDir,
        hasCookies,
        cookiesPath,
        client
    });

    if (metadataOk) {
        console.log('✅ متادیتا ذخیره شد');
    } else {
        console.warn('⚠️ ذخیره متادیتا ناموفق بود، ولی ویدیو دانلود شده است.');
    }

    success = true;
    break;
}

if (!success) {
    console.error('\n❌ دانلود با همه clientها ناموفق بود.');

    if (lastError) {
        console.error('\nآخرین خطا:');
        console.error(lastError);
    }

    console.error('\n💡 پیشنهادها:');
    console.error('1) yt-dlp را آپدیت کن:');
    console.error('   yt-dlp -U');
    console.error('');
    console.error('2) اگر با pip نصب شده:');
    console.error('   pip install -U yt-dlp');
    console.error('');
    console.error('3) ffmpeg را نصب کن.');
    console.error('');
    console.error('4) با کوکی مرورگر تست کن:');
    console.error(`   yt-dlp --cookies-from-browser chrome -F "${youtubeUrl}"`);
    console.error('');
    console.error('5) فرمت‌ها را دستی ببین:');
    console.error(`   yt-dlp -F "${youtubeUrl}"`);

    process.exit(1);
}

console.log('\n✅ عملیات کامل شد');
console.log(`📂 مسیرDir}`);
