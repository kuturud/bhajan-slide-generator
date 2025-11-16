/* scripts.js – robust generation, prayer canonical rendering, fast font fitting,
   accurate progress, background cycling, header/footer styling, and safe extras injection */

(() => {
  /* ============================= CONFIG / CONSTANTS ============================= */
  const TITLE_COLOR='FFFFFF', SUBTITLE_COLOR='FFFF00';
  const HEADER_COLOR='FFFFFF', NAME_COLOR='00B0F0';
  const LYRICS_COLOR='FFFFFF', NOTE_COLOR='FFFFFF';
  const NEXT_LABEL_COLOR=SUBTITLE_COLOR;
  const SLIDE_W=10, SLIDE_H=5.625;
  const TITLE_FONT_SIZE=54, SUBTITLE_FONT_SIZE=32;
  const TITLE_BOX_HEIGHT=1.2, SUBTITLE_BOX_HEIGHT=0.9, CENTER_OFFSET=0.75;
  const HEADER_TOP_Y=0.24, HEADER_H=0.9;
  const HEADER_START_PT_BHAJAN=40, HEADER_MIN_PT_BHAJAN=22;
  const HEADER_START_PT_PRAYER=58, HEADER_MIN_PT_PRAYER=32;
  const BH_LYRICS_X=0, BH_LYRICS_Y=1.22, BH_LYRICS_W=SLIDE_W, BH_LYRICS_H=3.25;
  const BH_LYRICS_BASE_PT=34, BH_LYRICS_MIN_PT=14;
  const PR_LYRICS_X=0, PR_LYRICS_Y=1.18, PR_LYRICS_W=SLIDE_W, PR_LYRICS_H=2.70;
  const PR_LYRICS_BASE_PT=42, PR_LYRICS_MIN_PT=16;
  const NOTE_Y_GAP=0.18, FOOTER_Y=SLIDE_H-0.60;
  const NEXT_TITLE_FONT_SIZE=16, NEXT_LABEL_FONT_SIZE=16;

  // Backgrounds
  const IMAGE_DIR='images', IMAGE_BASE='bhajan', IMAGE_EXT='.png', MAX_BG_CANDIDATES=20;

  // Inline extra prayers (optional)
  const EXTRA_PRAYERS = [
    // {
    //   id: "myNewPrayer",
    //   title: "My New Prayer",
    //   lyrics: "Line A\n[[PAGE_BREAK]]\nLine B",
    //   translation: "Optional meaning"
    // }
  ];

  /* ============================= STATE ============================= */
  let backgroundsDataUrls=[]; let bgCycleIndex=0; const bgCache=new Map();
  let bhajansData=[], prayersData=[];
  const expandedBhajansKey='expandedBhajans', expandedPrayersKey='expandedPrayers';
  let expandedBhajans=new Set(JSON.parse(localStorage.getItem(expandedBhajansKey)||'[]'));
  let expandedPrayers=new Set(JSON.parse(localStorage.getItem(expandedPrayersKey)||'[]'));
  const WORKSPACE_KEY='workspaceRows';

  // PERFORMANCE CACHES
  const prayerSegmentsCache=new Map();      // prayerId -> segments[]
  const wrappedHeightCache=new Map();       // key -> hIn
  const fontFitCache=new Map();             // key -> {pt,hIn}
  const wordWidthCache=new Map();           // key -> px

  /* ============================= UI HELPERS ============================= */
  function escapeHtml(s){ return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function ensureToastContainer(){
    let c=document.getElementById('toastContainer');
    if(!c){ c=document.createElement('div'); c.id='toastContainer'; c.className='toast-container'; document.body.appendChild(c); }
    return c;
  }
  function showToast(msg,type='info',ms=2200){
    const c=ensureToastContainer();
    const t=document.createElement('div');
    t.className='toast '+type;
    t.innerHTML=`<div class="toast-msg">${escapeHtml(msg)}</div>`;
    c.appendChild(t);
    if(ms>0) setTimeout(()=>{ if(t.parentNode) t.parentNode.removeChild(t); }, ms);
  }
  function debounce(fn,ms=140){ let h; return (...a)=>{ clearTimeout(h); h=setTimeout(()=>fn(...a),ms); }; }
  function showProgress(total){
    const wrap=document.getElementById('generationProgress'); if(!wrap) return;
    wrap.hidden=false; wrap.querySelector('.progress-fill')?.style.setProperty('width','0%');
    const txt=document.getElementById('progressText'); if(txt) txt.textContent=`Preparing slides… (0/${total})`;
  }
  function updateProgress(current,total){
    const wrap=document.getElementById('generationProgress'); if(!wrap) return;
    const pct=Math.min(100, Math.round((current/total)*100));
    wrap.querySelector('.progress-fill')?.style.setProperty('width',pct+'%');
    const txt=document.getElementById('progressText'); if(txt) txt.textContent=`Generating… (${current}/${total})`;
  }
  function hideProgress(){ const wrap=document.getElementById('generationProgress'); if(wrap) wrap.hidden=true; }
  function setGenerateBusy(isBusy){
    const btn=document.getElementById('generatePresentation');
    if(!btn) return;
    if(isBusy){
      if(!btn.hasAttribute('aria-busy')){
        btn.dataset.originalText=btn.textContent;
        btn.textContent='Generating…';
        btn.disabled=true;
        btn.setAttribute('aria-busy','true');
      }
    } else {
      btn.disabled=false;
      btn.removeAttribute('aria-busy');
      if(btn.dataset.originalText) btn.textContent=btn.dataset.originalText;
    }
  }

  window.onerror=(m,u,l,c,e)=>{ console.error('[BhajanGen] runtime error',{m,u,l,c,e}); showToast('Script error — see console','error',4800); };
  window.addEventListener('unhandledrejection',e=>{ console.error('[BhajanGen] unhandled rejection',e.reason); showToast('Unhandled promise — see console','error',4800); });

  /* ============================= FONT / WRAP ENGINE ============================= */
  const CANVAS=document.createElement('canvas'); const CTX=CANVAS.getContext('2d'); const DPI=96;
  function ptToPx(pt){ return pt*(96/72); }
  function setFont(px,face='Calibri',bold=false,italic=false){ CTX.font=`${italic?'italic ':''}${bold?'bold ':''}${px}px ${face}`; }
  function measureWord(word, pxFont, face, bold, italic){
    const key=word+'|'+pxFont+'|'+bold+'|'+italic;
    if(wordWidthCache.has(key)) return wordWidthCache.get(key);
    setFont(pxFont,face,bold,italic);
    const w=CTX.measureText(word).width;
    wordWidthCache.set(key,w);
    return w;
  }
  function computeWrappedHeight(text, pt, face, boxW_in, lineGap=1.2, bold=false, italic=false){
    const key=JSON.stringify({text,pt,w:boxW_in,lineGap,bold,italic});
    if(wrappedHeightCache.has(key)) return wrappedHeightCache.get(key);
    if(!text){ wrappedHeightCache.set(key,0); return 0; }
    const pxFont=ptToPx(pt), maxPx=boxW_in*DPI, sp=measureWord(' ',pxFont,face,bold,italic);
    const paras=String(text).split('\n'); let lines=0;
    for(const para of paras){
      if(para===''){ lines++; continue; }
      const words=para.split(/\s+/); let curW=0;
      for(const w of words){
        const ww=measureWord(w,pxFont,face,bold,italic);
        if(curW===0){ curW=ww; }
        else if(curW+sp+ww<=maxPx){ curW+=sp+ww; }
        else { lines++; curW=ww; }
      }
      if(curW>0) lines++;
    }
    const hIn=(lines*(pxFont*lineGap))/DPI;
    wrappedHeightCache.set(key,hIn);
    return hIn;
  }
  function fitFontBinary(text,face,w_in,h_in,startPt,minPt,opts={bold:false,italic:false,lineGap:1.2}){
    const k=JSON.stringify({text,w:w_in,h:h_in,start:startPt,min:minPt,lineGap:opts.lineGap,bold:opts.bold,italic:opts.italic,type:'binary'});
    if(fontFitCache.has(k)) return fontFitCache.get(k);
    let lo=minPt, hi=startPt, best=minPt, bestH=computeWrappedHeight(text,minPt,face,w_in,opts.lineGap,opts.bold,opts.italic);
    while(lo<=hi){
      const mid=Math.floor((lo+hi)/2);
      const h=computeWrappedHeight(text,mid,face,w_in,opts.lineGap,opts.bold,opts.italic);
      if(h<=h_in){ best=mid; bestH=h; lo=mid+1; } else hi=mid-1;
    }
    const result={pt:best,hIn:bestH}; fontFitCache.set(k,result); return result;
  }
  function fitFontOneLineBinary(text,face,w_in,startPt,minPt,opts={bold:false,italic:false}){
    const k=JSON.stringify({text,w:w_in,start:startPt,min:minPt,bold:opts.bold,italic:opts.italic,type:'oneLine'});
    if(fontFitCache.has(k)) return fontFitCache.get(k);
    const maxPx=w_in*DPI; let lo=minPt, hi=startPt, best=minPt;
    while(lo<=hi){
      const mid=Math.floor((lo+hi)/2);
      setFont(ptToPx(mid),face,opts.bold,opts.italic);
      const w=CTX.measureText(text).width;
      if(w<=maxPx){ best=mid; lo=mid+1; } else hi=mid-1;
    }
    const r={pt:best}; fontFitCache.set(k,r); return r;
  }

  /* ============================= TEXT PROCESSING ============================= */
  function normalizeLyrics(l){
    let t=String(l||'').replace(/\r/g,'');
    if(t.includes('\\n')) t=t.replace(/\\n/g,'\n');
    return t.split('\n').map(line=>line.replace(/\s+$/,'')).join('\n');
  }
  function formatVerses(raw){
    if(!raw) return '';
    const n=raw.replace(/\r/g,'');
    if(/\n\s*\n/.test(n)) return n;
    const lines=n.split('\n').map(l=>l.trim()).filter(Boolean);
    if(lines.length<=4) return lines.join('\n');
    const out=[]; for(let i=0;i<lines.length;i++){ out.push(lines[i]); if((i+1)%4===0 && i!==lines.length-1) out.push(''); }
    return out.join('\n');
  }
  function extractTrailingNote(text){
    if(!text) return {main:'',note:''};
    const re=/\(\s*([\s\S]*?)\s*\)\s*$/;
    const m=text.match(re);
    return m?{main:text.replace(re,'').trimEnd(),note:m[1].trim()}:{main:text,note:''};
  }
  function norm(s){ return String(s||'').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,''); }

  // Prayer PAGE_BREAK splitter (cached per prayer id)
  function getPrayerSlideParts(prayerId, canonicalLyrics){
    if(prayerSegmentsCache.has(prayerId)) return prayerSegmentsCache.get(prayerId);
    let raw=canonicalLyrics||'';
    raw=raw.replace(/\[\[[\s\r\n]*PAGE[\s_]*BREAK[\s\r\n]*\]\]/gi,'<<<PB>>>')
           .replace(/\[[\s\r\n]*PAGE[\s_]*BREAK[\s\r\n]*\]/gi,'<<<PB>>>')
           .replace(/^(?:\[\]|\[\[|\]\])$/gm,'')
           .replace(/(?:<<<PB>>>)+/g,'<<<PB>>>');
    if(raw.startsWith('<<<PB>>>')) raw=raw.substring(9);
    if(raw.endsWith('<<<PB>>>')) raw=raw.slice(0,-9);
    const parts=raw.split('<<<PB>>>').map(p=>p.trim()).filter(Boolean).map(formatVerses);
    const result=parts.length?parts:[''];
    prayerSegmentsCache.set(prayerId,result);
    return result;
  }

  /* ============================= DATA FETCH & MERGE ============================= */
  function normalizePrayer(p){
    return {
      id:String(p.id),
      title:p.title,
      lyrics:normalizeLyrics(p.lyrics||''),
      translation:(p.translation||p.meaning||''),
      background:p.background||null,
      _lcTitle:norm(p.title),
      _lcLyrics:norm(p.lyrics||''),
      _lcTrans:norm(p.translation||p.meaning||'')
    };
  }

  async function fetchJsonFlexible(name){
    const base=window.location.href;
    const candidates=[ new URL(name,base).href, new URL('./'+name,base).href, new URL(`${name}?v=${Date.now()}`,base).href ];
    for(const url of candidates){
      try{
        const res=await fetch(url,{cache:'no-store',headers:{'Accept':'application/json'}});
        if(!res.ok) continue;
        const txt=await res.text();
        const cleaned=txt.replace(/^\uFEFF/,'').replace(/\r/g,'');
        const json=JSON.parse(cleaned);
        if(Array.isArray(json)) return json;
        if(json && typeof json==='object'){
          for(const k of Object.keys(json)){ if(Array.isArray(json[k])) return json[k]; }
        }
      }catch(e){ /* try next */ }
    }
    throw new Error('Unable to load '+name);
  }

  async function autoLoad(){
    if(location.protocol==='file:'){ console.log('[BhajanGen] file:// skip auto fetch'); return; }
    const [b,p]=await Promise.allSettled([ fetchJsonFlexible('bhajans.json'), fetchJsonFlexible('prayers.json') ]);
    if(b.status==='fulfilled'){
      bhajansData=b.value.map(e=>({ id:e.id, name:e.name, lyrics:normalizeLyrics(e.lyrics||''), _lcName:norm(e.name), _lcLyrics:norm(e.lyrics||'') }));
    } else { showToast('bhajans.json missing','error',3000); }
    if(p.status==='fulfilled'){
      prayersData=p.value.map(normalizePrayer);
    } else { showToast('prayers.json missing','error',3000); }

    if(EXTRA_PRAYERS.length){
      for(const pr of EXTRA_PRAYERS){
        try{
          if(!pr || typeof pr!=='object'){ console.warn('[BhajanGen] invalid inline prayer (not object)'); continue; }
          if(!pr.id || !pr.title || !pr.lyrics){ console.warn('[BhajanGen] invalid inline prayer (id/title/lyrics required)'); continue; }
          if(prayersData.some(x=>String(x.id)===String(pr.id))){ console.warn('[BhajanGen] duplicate inline prayer id skipped:',pr.id); continue; }
          prayersData.push(normalizePrayer(pr));
        }catch(err){ console.warn('[BhajanGen] failed inline prayer injection',err); }
      }
    }
  }

  /* ============================= BACKGROUNDS ============================= */
  async function ensureDataUrl(url){
    if(!url) return null;
    if(bgCache.has(url)) return bgCache.get(url);
    try{
      if(location.protocol==='file:') throw new Error('skip file://');
      const res=await fetch(url,{cache:'no-store',mode:'cors'});
      if(!res.ok) throw new Error('status '+res.status);
      const blob=await res.blob();
      const dataUrl=await new Promise((resolve,reject)=>{ const fr=new FileReader(); fr.onload=()=>resolve(fr.result); fr.onerror=reject; fr.readAsDataURL(blob); });
      bgCache.set(url,dataUrl);
      return dataUrl;
    }catch(e){ console.warn('[BhajanGen] bg fetch fail',url,e.message||e); return null; }
  }
  async function prefetchBackgrounds(){
    if(backgroundsDataUrls.length) return; // already prefetched
    backgroundsDataUrls=[]; bgCycleIndex=0;
    if(location.protocol==='file:'){ return; }
    const base=window.location.href;
    const pushIf=async url=>{ const d=await ensureDataUrl(url); if(d) backgroundsDataUrls.push({url,data:d}); };
    await pushIf(new URL(`${IMAGE_DIR}/${IMAGE_BASE}1${IMAGE_EXT}`,base).href);
    for(let i=2;i<=MAX_BG_CANDIDATES;i++){
      await pushIf(new URL(`${IMAGE_DIR}/${IMAGE_BASE}${i}${IMAGE_EXT}`,base).href);
    }
  }
  function pickBackgroundDataUrl(isTitle=false){
    if(!backgroundsDataUrls.length) return null;
    if(isTitle) return backgroundsDataUrls[0].data;
    if(backgroundsDataUrls.length===1) return backgroundsDataUrls[0].data;
    const idx=1+(bgCycleIndex % (backgroundsDataUrls.length-1));
    bgCycleIndex++; return backgroundsDataUrls[idx].data;
  }

  /* ============================= RENDER LIBRARIES ============================= */
  function renderBhajanIndex(){
    const body=document.querySelector('#index tbody'); if(!body) return;
    body.innerHTML='';
    const q=norm(document.getElementById('bhajanSearch')?.value||'');
    const includeLyrics=!!document.getElementById('bhajanSearchLyrics')?.checked;
    const limit=document.getElementById('bhajanLimit')?.value||'50';
    const list=bhajansData.filter(b=>{
      if(!q) return true;
      return String(b.id).toLowerCase().includes(q) || b._lcName.includes(q) || (includeLyrics && b._lcLyrics.includes(q));
    });
    const slice=limit==='all'?list:list.slice(0,Number(limit));
    for(const b of slice){
      const id=String(b.id); const open=expandedBhajans.has(id);
      const tr=document.createElement('tr'); tr.className='library-row'; tr.dataset.id=id;
      tr.innerHTML=`<td class="idx-id">${escapeHtml(id)}</td><td class="idx-name">${escapeHtml(b.name||'')}</td>
        <td class="actions-cell">
          <button class="add-btn btn" data-id="${escapeHtml(id)}">Add</button>
          <button class="show-lyrics-btn btn ${open?'active':''}" data-id="${escapeHtml(id)}">${open?'Hide Lyrics':'Show Lyrics'}</button>
        </td>`;
      body.appendChild(tr);
      const lr=document.createElement('tr'); lr.className='lyrics-row'; lr.dataset.parentId=id; lr.style.display=open?'':'none';
      lr.innerHTML=`<td colspan="3"><div class="lyrics-box"><pre class="lyrics-main"></pre><pre class="lyrics-note" style="display:none"></pre>
      <div class="lyrics-actions"><button class="copy-lyrics-btn btn small-btn" data-id="${escapeHtml(id)}">Copy</button></div></div></td>`;
      body.appendChild(lr);
      if(open){
        const {main,note}=extractTrailingNote(b.lyrics||'');
        lr.querySelector('.lyrics-main').textContent=formatVerses(main);
        if(note){
          const noteEl=lr.querySelector('.lyrics-note');
          noteEl.textContent='('+note+')';
          noteEl.style.display='';
        }
      }
    }
  }

  function renderPrayerIndex(){
    const body=document.querySelector('#prayersIndex tbody'); if(!body) return;
    body.innerHTML='';
    const q=norm(document.getElementById('prayerSearch')?.value||'');
    const includeText=!!document.getElementById('prayerSearchLyrics')?.checked;
    const list=prayersData.filter(p=>{
      if(!q) return true;
      return String(p.id).toLowerCase().includes(q) ||
        p._lcTitle.includes(q) ||
        (includeText && (p._lcLyrics.includes(q) || p._lcTrans.includes(q)));
    });
    for(const p of list){
      const key=String(p.id); const open=expandedPrayers.has(key);
      const tr=document.createElement('tr'); tr.className='library-row'; tr.dataset.id=key;
      tr.innerHTML=`<td class="pr-key">${escapeHtml(key)}</td><td class="pr-title">${escapeHtml(p.title||'')}</td>
        <td class="actions-cell">
          <button class="add-prayer-btn btn" data-id="${escapeHtml(key)}">Add</button>
          <button class="show-lyrics-btn btn ${open?'active':''}" data-prayer="${escapeHtml(key)}">${open?'Hide Lyrics':'Show Lyrics'}</button>
        </td>`;
      body.appendChild(tr);
      const lr=document.createElement('tr'); lr.className='lyrics-row'; lr.dataset.parentId=key; lr.style.display=open?'':'none';
      lr.innerHTML=`<td colspan="3"><div class="lyrics-box"><pre class="lyrics-main"></pre><pre class="lyrics-note" style="display:none"></pre>
      <div class="lyrics-actions"><button class="copy-lyrics-btn btn small-btn" data-prayer="${escapeHtml(key)}">Copy</button></div></div></td>`;
      body.appendChild(lr);
      if(open){
        lr.querySelector('.lyrics-main').textContent=formatVerses(p.lyrics||'');
        if(p.translation){
          const noteEl=lr.querySelector('.lyrics-note');
          noteEl.textContent='('+p.translation+')';
          noteEl.style.display='';
        }
      }
    }
  }

  /* ============================= WORKSPACE ============================= */
  function addWorkspaceRow(id,title='',lyrics='',prayerBg=null,name='',gender='',key=''){
    const tbody=document.getElementById('sortable'); if(!tbody) return;
    const tr=document.createElement('tr');
    if(prayerBg) tr.dataset.prayerBg=prayerBg;
    tr.innerHTML=`<td class="ws-id">${id===-1?'':escapeHtml(String(id))}</td>
      <td><input type="text" name="title" value="${escapeHtml(title||'')}" class="title-input"></td>
      <td><input type="text" name="name" value="${escapeHtml(name||'')}" class="ws-name-input" placeholder="Name"></td>
      <td><select name="gender"><option></option><option ${gender==='M'?'selected':''}>M</option><option ${gender==='F'?'selected':''}>F</option></select></td>
      <td>${makeKeySelect(key)}</td>
      <td><button class="btn remove">Remove</button></td>
      <input type="hidden" name="bhajan_id" value="${escapeHtml(String(id))}">
      <input type="hidden" name="lyrics" value="${escapeHtml(lyrics||'')}">`;
    tbody.appendChild(tr);
    tr.querySelector('.remove')?.addEventListener('click',()=>{ tr.remove(); saveWorkspace(); showToast('Removed','info',1100); });
    tr.querySelectorAll('input,select').forEach(el=>el.addEventListener('input',debounce(saveWorkspace,250)));
    saveWorkspace();
  }
  function makeKeySelect(selected=''){
    const opts=['','C','C# / Db','D','D# / Eb','E','F','F# / Gb','G','G# / Ab','A','A# / Bb','B'];
    const sel=document.createElement('select'); sel.className='key-select';
    for(const o of opts){ const op=document.createElement('option'); op.value=o; op.textContent=o; if(o===selected) op.selected=true; sel.appendChild(op); }
    return sel.outerHTML;
  }
  function saveWorkspace(){
    try{
      const rows=Array.from(document.querySelectorAll('#sortable tr')).map(tr=>({
        id:tr.querySelector('input[name="bhajan_id"]')?.value||'',
        title:tr.querySelector('input[name="title"]')?.value||'',
        name:tr.querySelector('input[name="name"]')?.value||'',
        gender:tr.querySelector('select[name="gender"]')?.value||'',
        key:tr.querySelector('.key-select')?.value||'',
        lyrics:tr.querySelector('input[name="lyrics"]')?.value||'',
        prayerBg:tr.dataset.prayerBg||''
      }));
      sessionStorage.setItem(WORKSPACE_KEY,JSON.stringify(rows));
    }catch(e){ console.warn('[BhajanGen] saveWorkspace failed',e); }
  }
  function restoreWorkspace(){
    const raw=sessionStorage.getItem(WORKSPACE_KEY); if(!raw) return;
    try{
      const arr=JSON.parse(raw); if(!Array.isArray(arr)) return;
      for(const r of arr) addWorkspaceRow(r.id,r.title,r.lyrics,r.prayerBg||null,r.name,r.gender,r.key);
    }catch(e){ console.warn('[BhajanGen] restoreWorkspace failed',e); }
  }

  function addBhajanById(id){
    if(String(id)==='-1'){ addFillerSlide(); return; }
    const found=bhajansData.find(b=>String(b.id)===String(id));
    addWorkspaceRow(found?found.id:id,found?found.name:('Bhajan '+String(id)),found?found.lyrics:'');
    showToast('Added','success',1000);
  }
  function addPrayerByKey(key){
    const found=prayersData.find(p=>String(p.id)===String(key));
    if(found){ addWorkspaceRow('P-'+found.id,found.title,found.lyrics,found.background||null); showToast('Prayer added','success',1000); }
    else showToast('Prayer not found','error',1400);
  }
  function addFillerSlide(){ addWorkspaceRow(-1,'Filler Slide',''); }
  function addBlankBhajan(){ addWorkspaceRow(0,'New Bhajan',''); }

  function toggleLyrics(type,id,btn){
    const row=Array.from(document.querySelectorAll('.lyrics-row')).find(r=>r.dataset.parentId===String(id));
    if(!row||!btn) return;
    const open=row.style.display!=='none';
    if(open){
      row.style.display='none'; btn.textContent='Show Lyrics'; btn.classList.remove('active');
      if(type==='bhajan'){ expandedBhajans.delete(String(id)); localStorage.setItem(expandedBhajansKey,JSON.stringify([...expandedBhajans])); }
      else { expandedPrayers.delete(String(id)); localStorage.setItem(expandedPrayersKey,JSON.stringify([...expandedPrayers])); }
    } else {
      const data=(type==='bhajan'?bhajansData:prayersData).find(x=>String(x.id)===String(id));
      if(type==='prayer'){
        row.querySelector('.lyrics-main').textContent=formatVerses(data?.lyrics||'');
        const n=row.querySelector('.lyrics-note');
        if(data?.translation){ n.textContent='('+data.translation+')'; n.style.display=''; } else n.style.display='none';
      } else {
        const {main,note}=extractTrailingNote(data?.lyrics||'');
        row.querySelector('.lyrics-main').textContent=formatVerses(main);
        const n=row.querySelector('.lyrics-note');
        if(note){ n.textContent='('+note+')'; n.style.display=''; } else n.style.display='none';
      }
      row.style.display=''; btn.textContent='Hide Lyrics'; btn.classList.add('active');
      if(type==='bhajan'){ expandedBhajans.add(String(id)); localStorage.setItem(expandedBhajansKey,JSON.stringify([...expandedBhajans])); }
      else { expandedPrayers.add(String(id)); localStorage.setItem(expandedPrayersKey,JSON.stringify([...expandedPrayers])); }
    }
  }

  /* ============================= HEADER / FOOTER HELPERS ============================= */
  function buildBhajanHeaderRuns(title,name,gender,key,pt){
    const runs=[];
    if(title) runs.push({ text:title+(name||gender||key?' ':'') , options:{fontSize:pt,color:HEADER_COLOR,bold:true} });
    if(name)  runs.push({ text:name+(gender||key?' ':'')  , options:{fontSize:pt,color:NAME_COLOR ,bold:true} });
    if(gender)runs.push({ text:`(${gender})`+(key?' ':'')   , options:{fontSize:pt,color:HEADER_COLOR,bold:true} });
    if(key)   runs.push({ text:key                         , options:{fontSize:pt,color:HEADER_COLOR,bold:true} });
    if(!runs.length) runs.push({ text:'', options:{fontSize:pt,color:HEADER_COLOR} });
    return runs;
  }
  function getNextInfo(rows,currentIndex){
    for(let j=currentIndex+1;j<rows.length;j++){
      const r=rows[j];
      const id=String(r.querySelector('input[name="bhajan_id"]')?.value||'');
      if(id==='-1') continue;
      const title=r.querySelector('input[name="title"]')?.value||'';
      const name=id.startsWith('P-') ? '' : (r.querySelector('input[name="name"]')?.value||'');
      return { title, name };
    }
    return null;
  }
  function addNextFooter(s,nextInfo){
    // Left: Next
    s.addText('Next',{x:0.3,y:FOOTER_Y,w:1.2,h:0.4,fontFace:'Calibri',fontSize:NEXT_LABEL_FONT_SIZE,color:NEXT_LABEL_COLOR,align:'left'});
    // Center: Title
    if(nextInfo?.title){
      s.addText(nextInfo.title,{x:SLIDE_W/2 - 2.2,y:FOOTER_Y,w:4.4,h:0.4,fontFace:'Calibri',fontSize:NEXT_TITLE_FONT_SIZE,color:HEADER_COLOR,align:'center'});
    }
    // Right: Name (blue)
    if(nextInfo?.name){
      s.addText(nextInfo.name,{x:SLIDE_W - 2.3,y:FOOTER_Y,w:2.0,h:0.4,fontFace:'Calibri',fontSize:NEXT_TITLE_FONT_SIZE,color:NAME_COLOR,align:'right'});
    }
  }

  /* ============================= GENERATION ============================= */
  async function generatePresentation(){
    const btn=document.getElementById('generatePresentation');
    if(!btn || btn.hasAttribute('aria-busy')) return;
    setGenerateBusy(true);

    try{
      if(typeof PptxGenJS==='undefined'){
        showToast('PPTX engine not loaded — check pptxgenJS script include','error',5000);
        console.error('[BhajanGen] PptxGenJS is undefined. Ensure <script src=\"https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js\"></script> is present.');
        return;
      }
      await prefetchBackgrounds();

      const slideTitle=(document.getElementById('slideTitle')?.value||'').trim()||'Central London Sai Centre';
      const subEl=document.getElementById('slideSubtitle'); const subtitle=(subEl?.value||'').trim()||formatToday(); if(subEl) subEl.value=subtitle;
      const rows=Array.from(document.querySelectorAll('#sortable tr'));

      // Calculate total slides using canonical prayer data
      let totalSlides=1;
      for(const tr of rows){
        const id=String(tr.querySelector('input[name="bhajan_id"]')?.value||'');
        if(id==='-1'){ totalSlides+=1; continue; }
        if(id.startsWith('P-')){
          const key=id.slice(2);
          const pr=prayersData.find(p=>String(p.id)===key);
          const segments=getPrayerSlideParts(key, pr?pr.lyrics:(tr.querySelector('input[name="lyrics"]')?.value||''));
          totalSlides+=segments.length;
        } else totalSlides+=1;
      }

      showProgress(totalSlides);
      showToast('Generating…','info',900);

      const pptx=new PptxGenJS();
      let progress=0, sinceYield=0;
      const maybeYield=async()=>{ if(++sinceYield>=8){ sinceYield=0; await new Promise(r=>requestAnimationFrame(()=>r())); } };

      // Title slide
      try{
        const s=pptx.addSlide();
        const bg=pickBackgroundDataUrl(true);
        if(bg) s.addImage({data:bg,x:0,y:0,w:'100%',h:'100%'});
        const centerY=SLIDE_H/2, titleMid=centerY-CENTER_OFFSET, subMid=centerY+CENTER_OFFSET;
        const titleY=titleMid-(TITLE_BOX_HEIGHT/2), subY=subMid-(SUBTITLE_BOX_HEIGHT/2);
        s.addText(slideTitle,{x:0,y:titleY,w:SLIDE_W,h:TITLE_BOX_HEIGHT,align:'center',valign:'middle',fontFace:'Calibri',fontSize:TITLE_FONT_SIZE,bold:true,color:TITLE_COLOR});
        s.addText(subtitle,{x:0,y:subY,w:SLIDE_W,h:SUBTITLE_BOX_HEIGHT,align:'center',valign:'middle',fontFace:'Calibri',fontSize:SUBTITLE_FONT_SIZE,color:SUBTITLE_COLOR});
      }catch(err){ console.error('[BhajanGen] title slide error',err); }
      progress++; updateProgress(progress,totalSlides);

      for(let i=0;i<rows.length;i++){
        const tr=rows[i];
        const rawId=String(tr.querySelector('input[name="bhajan_id"]')?.value||'');
        const rowTitle=tr.querySelector('input[name="title"]')?.value||'';
        const personName=tr.querySelector('input[name="name"]')?.value||'';
        const gender=tr.querySelector('select[name="gender"]')?.value||'';
        const keyField=tr.querySelector('.key-select')?.value||'';
        let workspaceLyrics=normalizeLyrics(tr.querySelector('input[name="lyrics"]')?.value||'');

        try{
          if(rawId==='-1'){
            const s=pptx.addSlide();
            const bg=pickBackgroundDataUrl(false); if(bg) s.addImage({data:bg,x:0,y:0,w:'100%',h:'100%'});
            const nextInfo=getNextInfo(rows,i); if(nextInfo) addNextFooter(s,nextInfo);
            progress++; updateProgress(progress,totalSlides); await maybeYield(); continue;
          }

          if(rawId.startsWith('P-')){
            const key=rawId.slice(2);
            const pr=prayersData.find(p=>String(p.id)===key);
            const canonicalLyrics=pr?pr.lyrics:workspaceLyrics;
            const translation=pr?pr.translation:'';
            const parts=getPrayerSlideParts(key, canonicalLyrics);
            if(!parts.length) parts.push('');

            for(let p=0;p<parts.length;p++){
              const s=pptx.addSlide();
              const bg=pickBackgroundDataUrl(false); if(bg) s.addImage({data:bg,x:0,y:0,w:'100%',h:'100%'});

              // Header with slide number for multi-part prayers
              if(rowTitle){
                const headerText = parts.length > 1 ? `${rowTitle} (${p+1}/${parts.length})` : rowTitle;
                const fit=fitFontOneLineBinary(headerText,'Calibri',SLIDE_W,HEADER_START_PT_PRAYER,HEADER_MIN_PT_PRAYER,{bold:true});
                s.addText(headerText,{x:0,y:HEADER_TOP_Y,w:SLIDE_W,h:HEADER_H,align:'center',valign:'top',fontFace:'Calibri',fontSize:fit.pt,bold:true,color:HEADER_COLOR});
              }

              const seg=parts[p]||'';
              const lyricsFit=fitFontBinary(seg,'Calibri',PR_LYRICS_W,PR_LYRICS_H,PR_LYRICS_BASE_PT,PR_LYRICS_MIN_PT,{lineGap:1.22});
              s.addText(seg,{x:PR_LYRICS_X,y:PR_LYRICS_Y,w:PR_LYRICS_W,h:PR_LYRICS_H,align:'center',valign:'top',fontFace:'Calibri',fontSize:lyricsFit.pt,color:LYRICS_COLOR,wrap:true});

              if(p===parts.length-1 && translation){
                const transPt=Math.max(14, lyricsFit.pt-14);
                s.addText('('+translation+')',{x:PR_LYRICS_X,y:PR_LYRICS_Y+PR_LYRICS_H+NOTE_Y_GAP,w:PR_LYRICS_W,h:1.05,align:'center',fontFace:'Calibri',fontSize:transPt,color:NOTE_COLOR,italic:true,wrap:true});
              }

              // Only show "Next" on the final slide of this prayer
              if(p === parts.length - 1) {
                const nextInfo=getNextInfo(rows,i); 
                if(nextInfo) addNextFooter(s,nextInfo);
              }

              progress++; updateProgress(progress,totalSlides); await maybeYield();
            }
            continue;
          }

          // Bhajan slide
          if(!workspaceLyrics && /^\d+$/.test(rawId) && rawId!=='0'){
            const found=bhajansData.find(b=>String(b.id)===rawId);
            if(found) workspaceLyrics=found.lyrics||'';
          }
          const s=pptx.addSlide();
          const bg=pickBackgroundDataUrl(false); if(bg) s.addImage({data:bg,x:0,y:0,w:'100%',h:'100%'});

          const headerStr=[rowTitle,personName||'',gender?`(${gender})`:'',keyField||''].filter(Boolean).join(' ');
          const headerFit=fitFontOneLineBinary(headerStr,'Calibri',SLIDE_W,HEADER_START_PT_BHAJAN,HEADER_MIN_PT_BHAJAN,{bold:true});
          const headerRuns=buildBhajanHeaderRuns(rowTitle,personName,gender,keyField,headerFit.pt);
          s.addText(headerRuns,{x:0,y:HEADER_TOP_Y,w:SLIDE_W,h:HEADER_H,align:'center',valign:'top',fontFace:'Calibri'});

          const {main:mRaw,note:bNote}=extractTrailingNote(workspaceLyrics||'');
          const main=formatVerses(mRaw||'');
          const mainFit=fitFontBinary(main,'Calibri',BH_LYRICS_W,BH_LYRICS_H,BH_LYRICS_BASE_PT,BH_LYRICS_MIN_PT,{lineGap:1.22});
          s.addText(main,{x:BH_LYRICS_X,y:BH_LYRICS_Y,w:BH_LYRICS_W,h:BH_LYRICS_H,align:'center',valign:'top',fontFace:'Calibri',fontSize:mainFit.pt,color:LYRICS_COLOR,wrap:true});

          if(bNote){
            const noteY=Math.min(FOOTER_Y-0.9,BH_LYRICS_Y+BH_LYRICS_H+0.25);
            const availH=Math.max(0.6,(FOOTER_Y-0.22)-noteY);
            const notePt=Math.max(14,mainFit.pt-6);
            s.addText('('+bNote+')',{x:BH_LYRICS_X,y:noteY,w:BH_LYRICS_W,h:availH,align:'center',fontFace:'Calibri',fontSize:notePt,color:NOTE_COLOR,italic:true,wrap:true});
          }

          const nextInfo=getNextInfo(rows,i); if(nextInfo) addNextFooter(s,nextInfo);
        }catch(err){ console.error('[BhajanGen] slide error idx',i,err); }
        progress++; updateProgress(progress,totalSlides); await maybeYield();
      }

      try{
        await pptx.writeFile({ fileName:'presentation.pptx' });
        showToast('Presentation generated','success',1600);
      }catch(err){
        console.error('[BhajanGen] save error',err);
        showToast('Save failed — see console','error',4200);
      }
    } catch(err){
      console.error('[BhajanGen] generation fatal',err);
      showToast('Generation failed — see console','error',4200);
    } finally {
      hideProgress();
      setGenerateBusy(false);
    }
  }

  /* ============================= THEME ============================= */
  const THEME_KEY='bhajan_theme_mode';
  function applyThemeFromMode(mode){
    if(mode==='light' || mode==='dark') document.documentElement.setAttribute('data-theme',mode);
    else {
      const prefersDark=window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme',prefersDark?'dark':'light');
    }
    const btn=document.getElementById('themeCycle');
    if(btn) btn.textContent='Theme: '+(mode==='auto'?'Auto':mode.charAt(0).toUpperCase()+mode.slice(1));
  }
  function getThemeMode(){ const s=localStorage.getItem(THEME_KEY); return (s==='light'||s==='dark'||s==='auto')?s:'auto'; }
  function setThemeMode(m){ localStorage.setItem(THEME_KEY,m); applyThemeFromMode(m); }
  function formatToday(){
    const d=new Date();
    const ord=n=>{const suf=['th','st','nd','rd'],v=n%100;return n+(suf[(v-20)%10]||suf[v]||suf[0]);};
    const months=["January","February","March","April","May","June","July","August","September","October","November","December"];
    return `${ord(d.getDate())} ${months[d.getMonth()]} ${d.getFullYear()}`;
  }
  function initTheme(){
    applyThemeFromMode(getThemeMode());
    const sub=document.getElementById('slideSubtitle');
    if(sub && !sub.value) sub.value=formatToday();
  }

  /* ============================= EVENTS ============================= */
  document.addEventListener('click',e=>{
    const t=e.target;
    if(!(t instanceof HTMLElement)) return;
    if(t.id==='themeCycle'){
      const order=['auto','light','dark']; const cur=getThemeMode();
      const next=order[(order.indexOf(cur)+1)%order.length];
      setThemeMode(next); showToast('Theme: '+(next==='auto'?'Auto':next.charAt(0).toUpperCase()+next.slice(1)),'info',900);
    }
    if(t.classList.contains('add-btn') && t.dataset.id) addBhajanById(t.dataset.id);
    if(t.classList.contains('add-prayer-btn') && t.dataset.id) addPrayerByKey(t.dataset.id);
    if(t.classList.contains('show-lyrics-btn')){
      const id=t.dataset.id||t.dataset.prayer;
      const type=t.dataset.prayer?'prayer':'bhajan';
      toggleLyrics(type,id,t);
    }
    if(t.classList.contains('copy-lyrics-btn')){
      if(t.dataset.id){
        const found=bhajansData.find(b=>String(b.id)===String(t.dataset.id));
        navigator.clipboard?.writeText(found?.lyrics||'').catch(()=>{});
      } else if(t.dataset.prayer){
        const found=prayersData.find(p=>String(p.id)===String(t.dataset.prayer));
        navigator.clipboard?.writeText(found?.lyrics||'').catch(()=>{});
      }
      t.classList.add('copied'); setTimeout(()=>t.classList.remove('copied'),900);
    }
    if(t.id==='addBhajanBtn'){
      const id=(document.getElementById('bhajan_to_add_id')?.value||'').trim();
      if(!id) return showToast('Enter bhajan id','info',900);
      addBhajanById(id);
    }
    if(t.id==='addFillerSlide'){ addFillerSlide(); saveWorkspace(); }
    if(t.id==='addNewBhajanBtn'){ addBlankBhajan(); saveWorkspace(); }
    if(t.id==='bhajanExpandAll'){ for(const b of bhajansData) expandedBhajans.add(String(b.id)); localStorage.setItem(expandedBhajansKey,JSON.stringify([...expandedBhajans])); renderBhajanIndex(); }
    if(t.id==='bhajanCollapseAll'){ expandedBhajans.clear(); localStorage.setItem(expandedBhajansKey,'[]'); renderBhajanIndex(); }
    if(t.id==='prayerExpandAll'){ for(const p of prayersData) expandedPrayers.add(String(p.id)); localStorage.setItem(expandedPrayersKey,JSON.stringify([...expandedPrayers])); renderPrayerIndex(); }
    if(t.id==='prayerCollapseAll'){ expandedPrayers.clear(); localStorage.setItem(expandedPrayersKey,'[]'); renderPrayerIndex(); }
    if(t.id==='clearBhajanSearch'){ const el=document.getElementById('bhajanSearch'); if(el){ el.value=''; renderBhajanIndex(); el.focus(); } }
    if(t.id==='clearPrayerSearch'){ const el=document.getElementById('prayerSearch'); if(el){ el.value=''; renderPrayerIndex(); el.focus(); } }
    if(t.id==='generatePresentation'){ generatePresentation(); }
  });

  document.getElementById('bhajanSearch')?.addEventListener('input',debounce(renderBhajanIndex,140));
  document.getElementById('prayerSearch')?.addEventListener('input',debounce(renderPrayerIndex,140));
  document.getElementById('bhajanSearchLyrics')?.addEventListener('change',renderBhajanIndex);
  document.getElementById('prayerSearchLyrics')?.addEventListener('change',renderPrayerIndex);
  document.getElementById('bhajanLimit')?.addEventListener('change',renderBhajanIndex);
  document.getElementById('bhajanSearch')?.addEventListener('keydown',function(e){
    if(e.key==='Enter'){
      e.preventDefault();
      const q=this.value.trim();
      if(!q) return;
      if(/^\d+$/.test(q) && bhajansData.some(b=>String(b.id)===q)){ addBhajanById(q); return; }
      const first=document.querySelector('#index .library-row'); if(first){ const id=first.dataset.id; if(id) addBhajanById(id); }
    }
  });

  // Sortable
  if(window.jQuery && $.fn && $.fn.sortable){
    $('#sortable').sortable({placeholder:"ui-state-highlight",update:saveWorkspace});
  }

  /* ============================= INIT ============================= */
  document.addEventListener('DOMContentLoaded', async ()=>{
    initTheme();
    restoreWorkspace();
    await autoLoad();
    renderBhajanIndex();
    renderPrayerIndex();
  });
})();
