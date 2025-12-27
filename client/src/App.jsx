import React, { useState, useEffect } from 'react';
import './App.css';

// --- IndexedDB Setup ---
const DB_NAME = 'ShimaTubeDB';
const STORE_VIDEOS = 'offline_videos';
const STORE_PINS = 'pinned_channels'; // 新しいストア
const DB_VERSION = 2; // バージョンアップ

const initDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_VIDEOS)) {
        db.createObjectStore(STORE_VIDEOS, { keyPath: 'videoId' });
      }
      if (!db.objectStoreNames.contains(STORE_PINS)) {
        db.createObjectStore(STORE_PINS, { keyPath: 'url' }); // URLをキーにチャンネル保存
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const API_BASE_URL = '';

function App() {
  const [query, setQuery] = useState('');
  const [videos, setVideos] = useState([]);
  const [currentVideo, setCurrentVideo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState('search'); // 'search' | 'library' | 'channel'
  const [pinnedChannels, setPinnedChannels] = useState([]); // ピン留めリスト
  const [downloadingIds, setDownloadingIds] = useState({});

  // 起動時にピン留めを読み込む
  useEffect(() => {
    loadPins();
  }, []);

  const loadPins = async () => {
    const db = await initDB();
    const tx = db.transaction(STORE_PINS, 'readonly');
    const items = await new Promise(resolve => {
      const req = tx.objectStore(STORE_PINS).getAll();
      req.onsuccess = () => resolve(req.result);
    });
    setPinnedChannels(items);
  };

  // --- 検索機能 ---
  const doSearch = async (searchQuery) => {
    setViewMode('search');
    setLoading(true);
    setVideos([]);
    try {
      const res = await fetch(`${API_BASE_URL}/api/search?q=${searchQuery}`);
      const data = await res.json();
      setVideos(data.filter(v => v.timestamp && !v.timestamp.startsWith('0:'))); // 簡易Shorts除外
      setCurrentVideo(null);
    } catch (err) {
      alert('検索エラー');
    }
    setLoading(false);
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    doSearch(query);
  };

  // --- チャンネル動画一覧機能 ---
  const openChannel = async (author) => {
    if (!author || !author.url) return;
    setViewMode('channel');
    setLoading(true);
    setVideos([]);
    setQuery(`@${author.name}`); // 検索窓に名前を入れておく（UX用）
    
    try {
      // チャンネルURLをエンコードして送信
      const res = await fetch(`${API_BASE_URL}/api/channel?url=${encodeURIComponent(author.url)}`);
      const data = await res.json();
      setVideos(data);
    } catch (err) {
      alert('チャンネル取得エラー');
    }
    setLoading(false);
  };

  // --- ピン留め機能 ---
  const togglePin = async (author) => {
    if (!author || !author.url) return;
    const db = await initDB();
    const tx = db.transaction(STORE_PINS, 'readwrite');
    const store = tx.objectStore(STORE_PINS);
    
    const isPinned = pinnedChannels.some(p => p.url === author.url);
    
    if (isPinned) {
      await store.delete(author.url);
    } else {
      await store.put(author);
    }
    
    // UI更新
    loadPins();
  };

  // --- 再生機能 ---
  const playVideo = async (v) => {
    if (v.blob) {
      const offlineUrl = URL.createObjectURL(v.blob);
      // audioOnlyフラグがあれば音声として扱うなどの拡張可。今回はプレイヤー側で分岐しないが保存時に区別する
      setCurrentVideo({ ...v, videoUrl: offlineUrl, isOffline: true });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/watch?id=${v.videoId}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      
      setCurrentVideo({ 
        ...v, 
        videoUrl: data.videoUrl, 
        audioUrl: data.audioUrl 
      });
    } catch (err) {
      alert('再生エラー');
    }
    setLoading(false);
  };

  // --- 保存機能 (MP4 / M4A 選択) ---
  const saveToLibrary = async (e, video, format) => {
    e.stopPropagation();
    setDownloadingIds(prev => ({ ...prev, [video.videoId]: true }));

    try {
      // 1. URL取得
      let targetUrl = null;
      if (currentVideo && currentVideo.videoId === video.videoId) {
        // 今再生中ならそのURLを使う
        targetUrl = format === 'mp4' ? currentVideo.videoUrl : currentVideo.audioUrl;
      } else {
        // なければ取得しにいく
        const res = await fetch(`${API_BASE_URL}/api/watch?id=${video.videoId}`);
        const data = await res.json();
        targetUrl = format === 'mp4' ? data.videoUrl : data.audioUrl;
      }

      // 2. Proxy経由でダウンロード
      const proxyUrl = `${API_BASE_URL}/api/proxy?url=${encodeURIComponent(targetUrl)}`;
      const vidRes = await fetch(proxyUrl);
      const blob = await vidRes.blob();

      // 3. DB保存 (format情報を付与)
      const db = await initDB();
      const tx = db.transaction(STORE_VIDEOS, 'readwrite');
      await tx.objectStore(STORE_VIDEOS).put({
        ...video,
        blob: blob,
        format: format, // 'mp4' or 'm4a'
        savedAt: new Date().toISOString()
      });

      alert(`${format.toUpperCase()}で保存しました！`);
    } catch (err) {
      alert(`保存失敗: ${err.message}`);
    } finally {
      setDownloadingIds(prev => {
        const next = { ...prev };
        delete next[video.videoId];
        return next;
      });
    }
  };

  // --- ライブラリ/ピン一覧表示 ---
  const loadLibrary = async () => {
    setViewMode('library');
    setLoading(true);
    setCurrentVideo(null);
    try {
      const db = await initDB();
      const tx = db.transaction(STORE_VIDEOS, 'readonly');
      const req = tx.objectStore(STORE_VIDEOS).getAll();
      req.onsuccess = () => {
        const sorted = req.result.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
        setVideos(sorted);
        setLoading(false);
      };
    } catch (err) { setLoading(false); }
  };

  const deleteFromLibrary = async (e, videoId) => {
    e.stopPropagation();
    if(!confirm('削除しますか？')) return;
    const db = await initDB();
    const tx = db.transaction(STORE_VIDEOS, 'readwrite');
    await tx.objectStore(STORE_VIDEOS).delete(videoId);
    setVideos(prev => prev.filter(v => v.videoId !== videoId));
  };

  // ... (importやロジック部分はそのまま) ...
// App関数の中の return 文を以下にすべて書き換えてください

  return (
    <div style={{ background: '#1a1a1a', minHeight: '100vh', color: '#e0e0e0', paddingBottom:'80px' }}>
      
      {/* Header (固定表示) */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(26, 26, 26, 0.95)', 
        borderBottom:'1px solid #333', 
        padding:'10px 15px', 
        display:'flex', justifyContent:'space-between', alignItems:'center',
        backdropFilter: 'blur(5px)'
      }}>
        <h2 style={{margin:0, color:'#fff', fontSize:'18px'}} onClick={() => setViewMode('search')}>
          ShimaTube <span style={{fontSize:'10px', color:'#007bff'}}>v3.1</span>
        </h2>
        <div>
           <button onClick={() => setViewMode('search')} style={{marginRight:'10px', background:viewMode==='search'?'#007bff':'#333', color:'#fff', border:'none', borderRadius:'50%', width:'35px', height:'35px', fontSize:'16px'}}>🔍</button>
           <button onClick={loadLibrary} style={{background:viewMode==='library'?'#28a745':'#333', color:'#fff', border:'none', borderRadius:'50%', width:'35px', height:'35px', fontSize:'16px'}}>📂</button>
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{ padding: '0 15px 15px 15px' }}>
        
        {/* Pinned Channels */}
        {pinnedChannels.length > 0 && viewMode === 'search' && (
          <div style={{display:'flex', gap:'15px', overflowX:'auto', padding:'10px 0', borderBottom:'1px solid #2a2a2a', marginBottom:'15px'}}>
            {pinnedChannels.map(p => (
              <div key={p.url} onClick={() => openChannel(p)} style={{minWidth:'70px', textAlign:'center', fontSize:'10px', cursor:'pointer', flexShrink:0}}>
                <div style={{width:'45px', height:'45px', background:'#333', borderRadius:'50%', margin:'0 auto 5px', display:'flex', alignItems:'center', justifyContent:'center', border:'1px solid #444', fontSize:'20px'}}>📺</div>
                <div style={{overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', width:'100%'}}>{p.name}</div>
              </div>
            ))}
          </div>
        )}
        
        {/* Search Input */}
        {viewMode === 'search' && (
          <form onSubmit={handleSearchSubmit} style={{ display:'flex', gap:'10px', margin: '15px 0' }}>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="キーワード検索..." style={{ flex:1, padding: '12px', borderRadius:'25px', border:'1px solid #333', background:'#2a2a2a', color:'#fff', outline:'none' }} />
            <button type="submit" style={{ width:'45px', borderRadius:'50%', border:'none', background:'#007bff', color:'#fff', fontWeight:'bold' }}>Go</button>
          </form>
        )}

        {/* Channel Title */}
        {viewMode === 'channel' && (
          <div style={{margin:'15px 0', fontSize:'18px', fontWeight:'bold', display:'flex', alignItems:'center', gap:'10px'}}>
            <span style={{fontSize:'24px'}}>📺</span> {query.replace('@','')}
          </div>
        )}

        {/* Player */}
        {currentVideo && (
          <div style={{ margin:'0 -15px 20px -15px', background: '#000', position:'sticky', top:'60px', zIndex:90 }}>
            <video src={currentVideo.videoUrl} controls autoPlay style={{ width: '100%', aspectRatio: '16/9', display:'block' }} />
            <div style={{ padding: '15px', background:'#222' }}>
              <h3 style={{ margin:0, fontSize:'15px', lineHeight:'1.4'}}>{currentVideo.title}</h3>
            </div>
          </div>
        )}

        {/* Video List */}
        <div style={{ display:'flex', flexDirection:'column', gap:'15px' }}>
          {loading && <div style={{textAlign:'center', padding:'20px', color:'#666'}}>読み込み中...</div>}
          
          {videos.map((v) => {
            const isPinned = pinnedChannels.some(p => p.url === v.author?.url);
            return (
              <div key={v.videoId} onClick={() => playVideo(v)} style={{ display: 'flex', gap:'12px', alignItems:'flex-start', cursor:'pointer' }}>
                
                {/* Thumbnail */}
                <div style={{position:'relative', width: '140px', minWidth:'140px', borderRadius:'8px', overflow:'hidden', aspectRatio:'16/9'}}>
                   <img src={v.thumbnail} style={{ width: '100%', height:'100%', objectFit: 'cover', background:'#333' }} />
                   <span style={{position:'absolute', bottom:'4px', right:'4px', background:'rgba(0,0,0,0.8)', fontSize:'10px', padding:'2px 4px', borderRadius:'4px', fontWeight:'bold'}}>{v.timestamp}</span>
                </div>

                {/* Meta Data */}
                <div style={{ flex:1, display:'flex', flexDirection:'column', gap:'4px' }}>
                  <div style={{ fontSize: '14px', fontWeight: '500', lineHeight:'1.3', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{v.title}</div>
                  
                  <div style={{ fontSize: '11px', color:'#aaa', display:'flex', alignItems:'center', gap:'6px', marginTop:'2px'}}>
                     <span onClick={(e) => { e.stopPropagation(); openChannel(v.author); }} style={{color:'#aaa'}}>{v.author?.name}</span>
                     {v.author?.url && (
                       <span onClick={(e) => { e.stopPropagation(); togglePin(v.author); }} style={{padding:'2px 6px', borderRadius:'10px', border:'1px solid #444', fontSize:'10px', color: isPinned ? '#ffc107' : '#666'}}>
                         {isPinned ? '登録中' : '登録'}
                       </span>
                     )}
                  </div>

                  <div style={{display:'flex', gap:'6px', marginTop:'auto', justifyContent:'flex-end'}}>
                    {viewMode !== 'library' ? (
                      !downloadingIds[v.videoId] ? (
                        <>
                          <button onClick={(e) => saveToLibrary(e, v, 'mp4')} style={{background:'#333', border:'1px solid #444', color:'#fff', borderRadius:'4px', fontSize:'10px', padding:'4px 8px'}}>MP4</button>
                          <button onClick={(e) => saveToLibrary(e, v, 'm4a')} style={{background:'#333', border:'1px solid #444', color:'#fff', borderRadius:'4px', fontSize:'10px', padding:'4px 8px'}}>M4A</button>
                        </>
                      ) : <span style={{fontSize:'10px', color:'#007bff'}}>保存中...</span>
                    ) : (
                      <button onClick={(e) => deleteFromLibrary(e, v.videoId)} style={{background:'#333', border:'1px solid #d63384', color:'#d63384', borderRadius:'4px', fontSize:'10px', padding:'4px 8px'}}>削除</button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
// ...

}

export default App;

