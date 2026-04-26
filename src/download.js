// src/download.js
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// استخراج ID ویدیو از URL یا ID خام
function extractVideoId(url) {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
        /^([a-zA-Z0-9_-]{11})$/ // فقط ID
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }

    return null;
}

// آرگومان خط فرمان
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
        // بررسی نصب بودن yt-dlp
        try {
            await execAsync('yt-dlp --version');
        } catch (error) {
            console.error('❌ yt-dlp نصب نیست. لطفاً ابتدا آن را نصب کنید.');
            console.error('نصب: pip install yt-dlp');
            process.exit(1);
        }

        // ساخت پوشه مقصد
        const videoDir = path.join('data', videoId);
        fs.mkdirSync(videoDir, { recursive: true });
        console.log(`📁 پوشه ایجاد شد: ${videoDir}`);

        console.log('⬇️ در حال دانلود ویدیو با محدودیت تقریبی 500MB...');

        const outputPath = path.join(videoDir, '%(title)s.%(ext)s');

        /*
          منطق انتخاب کیفیت:
          - اولویت ۱: بهترین video+audio زیر 500MB (MP4)
          - اگر نبود:
            - بهترین video+audio با رزولوشن ≤1080p زیر 500MB
            - بعد ≤720p زیر 500MB
            - بعد ≤480p زیر 500MB
            - بعد هر کیفیتی که زیر 500MB باشد
          - اگر هیچ‌کدام زیر 500MB نبود:
            - 720p (در صورت وجود)
            - در نهایت بهترین کیفیت موجود
        */
        const formatSelector =
            'bestvideo[filesize<500M][ext=mp4]+bestaudio[ext=m4a]/' +
            'bestvideo[height<=1080][filesize<500M]+bestaudio/' +
            'bestvideo[height<=720][filesize<500M]+bestaudio/' +
            'bestvideo[height<=480][filesize<500M]+bestaudio/' +
            'best[filesize<500M]/' +
            'bestvideo[height<=720]+bestaudio/' +
            'best';

        const downloadCommand =
            `yt-dlp -f "${formatSelector}" ` +
            `--merge-output-format mp4 ` +
            `-o "${outputPath}" "https://youtube.com/watch?v=${videoId}"`;

        const { stdout: downloadOutput } = await execAsync(downloadCommand, {
            maxBuffer: 1024 * 1024 * 10
        });

        console.log(downloadOutput);

        // بررسی حجم فایل نهایی
        const files = fs.readdirSync(videoDir).filter(f => f.endsWith('.mp4'));
        if (files.length > 0) {
            const videoFile = path.join(videoDir, files[0]);
            const stats = fs.statSync(videoFile);
            const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
            console.log(`📦 حجم فایل دانلود شده: ${sizeMB} MB`);

            if (stats.size > 500 * 1024 * 1024) {
                console.log('⚠️ هشدار: با وجود تلاش برای محدود کردن، حجم نهایی بیشتر از 500MB شده است.');
            } else {
                console.log('✅ حجم فایل در محدوده تقریبی 500MB است.');
            }
        } else {
            console.warn('⚠️ هیچ فایل MP4 در پوشه خروجی پیدا نشد.');
        }

        // دانلود متادیتا
        console.log('📝 در حال دانلود اطلاعات ویدیو (metadata)...');
        const metadataBase = path.join(videoDir, 'info');
        await execAsync(
            `yt-dlp --write-info-json --skip-download -o "${metadataBase}" "https://youtube.com/watch?v=${videoId}"`
        );
        console.log(`✅ متادیتا ذخیره شد: ${metadataBase}.info.json`);

        // دانلود تامبنیل
        console.log('🖼️ در حال دانلود تامبنیل...');
        const thumbBase = path.join(videoDir, 'thumbnail');
        await execAsync(
            `yt-dlp --write-thumbnail --skip-download --convert-thumbnails png -o "${thumbBase}" "https://youtube.com/watch?v=${videoId}"`
        );

        const thumbFiles = fs
            .readdirSync(videoDir)
            .filter(f => f.startsWith('thumbnail') && f.endsWith('.png'));
        if (thumbFiles.length > 0) {
            console.log(`✅ تامبنیل ذخیره شد: ${thumbFiles[0]}`);
        } else {
            console.warn('⚠️ تامبنیل PNG پیدا نشد.');
        }

        console.log('\n✅ دانلود با موفقیت انجام شد!');
        console.log(`📂 مسیر ذخیره‌سازی: ${videoDir}`);
    } catch (error) {
        console.error('❌ خطا در دانلود:', error.message || error);
        process.exit(1);
    }
})();
