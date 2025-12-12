import React, { useState } from 'react';
import './App.css';

function App() {
  const [query, setQuery] = useState('');
  const [videos, setVideos] = useState([]);
  const [currentVideo, setCurrentVideo] = useState(null);
  const [loading, setLoading] = useState(false);

  const doSearch = async (searchQuery) => {
    setLoading(true);
    setVideos([]);
    try {
      const res = await fetch(`http://localhost:4000/api/search?q=${searchQuery}`);
      const data = await res.json();
      setVideos(data);
      setCurrentVideo(null);
    } catch (err) {
      alert('検索に失敗しました。サーバーが起動していない可能性があります。');
    }
    setLoading(false);
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    doSearch(query);
  };

  const handleChannelClick = (e, authorName) => {
    e.stopPropagation();
    setQuery(authorName);
    doSearch(authorName);
  };

  const playVideo = async (v) => {
    setLoading(true);
    try {
      const res = await fetch(`http://localhost:4000/api/watch?id=${v.videoId}`);
      const data = await res.json();
      
      if (data.error) {
        alert('エラー: ' + data.error);
        return;
      }
      
      if (!data.videoUrl) {
        alert('動画URLの取得に失敗しました。');
        return;
      }

      setCurrentVideo({ 
        ...v, 
        videoUrl: data.videoUrl, 
        audioUrl: data.audioUrl 
      });
    } catch (err) {
      alert('通信エラーが発生しました');
    }
    setLoading(false);
  };

  return (
    <div style={{ padding: '15px', backgroundColor: '#1a1a1a', minHeight: '100vh', color: '#e0e0e0', fontFamily: 'sans-serif', paddingBottom: '80px' }}>
      <h2 style={{color: '#fff', borderBottom:'2px solid #555', paddingBottom:'10px', marginBottom:'15px'}}>ShimaTube v2.1</h2>
      
      <form onSubmit={handleSearchSubmit} style={{ display:'flex', gap:'10px', marginBottom: '20px' }}>
        <input 
          value={query} 
          onChange={(e) => setQuery(e.target.value)} 
          placeholder="検索..." 
          style={{ flex:1, padding: '12px', fontSize: '16px', borderRadius:'8px', border:'none', background:'#333', color:'#fff' }}
        />
        <button type="submit" style={{ padding: '0 20px', borderRadius:'8px', border:'none', background:'#007bff', color:'#fff', fontWeight:'bold' }}>Go</button>
      </form>

      {/* プレイヤーエリア */}
      {currentVideo && (
        <div style={{ marginBottom:'20px', background: '#000', borderRadius:'12px', overflow:'hidden', boxShadow: '0 4px 15px rgba(0,0,0,0.5)' }}>
          <video 
            src={currentVideo.videoUrl} 
            controls 
            autoPlay 
            style={{ width: '100%', aspectRatio: '16/9' }} 
          />
          <div style={{ padding: '15px' }}>
            <h3 style={{ margin:'0 0 10px 0', fontSize:'16px', color:'#fff', lineHeight: '1.4'}}>{currentVideo.title}</h3>
            <div style={{color:'#aaa', fontSize:'14px', marginBottom:'15px'}}>{currentVideo.author.name}</div>
            
            <div style={{ display:'flex', gap:'10px', flexWrap:'wrap' }}>
               <a href={currentVideo.videoUrl} download={`${currentVideo.title}.mp4`} target="_blank" rel="noreferrer" 
                  style={{ flex:1, textAlign:'center', background: '#28a745', color: '#fff', padding: '12px', textDecoration: 'none', borderRadius:'6px', fontSize:'14px', fontWeight:'bold' }}>
                  🎬 動画保存
               </a>
               <a href={currentVideo.audioUrl} download={`${currentVideo.title}.m4a`} target="_blank" rel="noreferrer" 
                  style={{ flex:1, textAlign:'center', background: '#fd7e14', color: '#fff', padding: '12px', textDecoration: 'none', borderRadius:'6px', fontSize:'14px', fontWeight:'bold' }}>
                  🎵 音声保存
               </a>
            </div>
            <p style={{fontSize:'11px', color:'#777', marginTop:'8px', textAlign:'center'}}>※ボタン長押しで保存</p>
          </div>
        </div>
      )}

      {/* リスト表示 */}
      <div style={{ display:'flex', flexDirection:'column', gap:'15px' }}>
        {loading && <div style={{textAlign:'center', padding:'20px', color:'#007bff'}}>⚡ 解析中...</div>}
        
        {videos.map((v) => (
          <div key={v.videoId} onClick={() => playVideo(v)} 
               style={{ display: 'flex', gap:'10px', background:'#2a2a2a', borderRadius:'8px', overflow:'hidden', cursor: 'pointer' }}>
            <div style={{position:'relative', width: '130px', minWidth:'130px'}}>
               <img src={v.thumbnail} alt={v.title} style={{ width: '100%', height:'100%', objectFit: 'cover' }} />
               <span style={{position:'absolute', bottom:'5px', right:'5px', background:'rgba(0,0,0,0.8)', padding:'2px 4px', fontSize:'10px', borderRadius:'4px'}}>{v.timestamp}</span>
            </div>
            <div style={{ padding: '10px 10px 10px 0', flex:1 }}>
              <div style={{ fontSize: '13px', fontWeight: 'bold', lineHeight:'1.4', color:'#fff', marginBottom:'5px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{v.title}</div>
              <span onClick={(e) => handleChannelClick(e, v.author.name)}
                  style={{ fontSize: '11px', background:'#444', padding:'2px 6px', borderRadius:'4px', color:'#ddd', textDecoration:'none'}}>
                  {v.author.name}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
