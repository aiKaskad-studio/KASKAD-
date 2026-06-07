// js/midiEngine.js

export const midiState = {
  midiNotes: ['C4', 'E4', 'G4'],
  midiBPM: 120,
  midiWaveType: 'sine',
  isMIDIPlaying: false,
  midiPart: null,
  toneSynth: null,
  isToneInitialized: false,
  activeKeys: new Set()
};

// Карта соответствия клавиш клавиатуры нотам
const midiKeyMap = {
  'a': 'C4', 'w': 'C#4', 's': 'D4', 'e': 'D#4',
  'd': 'E4', 'f': 'F4', 't': 'F#4', 'g': 'G4',
  'y': 'G#4', 'h': 'A4', 'u': 'A#4', 'j': 'B4',
  'k': 'C5'
};

const MIDI_PRESETS = {
  piano: { wave: 'triangle', attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.3 },
  synth: { wave: 'sawtooth', attack: 0.001, decay: 0.05, sustain: 0.8, release: 0.2 },
  bass: { wave: 'square', attack: 0.005, decay: 0.02, sustain: 0.5, release: 0.1 },
  pad: { wave: 'sine', attack: 0.05, decay: 0.2, sustain: 0.6, release: 0.5 }
};

// Инициализация Tone.js
export async function initTone() {
  if (midiState.isToneInitialized) return true;
  if (typeof Tone === 'undefined') {
    console.error('Tone.js не загружен');
    return false;
  }
  
  try {
    await Tone.start();
    Tone.Transport.bpm.value = midiState.midiBPM;
    
    midiState.toneSynth = new Tone.Synth({
      oscillator: { type: midiState.midiWaveType },
      envelope: { attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.3 }
    }).toDestination();
    
    midiState.isToneInitialized = true;
    return true;
  } catch (error) {
    console.error('Ошибка инициализации Tone.js:', error);
    return false;  }
}

// Обновление BPM из UI
export function updateMIDIBPM(v) {
  midiState.midiBPM = parseInt(v, 10);
  const bpmValueEl = document.getElementById('bpmValue');
  if (bpmValueEl) bpmValueEl.textContent = midiState.midiBPM;
  
  if (typeof Tone !== 'undefined' && Tone.Transport) {
    Tone.Transport.bpm.value = midiState.midiBPM;
  }
}

// Применение пресета синтезатора
export function applyMIDIPreset(presetName) {
  const preset = MIDI_PRESETS[presetName];
  if (!preset) return;
  
  midiState.midiWaveType = preset.wave;
  const waveSelect = document.getElementById('midiWaveType');
  if (waveSelect) waveSelect.value = preset.wave;
  
  document.getElementById('midiAttack').value = preset.attack;
  document.getElementById('midiDecay').value = preset.decay;
  document.getElementById('midiSustain').value = preset.sustain;
  document.getElementById('midiRelease').value = preset.release;
  
  // Обновляем параметры синтезатора в реальном времени
  if (midiState.toneSynth) {
    midiState.toneSynth.set({
      oscillator: { type: preset.wave },
      envelope: {
        attack: preset.attack,
        decay: preset.decay,
        sustain: preset.sustain,
        release: preset.release
      }
    });
  }
}

// Отрисовка MIDI-сетки
export function renderMIDIGrid() {
  const grid = document.getElementById('midiGrid');
  if (!grid) return;
  
  grid.innerHTML = '';
  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octaves = [3, 4, 5];  
  octaves.forEach(oct => {
    notes.forEach(note => {
      const noteName = `${note}${oct}`;
      const div = document.createElement('div');
      div.className = 'midi-note' + (midiState.midiNotes.includes(noteName) ? ' active' : '');
      div.setAttribute('data-note', noteName);
      div.textContent = noteName;
      
      div.onclick = () => {
        const idx = midiState.midiNotes.indexOf(noteName);
        if (idx === -1) {
          midiState.midiNotes.push(noteName);
        } else {
          midiState.midiNotes.splice(idx, 1);
        }
        renderMIDIGrid();
      };
      
      grid.appendChild(div);
    });
  });
}

// Воспроизведение секвенции
export async function playMIDISequence() {
  if (midiState.midiNotes.length === 0) {
    alert('⚠️ Нет выбранных нот');
    return;
  }
  
  const inited = await initTone();
  if (!inited) return;
  
  // Если уже играет, останавливаем
  if (midiState.isMIDIPlaying) {
    stopMIDI();
    return;
  }
  
  const beatDuration = 60 / midiState.midiBPM;
  
  // Создаем паттерн: каждая нота играет на свою 8-ю долю
  midiState.midiPart = new Tone.Part((time, note) => {
    if (midiState.toneSynth) {
      midiState.toneSynth.triggerAttackRelease(note, "8n", time);
    }
  }, midiState.midiNotes.map((note, i) => [i * beatDuration, note]));
  
  midiState.midiPart.loop = false;  Tone.Transport.start();
  midiState.isMIDIPlaying = true;
  
  const playBtn = document.getElementById('midiPlayBtn');
  if (playBtn) playBtn.textContent = '⏸ Пауза';
}

// Остановка воспроизведения
export function stopMIDI() {
  if (midiState.midiPart) {
    try {
      midiState.midiPart.stop();
      midiState.midiPart.dispose();
    } catch (e) {}
    midiState.midiPart = null;
  }
  
  if (typeof Tone !== 'undefined' && Tone.Transport) {
    try { Tone.Transport.stop(); } catch (e) {}
  }
  
  midiState.isMIDIPlaying = false;
  const playBtn = document.getElementById('midiPlayBtn');
  if (playBtn) playBtn.textContent = '▶ Играть';
}

// Генерация случайного паттерна
export function randomizeMIDI() {
  midiState.midiNotes = [];
  const notes = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  for (let i = 0; i < 8; i++) {
    const randomNote = notes[Math.floor(Math.random() * notes.length)];
    const randomOct = 3 + Math.floor(Math.random() * 3);
    midiState.midiNotes.push(`${randomNote}${randomOct}`);
  }
  renderMIDIGrid();
}

// Настройка управления с клавиатуры
export function setupKeyboardMIDI() {
  window.addEventListener('keydown', async (e) => {
    const note = midiKeyMap[e.key.toLowerCase()];
    // Игнорируем повторные нажатия и ввод в поля формы
    if (note && !e.repeat && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA' && document.activeElement?.tagName !== 'SELECT') {
      e.preventDefault();
      const inited = await initTone();
      if (!inited || !midiState.toneSynth) return;
      
      if (!midiState.activeKeys.has(note)) {
        midiState.activeKeys.add(note);        midiState.toneSynth.triggerAttack(note);
        
        // Визуальная подсветка
        const el = document.querySelector(`.midi-note[data-note="${note}"]`);
        if (el) el.classList.add('key-active');
      }
    }
  });

  window.addEventListener('keyup', (e) => {
    const note = midiKeyMap[e.key.toLowerCase()];
    if (note && midiState.toneSynth) {
      e.preventDefault();
      midiState.activeKeys.delete(note);
      midiState.toneSynth.triggerRelease(note);
      
      // Убираем визуальную подсветку
      const el = document.querySelector(`.midi-note[data-note="${note}"]`);
      if (el) el.classList.remove('key-active');
    }
  });

  // Сброс всех нот при потере фокуса окном (чтобы ноты не "залипали")
  window.addEventListener('blur', () => {
    midiState.activeKeys.forEach(note => {
      if (midiState.toneSynth) midiState.toneSynth.triggerRelease(note);
      const el = document.querySelector(`.midi-note[data-note="${note}"]`);
      if (el) el.classList.remove('key-active');
    });
    midiState.activeKeys.clear();
  });
}

// Экспорт состояния для сохранения/загрузки
export function getMIDIState() {
  return {
    midiNotes: [...midiState.midiNotes],
    midiBPM: midiState.midiBPM,
    midiWaveType: midiState.midiWaveType
  };
}

export function setMIDIState(state) {
  if (state.midiNotes) midiState.midiNotes = state.midiNotes;
  if (state.midiBPM) {
    midiState.midiBPM = state.midiBPM;
    const bpmEl = document.getElementById('midiBPM');
    if (bpmEl) bpmEl.value = midiState.midiBPM;
    const bpmValEl = document.getElementById('bpmValue');
    if (bpmValEl) bpmValEl.textContent = midiState.midiBPM;  }
  if (state.midiWaveType) {
    midiState.midiWaveType = state.midiWaveType;
    const waveEl = document.getElementById('midiWaveType');
    if (waveEl) waveEl.value = midiState.midiWaveType;
  }
  renderMIDIGrid();
  }
