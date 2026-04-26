// src/clean.js
const fs = require('fs');
const path = require('path');

const dataDir = path.join('data', 'search_results');

console.log('🗑️ Cleaning data directory...');

try {
    if (fs.existsSync(dataDir)) {
        // حذف کامل پوشه و محتویات
        fs.rmSync(dataDir, { recursive: true, force: true });
        console.log(`✅ Deleted: ${dataDir}`);

        // ساخت مجدد پوشه خالی
        fs.mkdirSync(dataDir, { recursive: true });
        console.log(`📁 Recreated empty directory: ${dataDir}`);
    } else {
        console.log('⚠️ Directory does not exist, nothing to clean');
    }

    console.log('✨ Cleanup completed!');
} catch (error) {
    console.error('❌ Error during cleanup:', error.message);
    process.exit(1);
}
