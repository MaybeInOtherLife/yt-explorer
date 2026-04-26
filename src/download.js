const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function extractVideoId(url) {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
        /^([a-zA-Z0-9_-]{11})$/
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }

    return null;
}

function runCommand(cmd, options = {}) {
    return execSync(cmd, {
        stdio: 'inherit',
        ...options
    });
}

function tryCommand(cmd) {
    try {
        execSync(cmd, { stdio: 'pipe' });
        return true;
    } catch {
        return false;
    }
}

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

// بررسی نصب yt-dlp
try {
    execSync('yt-dlp --version', { stdio: 'ignore' });
} catch (error) {
    console.error('❌ yt-dlp نصب نیست. نصب: pip install -U yt-dlp');
    process.exit(1);
}

const outputDir = path.join('data', videoId);
fs.mkdirSync(outputDir, { recursive: true });
console.log(`📁 پوشه ایجاد شد: ${outputDir}`);

// بررسی وجود کوکی
const cookiesPath = path.join(__dirname, '..', 'cookies.txt');
const hasCookies = fs.existsSync(cookiesPath);

const clients = hasCookies
    ? ['web', 'mweb', 'android', 'ios']
    : ['mweb', 'android', 'ios', 'web'];

const formatSelector = `bv*[height<=720]+ba/b[height<=720]/bv*+ba/b`;

let downloaded = false;
let lastError = null;

for (const client of clients) {
    console.log(`\n🔍 تست با client: ${client}`);

    let baseCmd = `yt-dlp `;
    if (hasCookies) {
        console.log('🍪 استفاده از کوکی برای احراز هویت');
        baseCmd += `--cookies "${cookiesPath}" `;
    } else {
        console.log('⚠️ بدون کوکی');
    }

    baseCmd += `--extractor-args "youtube:player_client=${client}" `;

    // اول بررسی کنیم آیا فرمت واقعی وجود دارد یا نه
    const listFormatsCmd = `${baseCmd}-F "${youtubeUrl}"`;
    const canListFormats = tryCommand(listFormatsCmd);

    if (!canListFormats) {
        console.log(`⚠️ دریافت فرمت‌ها با client=${client} ناموفق بود`);
        continue;
    }

    console.log(`⬇️ در حال دانلود با client=${client}...`);

    const downloadCmd =
        `${baseCmd}` +
        `-f "${formatSelector}" ` +
        `--merge-output-format mp4 ` +
        `-o "${outputDir}/%(title)s.%(ext)s" ` +
        `"${youtubeUrl}"`;

    try {
        runCommand(downloadCmd);
        console.log(`✅ دانلود ویدیو با client=${client} موفق بود`);
        downloaded = true;

        // دانلود متادیتا
        console.log('📄 دانلود متادیتا...');
        const metadataCmd =
            `${baseCmd}` +
            `--write-info-json --skip-download ` +
            `-o "${outputDir}/info" ` +
            `"${youtubeUrl}"`;

        try {
            runCommand(metadataCmd);
            console.log('✅ متادیتا ذخیره شد');
        } catch (error) {
            console.warn('⚠️ خطا در دانلود متادیتا');
        }

        break;
    } catch (error) {
        lastError = error;
        console.warn(`⚠️ دانلود با client=${client} شکست خورد`);
    }
}

if (!downloaded) {
    console.error('\n❌ دانلود ناموفق بود با همه clientها');
    console.error('💡 پیشنهادها:');
    console.error('1) yt-dlp را آپدیت کن: yt-dlp -U');
    console.error('2) فرمت‌ها را دستی چک کن: yt-dlp -F "URL"');
    console.error('3) با --cookies-from-browser تست کن');
    console.error('4) ffmpeg نصب باشد');
    if (lastError) {
        console.error(`آخرین خطا: ${lastError.message}`);
    }
    process.exit(1);
}

console.log('\n✅ دانلود کامل شد!');
console.log(`📂 مسیر: ${outputDir}`);
