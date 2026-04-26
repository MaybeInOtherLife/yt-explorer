// src/download.js
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

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

console.log(`📹 Video ID: ${videoId}`);
console.log(`🔗 URL: https://youtube.com/watch?v=${videoId}`);

(async () => {
    try {
        try {
            await execAsync('yt-dlp --version');
        } catch (error) {
            console.error('❌ yt-dlp نصب نیست. نصب: pip install -U yt-dlp');
            process.exit(1);
        }

        const videoDir = path.join('data', videoId);
        fs.mkdirSync(videoDir, { recursive: true });
        console.log(`📁 پوشه ایجاد شد: ${videoDir}`);

        console.log('⬇️ در حال دانلود ویدیو...');

        const outputDir = path.join('data', videoId);
        fs.mkdirSync(outputDir, { recursive: true });

        // بررسی وجود کوکی
        const cookiesPath = path.join(__dirname, '..', 'cookies.txt');
        const hasCookies = fs.existsSync(cookiesPath);

// ساخت دستور yt-dlp
        let ytDlpCmd = `yt-dlp `;

        if (hasCookies) {
            console.log('🍪 استفاده از کوکی برای احراز هویت');
            ytDlpCmd += `--cookies "${cookiesPath}" `;
        } else {
            console.log('⚠️  بدون کوکی - استفاده از client اندروید');
            ytDlpCmd += `--extractor-args "youtube:player_client=android" `;
        }

// فرمت ساده‌تر - اول 720p بعد 480p بعد هرچی موجوده
        ytDlpCmd += `-f "bv*[height<=720]+ba/b[height<=720]/bv*[height<=480]+ba/b[height<=480]/bv*+ba/b" `;
        ytDlpCmd += `--merge-output-format mp4 `;
        ytDlpCmd += `-o "${outputDir}/%(title)s.%(ext)s" `;
        ytDlpCmd += `"https://youtube.com/watch?v=${videoId}"`;

        try {
            execSync(ytDlpCmd, { stdio: 'inherit' });
            console.log('✅ دانلود ویدیو موفق');
        } catch (error) {
            console.error('❌ خطا در دانلود ویدیو:', error.message);
            process.exit(1);
        }

// دانلود متادیتا
        console.log('📄 دانلود متادیتا...');
        const metadataCmd = hasCookies
            ? `yt-dlp --cookies "${cookiesPath}" --write-info-json --skip-download -o "${outputDir}/info" "https://youtube.com/watch?v=${videoId}"`
            : `yt-dlp --extractor-args "youtube:player_client=android" --write-info-json --skip-download -o "${outputDir}/info" "https://youtube.com/watch?v=${videoId}"`;

        await execAsync(metadataCmd);
        console.log('✅ متادیتا ذخیره شد');

        console.log('🖼️  دانلود تامبنیل...');
        const thumbnailCmd = hasCookies
            ? `yt-dlp --cookies "${cookiesPath}" --write-thumbnail --skip-download --convert-thumbnails jpg -o "${outputDir}/thumbnail" "https://youtube.com/watch?v=${videoId}"`
            : `yt-dlp --extractor-args "youtube:player_client=android" --write-thumbnail --skip-download --convert-thumbnails jpg -o "${outputDir}/thumbnail" "https://youtube.com/watch?v=${videoId}"`;

        try {
            execSync(thumbnailCmd, { stdio: 'inherit' });
            console.log('✅ تامبنیل ذخیره شد');
        } catch (error) {
            console.warn('⚠️  خطا در دانلود تامبنیل:', error.message);
        }

        console.log('\n✅ دانلود کامل شد!');
        console.log(`📂 مسیر: ${videoDir}`);
    } catch (error) {
        console.error('❌ خطا:', error.message);
        process.exit(1);
    }
})();
