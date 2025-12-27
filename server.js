const express = require('express');
const cors = require('cors');
const yts = require('yt-search');
const https = require('https');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const app = express();
app.use(cors());

// --- 1. 検索API ---
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

// --- 2. チャンネル動画一覧取得API (軽量・安定版) ---
app.get('/api/channel', async (req, res) => {
  const channelUrl = req.query.url;
  if (!channelUrl) return res.status(400).json({ error: 'No channel URL' });

  try {
    // 変更: クラッシュ対策のため、JSONではなくテキストデータとして軽量に取得
    const cmd = `yt-dlp --flat-playlist --print "%(id)s\t%(title)s\t%(duration_string)s\t%(uploader)s" --playlist-end 20 "${channelUrl}"`;
    
    const { stdout } = await execPromise(cmd);
    
    // 行ごとに分割して処理
    const videos = stdout.trim().split('\n').filter(line => line).map(line => {
      const parts = line.split('\t');
      if (parts.length < 2) return null; // データ欠損行は無視
      
      const id = parts[0];
      return {
        videoId: id,
        title: parts[1] || 'No Title',
        // flat-playlistではサムネが取れないので推測して生成
        thumbnail: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`, 
        timestamp: parts[2] || '0:00',
        author: { name: parts[3] || 'Channel', url: channelUrl },
        views: '' 
      };
    }).filter(v => v);

    res.json(videos);
  } catch (err) {
    console.error('Channel fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch channel videos' });
  }
});

// --- 3. 再生URL解析API ---
app.get('/api/watch', async (req, res) => {
  const videoId = req.query.id;
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  
  console.log(`Analyzing: ${videoId}`);
  try {
    const [videoResult, audioResult] = await Promise.all([
      execPromise(`yt-dlp -g -f "best[ext=mp4]" "${url}"`).catch(e => ({ stdout: '' })),
      execPromise(`yt-dlp -g -f "bestaudio[ext=m4a]" "${url}"`).catch(e => ({ stdout: '' }))
    ]);

    const videoUrl = videoResult.stdout ? videoResult.stdout.trim() : null;
    const audioUrl = audioResult.stdout ? audioResult.stdout.trim() : null;

    if (!videoUrl) throw new Error('Failed to get URL');

    res.json({
      videoUrl: videoUrl,
      audioUrl: audioUrl || videoUrl,
      title: 'video'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Analysis failed' });
  }
});

// --- 4. プロキシAPI (ダウンロード用) ---
app.get('/api/proxy', (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send('No URL');

  https.get(targetUrl, (stream) => {
    res.writeHead(stream.statusCode, stream.headers);
    stream.pipe(res);
  }).on('error', (err) => {
    console.error('Proxy Error:', err);
    res.status(500).send('Proxy Error');
  });
});

const PORT = 4000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

