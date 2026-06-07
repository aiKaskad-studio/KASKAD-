// js/audioEngine.js
import { pushToHistory, saveProject } from './storage.js';

export const audioState = {
  stems: [],
  isPlaying: false,
  currentPlaybackTime: 0,
  masterTimerStart: 0,
  animationFrame: null,
  audioCtx: null,
  masterCompressor: null,
  masterEQNodes: [],
  masterGain: null,
  masterOutputGain: null
};

const EQ_FREQS = [60, 250, 1000, 4000, 12000];

// Инициализация аудио-контекста и мастер-шины
export function initAudioContext() {
  if (audioState.audioCtx && audioState.audioCtx.state !== 'closed') {
    return audioState.audioCtx;
  }
  
  audioState.audioCtx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
  
  // Мастер-компрессор
  audioState.masterCompressor = audioState.audioCtx.createDynamicsCompressor();
  Object.assign(audioState.masterCompressor, { knee: 12, ratio: 4, threshold: -18, attack: 0.01, release: 0.1 });
  
  // Мастер-эквалайзер (5 полос)
  audioState.masterEQNodes = EQ_FREQS.map(f => {
    const eq = audioState.audioCtx.createBiquadFilter();
    Object.assign(eq, { type: 'peaking', frequency: f, Q: 1, gain: 0 });
    return eq;
  });
  
  // Мастер-громкость
  audioState.masterGain = audioState.audioCtx.createGain();
  audioState.masterGain.gain.value = 1;
  
  audioState.masterOutputGain = audioState.audioCtx.createGain();
  audioState.masterOutputGain.gain.value = 1;
  
  // Соединяем цепь: Compressor -> EQs -> MasterGain -> OutputGain -> Destination
  let node = audioState.masterCompressor;
  audioState.masterEQNodes.forEach(eq => {
    node.connect(eq);
    node = eq;
  });  node.connect(audioState.masterGain);
  audioState.masterGain.connect(audioState.masterOutputGain);
  audioState.masterOutputGain.connect(audioState.audioCtx.destination);
  
  return audioState.audioCtx;
}

// Загрузка исходного трека
export function loadTrack(file) {
  if (!file || file.size > 100 * 1024 * 1024) {
    alert('⚠️ Файл слишком большой или не выбран (макс. 100 МБ)');
    return;
  }
  
  const url = URL.createObjectURL(file);
  const audio = new Audio(url);
  
  const newStem = {
    id: Date.now().toString(),
    name: file.name,
    emoji: '🎵',
    color: '#c8a84b',
    url,
    audio,
    audioBuffer: null,
    sourceNode: null,
    gainNode: null,
    panNode: null,
    eqNodes: [],
    vol: 100,
    muted: false,
    pan: 0,
    eq: [0, 0, 0, 0, 0]
  };
  
  audioState.stems.push(newStem);
  
  audio.onloadedmetadata = () => {
    const fszEl = document.getElementById('fsz');
    if (fszEl) fszEl.textContent = (file.size / 1048576).toFixed(1) + ' МБ';
    
    const mixDurEl = document.getElementById('mixDur');
    if (mixDurEl) mixDurEl.textContent = formatTime(audio.duration);
    
    // Уведомляем clipEngine об обновлении длительности
    if (window.clipActions && window.clipActions.updateChronoCalc) {
      window.clipActions.updateChronoCalc();
    }
  };
    const fnameEl = document.getElementById('fname');
  if (fnameEl) fnameEl.textContent = file.name;
  
  const fchip = document.getElementById('fchip');
  if (fchip) fchip.style.display = 'flex';
  
  const mixPlayer = document.getElementById('mixPlayer');
  if (mixPlayer) mixPlayer.style.display = 'block';
  
  renderStems();
  renderMixer();
  pushToHistory(getCurrentState());
}

// Очистка всех дорожек
export function clearTrack() {
  audioState.stems.forEach(s => {
    if (s.url) URL.revokeObjectURL(s.url);
    if (s.sourceNode) { try { s.sourceNode.stop(); } catch(e){} }
  });
  audioState.stems = [];
  
  const fchip = document.getElementById('fchip');
  if (fchip) fchip.style.display = 'none';
  
  const mixPlayer = document.getElementById('mixPlayer');
  if (mixPlayer) mixPlayer.style.display = 'none';
  
  const fi = document.getElementById('fi');
  if (fi) fi.value = '';
  
  const fnameEl = document.getElementById('fname');
  if (fnameEl) fnameEl.textContent = '—';
  
  const fszEl = document.getElementById('fsz');
  if (fszEl) fszEl.textContent = '—';
  
  renderStems();
  renderMixer();
  pushToHistory(getCurrentState());
}

// Загрузка буфера для дорожки
async function loadBuffer(s) {
  if (s.audioBuffer) return s.audioBuffer;
  if (!s.url) return null;
  try {
    const r = await fetch(s.url);
    return await initAudioContext().decodeAudioData(await r.arrayBuffer());
  } catch(e) {    console.error('Decode error:', e);
    return null;
  }
}

// Рендеринг списка стемов (вкладка STEMS)
export function renderStems() {
  const container = document.getElementById('stemList');
  if (!container) return;
  
  if (audioState.stems.length === 0) {
    container.innerHTML = '<div class="empty-box">Нет дорожек. Загрузи файлы выше.</div>';
    return;
  }
  
  container.innerHTML = audioState.stems.map(s => `
    <div class="stem-card loaded">
      <div class="sc-head">
        <div class="sc-bar" style="background:${s.color}"></div>
        <span class="sc-emoji">${s.emoji}</span>
        <span class="sc-name">${escapeHtml(s.name)}</span>
        <span class="sc-dur">${s.audio?.duration ? formatTime(s.audio.duration) : '—'}</span>
        <div class="sc-btns">
          <button class="ib ${s.muted ? 'on-mute' : ''}" onclick="window.audioActions.toggleMute('${s.id}')">M</button>
          <button class="ib gld" onclick="window.audioActions.playSolo('${s.id}')">▶</button>
        </div>
      </div>
      <div class="sc-ctrls">
        <div class="ctrl-row">
          <span class="c-lbl">Vol</span>
          <input type="range" min="0" max="150" value="${s.vol}" oninput="window.audioActions.setVol('${s.id}', this.value)">
          <span class="c-val">${s.vol}%</span>
        </div>
        <div class="ctrl-row">
          <span class="c-lbl">Pan</span>
          <input type="range" min="-100" max="100" value="${s.pan}" oninput="window.audioActions.setPan('${s.id}', this.value)">
          <span class="c-val">${s.pan === 0 ? 'C' : (s.pan < 0 ? 'L' : 'R') + Math.abs(s.pan)}</span>
        </div>
        <div class="eq-grid">
          ${EQ_FREQS.map((f, b) => `
            <div class="eq-b">
              <span class="eq-val" id="eq-${s.id}-${b}">${s.eq[b]}</span>
              <input type="range" min="-12" max="12" value="${s.eq[b]}" step="0.5" oninput="window.audioActions.setEQ('${s.id}', ${b}, this.value)">
              <span class="eq-lbl">${f >= 1000 ? (f / 1000) + 'k' : f + 'Hz'}</span>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `).join('');}

// Рендеринг микшера (вкладка СВЕДЕНИЕ)
export function renderMixer() {
  const container = document.getElementById('mixerList');
  if (!container) return;
  
  if (audioState.stems.length === 0) {
    container.innerHTML = '<div class="empty-box">Загрузи стемы во вкладке STEMS</div>';
    return;
  }
  
  container.innerHTML = audioState.stems.map(s => `
    <div class="stem-card loaded" style="margin-bottom: 12px;">
      <div class="sc-head">
        <div class="sc-bar" style="background:${s.color}"></div>
        <span class="sc-emoji">${s.emoji}</span>
        <span class="sc-name">${escapeHtml(s.name)}</span>
        <div class="sc-btns">
          <button class="ib ${s.muted ? 'on-mute' : ''}" onclick="window.audioActions.toggleMute('${s.id}')">M</button>
        </div>
      </div>
      <div class="sc-ctrls">
        <div class="ctrl-row">
          <span class="c-lbl">Vol</span>
          <input type="range" min="0" max="150" value="${s.vol}" oninput="window.audioActions.setVol('${s.id}', this.value)">
          <span class="c-val">${s.vol}%</span>
        </div>
        <div class="ctrl-row">
          <span class="c-lbl">Pan</span>
          <input type="range" min="-100" max="100" value="${s.pan}" oninput="window.audioActions.setPan('${s.id}', this.value)">
          <span class="c-val">${s.pan === 0 ? 'C' : (s.pan < 0 ? 'L' : 'R') + Math.abs(s.pan)}</span>
        </div>
      </div>
    </div>
  `).join('');
}

// Глобальные действия для HTML onclick
window.audioActions = {
  toggleMute: (id) => {
    const s = audioState.stems.find(x => x.id === id);
    if (!s) return;
    s.muted = !s.muted;
    if (s.gainNode) s.gainNode.gain.value = s.muted ? 0 : s.vol / 100;
    renderStems();
    renderMixer();
    pushToHistory(getCurrentState());
  },
  setVol: (id, val) => {    const s = audioState.stems.find(x => x.id === id);
    if (!s) return;
    s.vol = parseFloat(val);
    if (s.gainNode && !s.muted) s.gainNode.gain.value = s.vol / 100;
    renderStems();
    renderMixer();
    pushToHistory(getCurrentState());
  },
  setPan: (id, val) => {
    const s = audioState.stems.find(x => x.id === id);
    if (!s) return;
    s.pan = parseFloat(val);
    if (s.panNode && s.panNode.pan !== undefined) s.panNode.pan.value = s.pan / 100;
    renderStems();
    renderMixer();
    pushToHistory(getCurrentState());
  },
  setEQ: (id, band, val) => {
    const s = audioState.stems.find(x => x.id === id);
    if (!s || !s.eqNodes[band]) return;
    s.eq[band] = parseFloat(val);
    s.eqNodes[band].gain.value = s.eq[band];
    const el = document.getElementById(`eq-${id}-${band}`);
    if (el) el.textContent = val;
    pushToHistory(getCurrentState());
  },
  playSolo: async (id) => {
    const s = audioState.stems.find(x => x.id === id);
    if (!s) return;
    const ctx = initAudioContext();
    if (ctx.state === 'suspended') await ctx.resume();
    
    if (s.sourceNode) {
      try { s.sourceNode.stop(); } catch(e){}
      s.sourceNode = null;
      return;
    }
    
    const buf = await loadBuffer(s);
    if (!buf) return;
    
    if (!s.gainNode) {
      s.gainNode = ctx.createGain();
      s.gainNode.gain.value = s.muted ? 0 : s.vol / 100;
      
      s.panNode = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
      if (s.panNode.pan !== undefined) s.panNode.pan.value = s.pan / 100;
      
      s.eqNodes = EQ_FREQS.map((f, idx) => {
        const eq = ctx.createBiquadFilter();        Object.assign(eq, { type: 'peaking', frequency: f, Q: 1, gain: s.eq[idx] });
        return eq;
      });
      
      let node = s.eqNodes[0];
      for (let j = 1; j < s.eqNodes.length; j++) s.eqNodes[j-1].connect(s.eqNodes[j]);
      s.eqNodes[s.eqNodes.length-1].connect(s.gainNode);
      s.gainNode.connect(s.panNode);
      s.panNode.connect(audioState.masterCompressor);
    }
    
    s.sourceNode = ctx.createBufferSource();
    s.sourceNode.buffer = buf;
    s.sourceNode.connect(s.eqNodes[0]);
    s.sourceNode.start();
    s.sourceNode.onended = () => { s.sourceNode = null; };
  }
};

// Синхронный запуск всех дорожек (без рассинхрона)
export async function playAllStems() {
  const ctx = initAudioContext();
  if (ctx.state === 'suspended') await ctx.resume();
  
  if (audioState.stems.some(s => s.sourceNode !== null)) {
    stopAllStems();
    return;
  }
  
  // 1. ПАРАЛЛЕЛЬНАЯ загрузка всех буферов
  const buffers = await Promise.all(audioState.stems.map(async (stem) => {
    if (!stem.url || stem.muted) return null;
    return await loadBuffer(stem);
  }));
  
  const startTime = ctx.currentTime + 0.1;
  let maxDur = 0;
  
  // 2. Планирование запуска
  for (let i = 0; i < audioState.stems.length; i++) {
    const stem = audioState.stems[i];
    const buf = buffers[i];
    if (!buf) continue;
    
    if (buf.duration > maxDur) maxDur = buf.duration;
    
    if (!stem.gainNode) {
      stem.gainNode = ctx.createGain();
      stem.gainNode.gain.value = stem.vol / 100;
            stem.panNode = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
      if (stem.panNode.pan !== undefined) stem.panNode.pan.value = stem.pan / 100;
      
      stem.eqNodes = EQ_FREQS.map((f, idx) => {
        const eq = ctx.createBiquadFilter();
        Object.assign(eq, { type: 'peaking', frequency: f, Q: 1, gain: stem.eq[idx] });
        return eq;
      });
      
      let node = stem.eqNodes[0];
      for (let j = 1; j < stem.eqNodes.length; j++) stem.eqNodes[j-1].connect(stem.eqNodes[j]);
      stem.eqNodes[stem.eqNodes.length-1].connect(stem.gainNode);
      stem.gainNode.connect(stem.panNode);
      stem.panNode.connect(audioState.masterCompressor);
    }
    
    stem.sourceNode = ctx.createBufferSource();
    stem.sourceNode.buffer = buf;
    stem.sourceNode.connect(stem.eqNodes[0]);
    stem.sourceNode.start(startTime, Math.max(0, Math.min(audioState.currentPlaybackTime, buf.duration - 0.05)));
    stem.sourceNode.onended = () => { stem.sourceNode = null; };
  }
  
  const mixDurEl = document.getElementById('mixDur');
  if (mixDurEl && maxDur > 0) mixDurEl.textContent = formatTime(maxDur);
  
  audioState.masterTimerStart = startTime;
  audioState.isPlaying = true;
  
  const mixPlayBtn = document.getElementById('mixPlayBtn');
  if (mixPlayBtn) mixPlayBtn.textContent = '⏸';
  
  startMasterTimer();
}

export function stopAllStems() {
  audioState.stems.forEach(s => {
    if (s.sourceNode) {
      try { s.sourceNode.stop(); } catch(e){}
      s.sourceNode = null;
    }
  });
  if (audioState.animationFrame) cancelAnimationFrame(audioState.animationFrame);
  audioState.animationFrame = null;
  audioState.isPlaying = false;
  
  const mixPlayBtn = document.getElementById('mixPlayBtn');
  if (mixPlayBtn) mixPlayBtn.textContent = '▶';
}
function startMasterTimer() {
  if (audioState.animationFrame) cancelAnimationFrame(audioState.animationFrame);
  
  function update() {
    if (!audioState.audioCtx || !audioState.isPlaying) {
      audioState.animationFrame = null;
      return;
    }
    
    const f = audioState.stems.find(s => s.audioBuffer);
    if (!f) {
      audioState.animationFrame = null;
      return;
    }
    
    const elapsed = (audioState.audioCtx.currentTime - audioState.masterTimerStart) + audioState.currentPlaybackTime;
    if (elapsed >= f.audioBuffer.duration) {
      stopAllStems();
      return;
    }
    
    const p = (elapsed / f.audioBuffer.duration) * 100;
    const mixFill = document.getElementById('mixFill');
    const mixThumb = document.getElementById('mixThumb');
    const mixCur = document.getElementById('mixCur');
    
    if (mixFill) mixFill.style.width = `${p}%`;
    if (mixThumb) mixThumb.style.left = `${p}%`;
    if (mixCur) mixCur.textContent = formatTime(elapsed);
    
    audioState.animationFrame = requestAnimationFrame(update);
  }
  update();
}

export function handleSeekAll(e) {
  const f = audioState.stems.find(s => s.audioBuffer);
  if (!f) return;
  
  const rect = e.currentTarget.getBoundingClientRect();
  const x = e.touches ? e.touches[0].clientX : e.clientX;
  const p = Math.max(0, Math.min(1, (x - rect.left) / rect.width));
  
  const newTime = p * f.audioBuffer.duration;
  const was = audioState.stems.some(s => s.sourceNode !== null);
  
  stopAllStems();
  audioState.currentPlaybackTime = newTime;
  if (was) playAllStems();
    const mixFill = document.getElementById('mixFill');
  const mixThumb = document.getElementById('mixThumb');
  const mixCur = document.getElementById('mixCur');
  
  if (mixFill) mixFill.style.width = `${p * 100}%`;
  if (mixThumb) mixThumb.style.left = `${p * 100}%`;
  if (mixCur) mixCur.textContent = formatTime(audioState.currentPlaybackTime);
}

// === DSP ОЧИСТКА (Вкладка CLEAN) ===
let cleanAudioBuffer = null;

export function loadCleanTrack(file) {
  if (!file) return;
  const ctx = initAudioContext();
  file.arrayBuffer().then(ab => {
    ctx.decodeAudioData(ab).then(buf => {
      cleanAudioBuffer = buf;
      const cleanTarget = document.getElementById('cleanTarget');
      if (cleanTarget) cleanTarget.style.display = 'block';
      alert('✅ Дорожка загружена для DSP обработки');
    });
  });
}

export async function applyCleanDSP() {
  if (!cleanAudioBuffer) return;
  alert('⏳ Применяю High-Pass и Noise Gate...');
  
  const ctx = initAudioContext();
  const offline = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(
    cleanAudioBuffer.numberOfChannels, cleanAudioBuffer.length, cleanAudioBuffer.sampleRate
  );
  
  const source = offline.createBufferSource();
  source.buffer = cleanAudioBuffer;
  
  const hp = offline.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = parseFloat(document.getElementById('hpFilter').value);
  
  const gate = offline.createDynamicsCompressor();
  gate.threshold.value = parseFloat(document.getElementById('gateThresh').value);
  gate.knee.value = 0;
  gate.ratio.value = 20; // Жесткий гейт
  gate.attack.value = 0.001;
  gate.release.value = 0.1;
  
  source.connect(hp);
  hp.connect(gate);  gate.connect(offline.destination);
  source.start();
  
  const rendered = await offline.startRendering();
  
  // Создаем новый стем с очищенным аудио
  const url = URL.createObjectURL(bufferToWav(rendered));
  audioState.stems.push({
    id: Date.now().toString(),
    name: 'Cleaned_' + (document.getElementById('cleanFi').files[0]?.name || 'Track'),
    emoji: '✨', color: '#1eff9c', url, audio: new Audio(url),
    audioBuffer: rendered, sourceNode: null, gainNode: null, panNode: null, eqNodes: [],
    vol: 100, muted: false, pan: 0, eq: [0,0,0,0,0]
  });
  
  renderStems();
  renderMixer();
  pushToHistory(getCurrentState());
  alert('✅ Очистка применена! Новый трек добавлен во вкладку STEMS и СВЕДЕНИЕ.');
}

// === ЭКСПОРТ В СТЕРЕО WAV С ДИТЕРИНГОМ ===
export async function exportMix() {
  if (audioState.stems.length === 0) return alert('⚠️ Нет дорожек для экспорта');
  alert('⏳ Начат рендеринг микса. Это может занять несколько секунд...');
  
  const ctx = initAudioContext();
  let maxDur = 0;
  for (const s of audioState.stems) {
    if (s.audioBuffer && !s.muted) maxDur = Math.max(maxDur, s.audioBuffer.duration);
  }
  
  if (maxDur < 0.2) return alert('❌ Ошибка: слишком короткая дорожка');
  
  const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const offline = new OfflineCtx(2, Math.ceil(ctx.sampleRate * maxDur), ctx.sampleRate);
  
  const masterNode = offline.createGain();
  const masterVolEl = document.getElementById('masterVol');
  masterNode.gain.value = masterVolEl ? parseFloat(masterVolEl.value) / 100 : 1;
  masterNode.connect(offline.destination);
  
  for (const s of audioState.stems) {
    if (!s.audioBuffer || s.muted) continue;
    const src = offline.createBufferSource();
    src.buffer = s.audioBuffer;
    const gain = offline.createGain();
    gain.gain.value = s.vol / 100;
    src.connect(gain);
    gain.connect(masterNode);    src.start();
  }
  
  const rendered = await offline.startRendering();
  
  // --- СТЕРЕО ИНТЕРЛИВИНГ С ТРЕУГОЛЬНЫМ ДИТЕРИНГОМ ---
  const numChannels = rendered.numberOfChannels;
  const sampleRate = rendered.sampleRate;
  const bitDepth = 16;
  const channels = [];
  for (let c = 0; c < numChannels; c++) channels.push(rendered.getChannelData(c));
  
  const sampleCount = rendered.length;
  const dataSize = sampleCount * numChannels * 2;
  const bufferSize = 44 + dataSize;
  const arrayBuffer = new ArrayBuffer(bufferSize);
  const view = new DataView(arrayBuffer);
  
  const writeString = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  
  writeString(0, 'RIFF');
  view.setUint32(4, bufferSize - 8, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);
  
  let offset = 44;
  for (let i = 0; i < sampleCount; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      // Треугольный дитеринг для устранения артефактов квантования при переходе в 16-бит
      let sample = Math.max(-1, Math.min(1, channels[channel][i] + (Math.random() - Math.random()) * 0.0001));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
  }
  
  const blob = new Blob([view], { type: 'audio/wav' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;  a.download = `KASKAD_Mix_${Date.now()}.wav`;
  a.click();
  URL.revokeObjectURL(url);
  alert('✅ Стерео-микс успешно экспортирован!');
}

// Auto-Gain Staging (упрощенная реализация для примера)
export function autoGainStaging() {
  if (audioState.stems.length === 0) return alert('⚠️ Нет дорожек');
  alert('⏳ Выравнивание пиков...');
  
  // В реальном приложении здесь был бы анализ пиков через OfflineAudioContext
  // Для демонстрации просто немного снижаем громкость самых громких дорожек
  audioState.stems.forEach(s => {
    if (s.vol > 120) s.vol = 100;
    if (s.gainNode) s.gainNode.gain.value = s.vol / 100;
  });
  
  renderStems();
  renderMixer();
  pushToHistory(getCurrentState());
  alert('🪄 Громкость выровнена!');
}

// Утилиты
function formatTime(s) {
  if (!isFinite(s) || s < 0) return '0:00';
  return `${Math.floor(s/60)}:${Math.floor(s%60)<10?'0':''}${Math.floor(s%60)}`;
}

function escapeHtml(s) {
  const d = document.createElement('div'); d.textContent = s; return d.innerHTML;
}

function bufferToWav(buffer) {
  // Упрощенная версия для DSP очистки (моно/стерео)
  const numChannels = buffer.numberOfChannels;
  const sampleCount = buffer.length;
  const dataSize = sampleCount * numChannels * 2;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);
  const channels = [];
  for (let c = 0; c < numChannels; c++) channels.push(buffer.getChannelData(c));
  
  const writeString = (offset, str) => { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)); };
  writeString(0, 'RIFF'); view.setUint32(4, arrayBuffer.byteLength - 8, true);
  writeString(8, 'WAVE'); writeString(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, numChannels, true);
  view.setUint32(24, buffer.sampleRate, true); view.setUint32(28, buffer.sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true); view.setUint16(34, 16, true);  writeString(36, 'data'); view.setUint32(40, dataSize, true);
  
  let offset = 44;
  for (let i = 0; i < sampleCount; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      let sample = Math.max(-1, Math.min(1, channels[channel][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
  }
  return new Blob([view], { type: 'audio/wav' });
}

function getCurrentState() {
  return {
    stems: audioState.stems.map(s => ({
      id: s.id, name: s.name, emoji: s.emoji, color: s.color,
      vol: s.vol, muted: s.muted, pan: s.pan, eq: [...s.eq]
    })),
    masterVol: document.getElementById('masterVol')?.value || 100,
    compRatio: document.getElementById('compRatio')?.value || 4,
    compThresh: document.getElementById('compThresh')?.value || -18,
    masterEQ: [1,2,3,4,5].map(i => document.getElementById(`meq${i}s`)?.value || 0)
  };
}

// Экспорт функций для main.js
export function getAudioState() { return audioState; }
export function setMasterVol(v) {
  if (audioState.masterOutputGain) audioState.masterOutputGain.gain.value = v / 100;
  const mvv = document.getElementById('mvv');
  if (mvv) mvv.textContent = v + '%';
  const mvvExp = document.getElementById('mvvExport');
  if (mvvExp) mvvExp.textContent = v + '%';
}
export function updateMasterEffects() {
  if (!audioState.masterCompressor) return;
  const r = parseFloat(document.getElementById('compRatio').value);
  const t = parseFloat(document.getElementById('compThresh').value);
  
  const compRatioVal = document.getElementById('compRatioVal');
  const compThreshVal = document.getElementById('compThreshVal');
  if (compRatioVal) compRatioVal.textContent = r + ':1';
  if (compThreshVal) compThreshVal.textContent = t + 'dB';
  
  audioState.masterCompressor.ratio.value = r;
  audioState.masterCompressor.threshold.value = t;
  
  [1,2,3,4,5].forEach(i => {
    const val = parseFloat(document.getElementById(`meq${i}s`).value);    if (audioState.masterEQNodes[i-1]) audioState.masterEQNodes[i-1].gain.value = val;
    const meq = document.getElementById(`meq${i}`);
    if (meq) meq.textContent = val;
  });
  pushToHistory(getCurrentState());
    }
