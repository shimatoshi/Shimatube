const express = require('express');
const cors = require('cors');
const yts = require('yt-search');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const app = express();
app.use(cors());

app.get('/api/search', async (req, res) => {
  try {
    const query = req.query.q;
    const r = await yts(query);
    const videos = r.videos
      .filter(v => v.seconds > 60)
      .map(v => ({
        videoId: v.videoId,
        title: v.title,
        thumbnail: v.thumbnail,
        timestamp: v.timestamp,
        author: v.author,
        views: v.views
      }));
    res.json(videos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/watch', async (req, res) => {
  const videoId = req.query.id;
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  
  console.log(`Analyzing: ${videoId}`);

  try {
    // 動画(mp4)と音声(m4a)を確実に取得
    const [videoResult, audioResult] = await Promise.all([
      execPromise(`yt-dlp -g -f "best[ext=mp4]" "${url}"`).catch(e => ({ stdout: '' })),
      execPromise(`yt-dlp -g -f "bestaudio[ext=m4a]" "${url}"`).catch(e => ({ stdout: '' }))
    ]);

    const videoUrl = videoResult.stdout ? videoResult.stdout.trim() : null;
    const audioUrl = audioResult.stdout ? audioResult.stdout.trim() : null;

    if (!videoUrl) {
      throw new Error('YouTubeからURLを取得できませんでした。');
    }

    res.json({
      videoUrl: videoUrl,
      audioUrl: audioUrl || videoUrl, 
      title: 'video'
    });

  } catch (error) {
    console.error(`Analysis error: ${error.message}`);
    res.status(500).json({ error: '動画の解析に失敗しました' });
  }
});

const PORT = 4000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
