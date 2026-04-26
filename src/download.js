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

        // بررسی وجود فایل کوکی
        const cookiesPath = path.join(process.cwd(), 'cookies.txt');
        let cookiesArg = '';

        if (fs.existsSync(cookiesPath)) {
            console.log('🍪 استفاده از کوکی‌ها برای احراز هویت');
            cookiesArg = `--cookies "${cookiesPath}"`;
        } else {
            console.log('⚠️ فایل کوکی یافت نشد، دانلود بدون احراز هویت');
        }

        console.log('⬇️ در حال دانلود ویدیو...');

        const outputPath = path.join(videoDir, '%(title)s.%(ext)s');

        // استفاده از client اندروید + تنظیمات بهینه
        const downloadCommand =
            `yt-dlp ` +
            `${cookiesArg} ` +
            `--extractor-args "youtube:player_client=android" ` +
            `-f "best[height<=720][ext=mp4]/bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720]/best" ` +
            `--merge-output-format mp4 ` +
            `--no-check-certificates ` +
            `-o "${outputPath}" "https://youtube.com/watch?v=${videoId}"`;

        const { stdout: downloadOutput } = await execAsync(downloadCommand, {
            maxBuffer: 1024 * 1024 * 10
        });

        console.log(downloadOutput);

        const files = fs.readdirSync(videoDir).filter(f => f.endsWith('.mp4'));
        if (files.length > 0) {
            const videoFile = path.join(videoDir, files[0]);
            const stats = fs.statSync(videoFile);
            const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
            console.log(`📦 حجم فایل: ${sizeMB} MB`);
        }

        console.log('📝 دانلود متادیتا...');
        await execAsync(
            `yt-dlp --extractor-args "youtube:player_client=android" --write-info-json --skip-download -o "${path.join(videoDir, 'info')}" "https://youtube.com/watch?v=${videoId}"`
        );
        console.log('✅ متادیتا ذخیره شد');

        console.log('🖼️ دانلود تامبنیل...');
        await execAsync(
            `yt-dlp --extractor-args "youtube:player_client=android" --write-thumbnail --skip-download --convert-thumbnails png -o "${path.join(videoDir, 'thumbnail')}" "https://youtube.com/watch?v=${videoId}"`
        );

        const thumbFiles = fs.readdirSync(videoDir).filter(f => f.startsWith('thumbnail') && f.endsWith('.png'));
        if (thumbFiles.length > 0) {
            console.log(`✅ تامبنیل: ${thumbFiles[0]}`);
        }

        console.log('\n✅ دانلود کامل شد!');
        console.log(`📂 مسیر: ${videoDir}`);
    } catch (error) {
        console.error('❌ خطا:', error.message);
        process.exit(1);
    }
})();
