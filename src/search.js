const yts = require('youtube-sr').default;
const fs = require('fs');
const path = require('path');

async function searchAndSave(query) {
    if (!query) {
        console.error('No Query!');
        process.exit(1);
    }

    const results = await yts.search(query, { limit: 10 });

    const data = {
        query,
        searchedAt: new Date().toISOString(),
        count: results.length,
        videos: results.map(v => ({
            title: v.title,
            channel: v.channel?.name,
            duration: v.durationFormatted,
            views: v.views,
            uploadedAt: v.uploadedAt,
            url: v.url,
            thumbnail: v.thumbnail?.url
        }))
    };

    const dir = path.join(process.cwd(), 'data', 'search_results');
    fs.mkdirSync(dir, { recursive: true });

    const safeName = query.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '_').substring(0, 50);
    const timestamp = Date.now();
    const filePath = path.join(dir, `${safeName}_${timestamp}.json`);

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`Results saved to: ${filePath}`);
}

const query = process.argv[2];
searchAndSave(query);
