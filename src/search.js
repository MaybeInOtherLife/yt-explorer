const yts = require('youtube-sr').default;
const fs = require('fs');

async function searchAndSave(query) {
    const results = await yts.search(query, { limit: 20 });

    const data = results.map(v => ({
        title: v.title,
        channel: v.channel.name,
        duration: v.durationFormatted,
        views: v.views,
        uploadedAt: v.uploadedAt,
        url: v.url,
        thumbnail: v.thumbnail.url
    }));

    fs.writeFileSync(`results_${query.replace(" ","_")}.json`, JSON.stringify(data, null, 2));
    console.log('results saved!');
}

searchAndSave('nodejs tutorial');
