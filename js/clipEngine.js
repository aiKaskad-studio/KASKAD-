// js/clipEngine.js
import { getHFToken } from './storage.js';
import { getAudioState } from './audioEngine.js';

export const clipState = {
  script: '',
  scenes: [],
  clipBlob: null,
  ffmpeg: null,
  ffmpegLoaded: false,
  currentStage: 0
};

// Экспорт для доступа из main.js
export function getClipState() { return clipState; }
export function setClipStage(stage) { clipState.currentStage = stage; }

// 1. ХРОНОМЕТРАЖ: Автоматический расчет количества сцен
export function updateChronoCalc() {
  const audioState = getAudioState();
  const durSlider = parseFloat(document.getElementById('clipDurCalc').value);
  const durValEl = document.getElementById('clipDurCalcVal');
  if (durValEl) durValEl.textContent = durSlider + 'с';
  
  let songDuration = 0;
  // Ищем длительность первого загруженного аудио
  for (const s of audioState.stems) {
    if (s.audio && s.audio.duration) {
      songDuration = s.audio.duration;
      break;
    }
  }
  
  const chronoInfo = document.getElementById('chronoInfo');
  if (songDuration > 0) {
    const totalScenes = Math.ceil(songDuration / durSlider);
    if (chronoInfo) {
      chronoInfo.innerHTML = `🎵 Длительность песни: <b>${formatTime(songDuration)}</b><br>🎬 Требуется сцен: <b>${totalScenes}</b> (по ${durSlider} сек каждая)`;
    }
  } else {
    if (chronoInfo) chronoInfo.textContent = '⚠️ Загрузи музыку во вкладке STEMS для автоматического расчета.';
  }
}

// 2. СЦЕНАРИЙ: Генерация через Hugging Face API
export async function generateScript() {
  const lyrics = document.getElementById('lyricsInput').value;
  if (!lyrics) return alert('⚠️ Введи текст песни');
  
  const token = getHFToken();  const style = document.getElementById('scriptStyle').value;
  const prompt = `Ты режиссёр музыкальных клипов. Создай сценарий из 4-6 сцен в стиле "${style}" для песни:\n"""${lyrics}"""\nФормат:\nСЦЕНА 1: [короткое название]\n[описание действия, локации, что происходит в такт музыке]`;

  alert('⏳ ИИ пишет сценарий... (это может занять 10-20 секунд)');
  
  try {
    const res = await fetch('https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.3', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ inputs: prompt, parameters: { max_new_tokens: 800 } })
    });
    
    if (!res.ok) throw new Error(`API Error: ${res.status}`);
    const data = await res.json();
    
    const generatedText = data[0]?.generated_text || prompt + '\n\n(Напиши сценарий вручную)';
    const scriptTextEl = document.getElementById('scriptText');
    if (scriptTextEl) scriptTextEl.value = generatedText;
    
    const scriptResultEl = document.getElementById('scriptResult');
    if (scriptResultEl) scriptResultEl.style.display = 'block';
    
    alert('✅ Сценарий готов! Отредактируй его при необходимости и нажми "Утвердить".');
  } catch (error) {
    console.error(error);
    alert('⚠️ API занят или ошибка сети. Ты можешь написать сценарий вручную в появившемся поле.');
    const scriptTextEl = document.getElementById('scriptText');
    if (scriptTextEl) scriptTextEl.value = 'СЦЕНА 1: Вступление\n[Опиши визуальный ряд]\n\nСЦЕНА 2: ...\n\n(Отредактируй вручную)';
    const scriptResultEl = document.getElementById('scriptResult');
    if (scriptResultEl) scriptResultEl.style.display = 'block';
  }
}

export function approveScript() {
  const scriptTextEl = document.getElementById('scriptText');
  clipState.script = scriptTextEl ? scriptTextEl.value : '';
  if (!clipState.script.trim()) return alert('⚠️ Сценарий пуст');
  
  goToStage(1);
  updateChronoCalc();
  alert('✅ Сценарий утверждён. Переход к раскадровке.');
}

// 3. РАСКАДРОВКА: Парсинг сценария в сцены
export function generateStoryboard() {
  if (!clipState.script) return alert('⚠️ Сначала утверди сценарий');
    const durSlider = parseFloat(document.getElementById('clipDurCalc').value);
  let songDuration = 0;
  for (const s of getAudioState().stems) {
    if (s.audio && s.audio.duration) { songDuration = s.audio.duration; break; }
  }
  const targetScenes = songDuration > 0 ? Math.ceil(songDuration / durSlider) : 4;
  
  const blocks = clipState.script.split(/СЦЕНА\s+\d+[:\.]/i).filter(s => s.trim());
  clipState.scenes = [];
  
  for (let i = 0; i < targetScenes; i++) {
    const block = blocks[i] || `Сцена ${i+1}\nПродолжение действия`;
    const lines = block.trim().split('\n');
    const style = document.getElementById('scriptStyle').value;
    
    clipState.scenes.push({
      title: lines[0]?.trim() || `Сцена ${i+1}`,
      description: lines.slice(1).join(' '),
      prompt: `cinematic music video, ${lines.slice(1).join(' ')}, 4k, highly detailed, ${style} style, smooth motion, professional color grading`,
      duration: durSlider,
      videoUrl: null,
      videoBlob: null
    });
  }
  
  renderStoryboard();
  alert(`✅ Создано ${targetScenes} сцен по ${durSlider}с. Проверь и отредактируй промпты.`);
}

function renderStoryboard() {
  const container = document.getElementById('storyboardList');
  if (!container) return;
  
  container.innerHTML = clipState.scenes.map((s, i) => `
    <div class="scene-card">
      <div class="scene-head">
        <div class="scene-num">${i+1}</div>
        <input type="text" value="${escapeHtml(s.title)}" oninput="clipState.scenes[${i}].title=this.value" style="flex:1;border:none;background:transparent;color:var(--white);font-weight:600">
      </div>
      <textarea oninput="clipState.scenes[${i}].description=this.value" style="min-height:40px;font-size:9px">${escapeHtml(s.description)}</textarea>
      <div style="font-size:8px;color:var(--gold3);margin:4px 0">🎨 Промпт для видео (${s.duration}с):</div>
      <textarea oninput="clipState.scenes[${i}].prompt=this.value" style="min-height:50px;font-size:9px;color:var(--gold2)">${escapeHtml(s.prompt)}</textarea>
    </div>
  `).join('');
}

export function addScene() {
  const dur = parseFloat(document.getElementById('clipDurCalc').value);
  clipState.scenes.push({
    title: 'Новая сцена',    description: '',
    prompt: 'cinematic music video frame, highly detailed',
    duration: dur,
    videoUrl: null,
    videoBlob: null
  });
  renderStoryboard();
}

export function approveStoryboard() {
  if (clipState.scenes.length === 0) return alert('⚠️ Нет сцен');
  goToStage(2);
  alert('✅ Раскадровка утверждена. Переход к генерации видео.');
}

// 4. ВИДЕО: Генерация через Hugging Face (Zeroscope)
export async function generateAllVideos() {
  if (clipState.scenes.length === 0) return alert('⚠️ Сначала создай раскадровку');
  
  const pw = document.getElementById('videoProg');
  const bar = document.getElementById('videoFill');
  const txt = document.getElementById('videoTxt');
  if (pw) pw.classList.add('on');
  
  const token = getHFToken();
  
  for (let i = 0; i < clipState.scenes.length; i++) {
    if (bar) bar.style.width = `${(i / clipState.scenes.length) * 100}%`;
    if (txt) txt.textContent = `Оживление сцены ${i+1} из ${clipState.scenes.length}...`;
    
    try {
      await generateSingleVideo(i, token);
      // Пауза между запросами, чтобы не превысить лимиты HF
      await new Promise(r => setTimeout(r, 2000));
    } catch (error) {
      console.error(`Ошибка сцены ${i+1}:`, error);
      if (txt) txt.textContent = `Ошибка сцены ${i+1}. Пропуск...`;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  
  if (bar) bar.style.width = '100%';
  if (txt) txt.textContent = 'Готово!';
  setTimeout(() => { if (pw) pw.classList.remove('on'); }, 1500);
  
  renderVideos();
  alert('✅ Видео сцены сгенерированы! Проверь результат.');
}

async function generateSingleVideo(index, token) {  const scene = clipState.scenes[index];
  if (!scene.prompt) return;
  
  const res = await fetch('https://api-inference.huggingface.co/models/cerspense/zeroscope_v2_576w', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    },
    body: JSON.stringify({ inputs: scene.prompt, parameters: { num_frames: 24 } })
  });
  
  if (!res.ok) throw new Error(`API Error: ${res.status}`);
  
  const blob = await res.blob();
  if (scene.videoUrl) URL.revokeObjectURL(scene.videoUrl);
  scene.videoUrl = URL.createObjectURL(blob);
  scene.videoBlob = blob;
  
  renderVideos(); // Обновляем UI по мере готовности
}

export async function regenerateSingleVideo(index) {
  alert(`⏳ Перегенерация сцены ${index + 1}...`);
  const token = getHFToken();
  try {
    await generateSingleVideo(index, token);
    alert('✅ Кадр обновлен');
  } catch (error) {
    console.error(error);
    alert('❌ Ошибка API. Попробуй позже.');
  }
}

function renderVideos() {
  const container = document.getElementById('videoList');
  if (!container) return;
  
  container.innerHTML = clipState.scenes.map((s, i) => `
    <div class="scene-card">
      <div class="scene-head">
        <div class="scene-num">${i+1}</div>
        <div class="scene-title">${escapeHtml(s.title)} (${s.duration}с)</div>
      </div>
      <div class="scene-preview">
        ${s.videoUrl ? `<video src="${s.videoUrl}" controls loop></video>` : '<span>⏳ Не сгенерировано</span>'}
      </div>
      <button class="btn small" onclick="window.clipActions.regenerate(${i})">🔄 Перегенерировать</button>
    </div>
  `).join('');}

export function approveVideos() {
  const readyCount = clipState.scenes.filter(s => s.videoBlob).length;
  if (readyCount === 0) return alert('⚠️ Нет готовых видео. Сгенерируй их сначала.');
  goToStage(3);
  updateTimeline();
  alert(`✅ ${readyCount} кадров готовы. Переход к монтажу.`);
}

// 5. МОНТАЖ: FFmpeg.wasm склейка
export function updateTimeline() {
  const track = document.getElementById('timelineTrack');
  if (!track) return;
  
  track.innerHTML = clipState.scenes.filter(s => s.videoBlob).map((s, i) => `
    <div class="timeline-clip" style="min-width:${s.duration * 40}px" title="${s.title}">
      <video src="${s.videoUrl}" muted></video>
    </div>
  `).join('');
}

export async function renderClip() {
  const readyScenes = clipState.scenes.filter(s => s.videoBlob);
  if (readyScenes.length === 0) return alert('⚠️ Нет видео для монтажа');
  
  const pw = document.getElementById('renderProg');
  const bar = document.getElementById('renderFill');
  const txt = document.getElementById('renderTxt');
  if (pw) pw.classList.add('on');
  
  try {
    // 1. Инициализация FFmpeg
    if (!clipState.ffmpegLoaded) {
      if (txt) txt.textContent = 'Загрузка FFmpeg (это может занять 10-20 сек)...';
      if (bar) bar.style.width = '10%';
      
      // FFmpeg загружается глобально из CDN
      const FFmpegClass = window.FFmpeg || (typeof FFmpeg !== 'undefined' ? FFmpeg : null);
      if (!FFmpegClass) throw new Error('FFmpeg не загружен из CDN');
      
      clipState.ffmpeg = new FFmpegClass();
      
      clipState.ffmpeg.on('progress', ({ progress }) => {
        if (bar) bar.style.width = `${20 + progress * 70}%`;
        if (txt) txt.textContent = `Рендеринг: ${Math.floor(progress * 100)}%`;
      });
      
      await clipState.ffmpeg.load({
        coreURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js',        wasmURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm'
      });
      clipState.ffmpegLoaded = true;
    }
    
    // 2. Загрузка файлов в виртуальную ФС FFmpeg
    if (txt) txt.textContent = 'Загрузка видеофрагментов...';
    if (bar) bar.style.width = '20%';
    
    let concatList = '';
    for (let i = 0; i < readyScenes.length; i++) {
      const arrayBuf = await readyScenes[i].videoBlob.arrayBuffer();
      await clipState.ffmpeg.writeFile(`scene${i}.mp4`, new Uint8Array(arrayBuf));
      concatList += `file 'scene${i}.mp4'\nduration ${readyScenes[i].duration}\n`;
    }
    concatList += `file 'scene${readyScenes.length-1}.mp4'`; // Последний кадр для завершения
    await clipState.ffmpeg.writeFile('concat.txt', concatList);
    
    // 3. Склейка видео
    if (txt) txt.textContent = 'Склейка видео...';
    if (bar) bar.style.width = '50%';
    
    await clipState.ffmpeg.exec([
      '-f', 'concat', '-safe', '0', '-i', 'concat.txt',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-y', 'video_only.mp4'
    ]);
    
    // 4. Сведение с музыкой (если есть)
    const audioState = getAudioState();
    const musicStem = audioState.stems.find(s => s.url && !s.muted);
    
    if (musicStem && musicStem.url) {
      if (txt) txt.textContent = 'Сведение с музыкой...';
      if (bar) bar.style.width = '80%';
      
      const musicData = await fetch(musicStem.url).then(r => r.arrayBuffer());
      await clipState.ffmpeg.writeFile('music.mp3', new Uint8Array(musicData));
      
      await clipState.ffmpeg.exec([
        '-i', 'video_only.mp4', '-i', 'music.mp3',
        '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
        '-shortest', '-map', '0:v:0', '-map', '1:a:0',
        '-y', 'final.mp4'
      ]);
    } else {
      await clipState.ffmpeg.exec(['-i', 'video_only.mp4', '-c', 'copy', '-y', 'final.mp4']);
    }
    
    // 5. Извлечение результата
    if (txt) txt.textContent = 'Финализация...';    if (bar) bar.style.width = '95%';
    
    const data = await clipState.ffmpeg.readFile('final.mp4');
    clipState.clipBlob = new Blob([data.buffer], { type: 'video/mp4' });
    
    if (bar) bar.style.width = '100%';
    if (txt) txt.textContent = 'Готово!';
    
    // Показ превью
    const previewUrl = URL.createObjectURL(clipState.clipBlob);
    const previewEl = document.getElementById('clipPreview');
    if (previewEl) previewEl.innerHTML = `<video src="${previewUrl}" controls style="width:100%;height:100%;object-fit:contain"></video>`;
    
    setTimeout(() => { if (pw) pw.classList.remove('on'); }, 1500);
    alert('✅ Клип успешно смонтирован! Переходи к экспорту.');
    
  } catch (error) {
    console.error('FFmpeg Error:', error);
    alert('❌ Ошибка рендера: ' + error.message);
    if (pw) pw.classList.remove('on');
  }
}

export function exportClip() {
  if (!clipState.clipBlob) return alert('⚠️ Сначала выполни рендер клипа');
  const url = URL.createObjectURL(clipState.clipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `KASKAD_Clip_${Date.now()}.mp4`;
  a.click();
  URL.revokeObjectURL(url);
  alert('✅ Видео клип скачан!');
}

// Глобальные действия для HTML
window.clipActions = {
  regenerate: (index) => regenerateSingleVideo(index)
};

// Утилиты
function formatTime(s) {
  if (!isFinite(s) || s < 0) return '0:00';
  return `${Math.floor(s/60)}:${Math.floor(s%60)<10?'0':''}${Math.floor(s%60)}`;
}

function escapeHtml(s) {
  const d = document.createElement('div'); d.textContent = s; return d.innerHTML;
}

function goToStage(stage) {  clipState.currentStage = stage;
  document.querySelectorAll('.clip-stage').forEach((el, i) => {
    el.classList.toggle('active', i === stage);
    if (i < stage) el.classList.add('done');
  });
  document.querySelectorAll('.stage-panel').forEach((p, i) => p.classList.toggle('on', i === stage));
      }
