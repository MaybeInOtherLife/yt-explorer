const yts = require('youtube-sr').default;
const fs = require('fs');
const path = require('path');
const https = require('https');

function downloadImage(url, filepath) {
    return new Promise((resolve, reject) => {
        https.get(url, (response) => {
            if (response.statusCode === 200) {
                const fileStream = fs.createWriteStream(filepath);
                response.pipe(fileStream);
                fileStream.on('finish', () => {
                    fileStream.close();
                    resolve();
                });
            } else {
                reject(new Error(`Failed to download: ${response.statusCode}`));
            }
        }).on('error', reject);
    });
}

async function searchAndSave(query) {
    if (!query) {
        console.error('No Query!');
        process.exit(1);
    }

    let results
    if (query.startsWith("playlist=")){
        results = (await yts.getPlaylist(query.replace("playlist=",""),{limit: 100})).videos;
    }else{
        results = await yts.search(query, { limit: 30 });
    }
    const safeName = query.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '_').substring(0, 50);
    const dir = path.join(process.cwd(), 'data', 'search_results', safeName);
    fs.mkdirSync(dir, { recursive: true });

    const videos = [];

    for (let i = 0; i < results.length; i++) {
        const v = results[i];
        const thumbFilename = `thumb${i + 1}.png`;
        const thumbPath = path.join(dir, thumbFilename);

        if (v.thumbnail?.url) {
            try {
                await downloadImage(v.thumbnail.url, thumbPath);
                console.log(`Downloaded: ${thumbFilename}`);
            } catch (err) {
                console.error(`Failed to download thumbnail ${i + 1}:`, err.message);
            }
        }

        videos.push({
            title: v.title,
            channel: v.channel?.name,
            duration: v.durationFormatted,
            views: v.views,
            uploadedAt: v.uploadedAt,
            url: v.url,
            thumbnail: thumbFilename
        });
    }

    const data = {
        query,
        searchedAt: new Date().toISOString(),
        count: videos.length,
        videos
    };

    const jsonPath = path.join(dir, 'result.json');
    fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`Results saved to: ${jsonPath}`);
}

const query = process.argv[2];
searchAndSave(query);
