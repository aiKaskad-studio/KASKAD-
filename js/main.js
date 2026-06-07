// js/main.js

import { 
  initDB, saveProject, loadProject, undo, redo, 
  saveHFToken, getHFToken 
} from './storage.js';

import { 
  initAudioContext, loadTrack, clearTrack, renderStems, renderMixer, 
  playAllStems, stopAllStems, handleSeekAll, loadCleanTrack, applyCleanDSP, 
  exportMix, autoGainStaging, setMasterVol, updateMasterEffects 
} from './audioEngine.js';

import { 
  updateMIDIBPM, applyMIDIPreset, renderMIDIGrid, playMIDISequence, 
  stopMIDI, randomizeMIDI, setupKeyboardMIDI, getMIDIState, setMIDIState 
} from './midiEngine.js';

import { 
  updateChronoCalc, generateScript, approveScript, generateStoryboard, 
  addScene, approveStoryboard, generateAllVideos, approveVideos, 
  renderClip, exportClip, getClipState 
} from './clipEngine.js';

// === ГЛОБАЛЬНЫЕ ФУНКЦИИ ДЛЯ UI ===

function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.style.background = isError ? 'rgba(255,45,85,0.2)' : 'var(--s2)';
  toast.style.borderColor = isError ? 'var(--red)' : 'var(--border2)';
  toast.classList.add('on');
  setTimeout(() => toast.classList.remove('on'), 3000);
}

function setStatus(status) {
  const el = document.getElementById('statusTxt');
  if (el) el.textContent = status;
}

// Переключение вкладок
function setupTabs() {
  document.querySelectorAll('.nb').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      
      // Обновляем кнопки
      document.querySelectorAll('.nb').forEach(b => b.classList.remove('on'));
      btn.classList.add('on');      
      // Обновляем панели
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('on'));
      const panel = document.getElementById(`panel-${targetTab}`);
      if (panel) panel.classList.add('on');
      
      // Специфичная логика при переключении
      if (targetTab === 'clip') {
        updateChronoCalc();
      }
    });
  });
}

// Переключение этапов клипа
function setupClipStages() {
  document.querySelectorAll('.clip-stage').forEach(btn => {
    btn.addEventListener('click', () => {
      const stage = parseInt(btn.getAttribute('data-stage'), 10);
      const clipState = getClipState();
      clipState.currentStage = stage;
      
      document.querySelectorAll('.clip-stage').forEach((b, i) => {
        b.classList.toggle('active', i === stage);
        if (i < stage) b.classList.add('done');
      });
      
      document.querySelectorAll('.stage-panel').forEach((p, i) => {
        p.classList.toggle('on', i === stage);
      });
    });
  });
}

// === ИНИЦИАЛИЗАЦИЯ СОБЫТИЙ ===

function setupEventListeners() {
  // STEMS
  document.getElementById('fi').addEventListener('change', (e) => {
    if (e.target.files[0]) loadTrack(e.target.files[0]);
  });
  
  document.getElementById('clearTrackBtn').addEventListener('click', clearTrack);
  
  document.getElementById('addStemBtn').addEventListener('click', () => {
    document.getElementById('mulFi').click();
  });
  
  document.getElementById('mulFi').addEventListener('change', (e) => {
    if (e.target.files[0]) loadTrack(e.target.files[0]); // Переиспользуем loadTrack для простоты    e.target.value = ''; // Сброс для повторной загрузки того же файла
  });
  
  document.getElementById('mixPlayBtn').addEventListener('click', playAllStems);
  document.getElementById('mixStopBtn').addEventListener('click', stopAllStems);
  document.getElementById('mixSeek').addEventListener('pointerdown', handleSeekAll);

  // CLEAN
  document.getElementById('cleanFi').addEventListener('change', (e) => {
    if (e.target.files[0]) loadCleanTrack(e.target.files[0]);
  });
  document.getElementById('applyCleanBtn').addEventListener('click', applyCleanDSP);

  // MIXER / СВЕДЕНИЕ
  document.getElementById('masterVol').addEventListener('input', (e) => {
    setMasterVol(e.target.value);
  });
  document.getElementById('autoGainBtn').addEventListener('click', autoGainStaging);
  document.getElementById('exportMixBtn').addEventListener('click', exportMix);

  // MASTER
  document.getElementById('compRatio').addEventListener('input', updateMasterEffects);
  document.getElementById('compThresh').addEventListener('input', updateMasterEffects);
  ['meq1s', 'meq2s', 'meq3s', 'meq4s', 'meq5s'].forEach(id => {
    document.getElementById(id).addEventListener('input', updateMasterEffects);
  });
  
  document.querySelectorAll('.preset-mini').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.preset-mini').forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
      // Логика пресетов вшита в audioEngine.updateMasterEffects, здесь просто визуал
      const preset = btn.getAttribute('data-preset');
      const presets = { 
        spotify: {r:4, t:-18}, apple: {r:3.5, t:-20}, youtube: {r:4.5, t:-16} 
      };
      if (presets[preset]) {
        document.getElementById('compRatio').value = presets[preset].r;
        document.getElementById('compThresh').value = presets[preset].t;
        updateMasterEffects();
        showToast(`✅ Пресет ${preset} применен`);
      }
    });
  });

  // CLIP
  document.getElementById('genScriptBtn').addEventListener('click', generateScript);
  document.getElementById('approveScriptBtn').addEventListener('click', approveScript);
  document.getElementById('clipDurCalc').addEventListener('input', updateChronoCalc);
  document.getElementById('genStoryboardBtn').addEventListener('click', generateStoryboard);  document.getElementById('addSceneBtn').addEventListener('click', addScene);
  document.getElementById('approveStoryboardBtn').addEventListener('click', approveStoryboard);
  document.getElementById('genAllVideosBtn').addEventListener('click', generateAllVideos);
  document.getElementById('approveVideosBtn').addEventListener('click', approveVideos);
  document.getElementById('renderClipBtn').addEventListener('click', renderClip);
  document.getElementById('exportClipBtn').addEventListener('click', exportClip);

  // MIDI
  document.getElementById('midiBPM').addEventListener('input', (e) => updateMIDIBPM(e.target.value));
  document.getElementById('midiPlayBtn').addEventListener('click', playMIDISequence);
  document.getElementById('midiStopBtn').addEventListener('click', stopMIDI);
  document.getElementById('midiRandBtn').addEventListener('click', randomizeMIDI);
  document.getElementById('midiWaveType').addEventListener('change', (e) => {
    applyMIDIPreset(e.target.value === 'sine' ? 'pad' : e.target.value === 'square' ? 'bass' : 'synth');
  });
  
  document.querySelectorAll('.preset-mini').forEach(btn => {
    // Обработчик для MIDI пресетов (если они будут добавлены в UI отдельно, пока используем общую логику)
  });

  // PROJECT & SETTINGS
  document.getElementById('saveTokenBtn').addEventListener('click', () => {
    const token = document.getElementById('hfTokenInput').value;
    if (saveHFToken(token)) {
      showToast('✅ Токен сохранен локально');
    } else {
      showToast('⚠️ Неверный формат токена (должен начинаться с hf_)', true);
    }
  });
  
  document.getElementById('saveProjectBtn').addEventListener('click', async () => {
    showToast('⏳ Сохранение...');
    try {
      const state = {
        stems: getClipState().scenes.length > 0 ? [] : [], // Упрощено для демо
        midiNotes: getMIDIState().midiNotes,
        midiBPM: getMIDIState().midiBPM,
        midiWaveType: getMIDIState().midiWaveType,
        masterVol: document.getElementById('masterVol').value,
        compRatio: document.getElementById('compRatio').value,
        compThresh: document.getElementById('compThresh').value,
        masterEQ: [1,2,3,4,5].map(i => document.getElementById(`meq${i}s`).value),
        clipScenes: getClipState().scenes,
        clipScript: getClipState().script
      };
      await saveProject(state);
      showToast('💾 Проект сохранен');
    } catch (e) {
      showToast('❌ Ошибка сохранения', true);
    }  });

  document.getElementById('loadProjectBtn').addEventListener('click', async () => {
    showToast('⏳ Загрузка...');
    try {
      const state = await loadProject();
      if (state) {
        setMIDIState(state);
        if (state.masterVol) {
          document.getElementById('masterVol').value = state.masterVol;
          setMasterVol(state.masterVol);
        }
        if (state.compRatio) document.getElementById('compRatio').value = state.compRatio;
        if (state.compThresh) document.getElementById('compThresh').value = state.compThresh;
        if (state.masterEQ) {
          state.masterEQ.forEach((val, i) => {
            document.getElementById(`meq${i+1}s`).value = val;
          });
        }
        updateMasterEffects();
        showToast('📂 Проект загружен');
      } else {
        showToast('⚠️ Сохраненный проект не найден', true);
      }
    } catch (e) {
      showToast('❌ Ошибка загрузки', true);
    }
  });

  document.getElementById('undoBtn').addEventListener('click', () => {
    // Заглушка для демо: в полноценной версии здесь вызов undo() из storage.js
    showToast('↩️ Отмена (в разработке)');
  });
  
  document.getElementById('redoBtn').addEventListener('click', () => {
    showToast('↪️ Повтор (в разработке)');
  });

  // DRAG & DROP
  const dz = document.getElementById('dz');
  if (dz) {
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
    dz.addEventListener('drop', (e) => {
      e.preventDefault();
      dz.classList.remove('drag');
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('audio/')) {
        loadTrack(file);
      } else {        showToast('⚠️ Поддерживаются только аудиофайлы', true);
      }
    });
  }

  const cleanDz = document.getElementById('cleanDz');
  if (cleanDz) {
    cleanDz.addEventListener('dragover', (e) => { e.preventDefault(); cleanDz.classList.add('drag'); });
    cleanDz.addEventListener('dragleave', () => cleanDz.classList.remove('drag'));
    cleanDz.addEventListener('drop', (e) => {
      e.preventDefault();
      cleanDz.classList.remove('drag');
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('audio/')) {
        loadCleanTrack(file);
      }
    });
  }
}

// === ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ ===

async function initApp() {
  try {
    // 1. Инициализация БД
    await initDB();
    
    // 2. Инициализация аудио
    initAudioContext();
    
    // 3. Инициализация MIDI
    renderMIDIGrid();
    setupKeyboardMIDI();
    
    // 4. Настройка UI
    setupTabs();
    setupClipStages();
    setupEventListeners();
    
    // 5. Восстановление токена
    const savedToken = getHFToken();
    if (savedToken) {
      document.getElementById('hfTokenInput').value = savedToken;
    }
    
    // 6. Стартовое сообщение
    setStatus('READY');
    showToast('🎧 KASKAD Professional AI Studio готов!');
    
  } catch (error) {    console.error('Ошибка инициализации:', error);
    setStatus('ERROR');
    showToast('❌ Ошибка запуска приложения', true);
  }
}

// Запуск при загрузке DOM
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

// Очистка при закрытии вкладки
window.addEventListener('beforeunload', () => {
  const audioCtx = window.audioState?.audioCtx; // Доступ через глобальный объект, если экспортирован, или через замыкание
  // В данной архитектуре лучше полагаться на сборщик мусора, но явное закрытие полезно
  try {
    if (typeof initAudioContext === 'function') {
      const ctx = initAudioContext();
      if (ctx && ctx.state !== 'closed') ctx.close();
    }
  } catch (e) {}
});
