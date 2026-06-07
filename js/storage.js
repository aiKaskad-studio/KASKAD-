// js/storage.js

const DB_NAME = 'KaskadStudioDB';
const DB_VERSION = 1;
const STORE_NAME = 'projects';
const MAX_HISTORY = 30;

let dbInstance = null;
let historyStack = [];
let historyIndex = -1;
let saveStateTimeout = null;

// Инициализация IndexedDB
export async function initDB() {
  if (dbInstance) return dbInstance;
  
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    
    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };
    
    request.onerror = (event) => {
      console.error('IndexedDB error:', event.target.error);
      reject(event.target.error);
    };
  });
}

// Сохранение проекта в IndexedDB
export async function saveProject(state) {
  try {
    const db = await initDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    
    // Сохраняем только легковесные данные (без самих Blob аудиофайлов, чтобы не переполнить квоту)
    // Аудиофайлы пересоздаются из URL или загружаются заново
    const lightState = {
      id: 'current_project',
      timestamp: Date.now(),      stems: state.stems.map(s => ({
        id: s.id,
        name: s.name,
        emoji: s.emoji,
        color: s.color,
        vol: s.vol,
        muted: s.muted,
        pan: s.pan,
        eq: [...s.eq],
        url: s.url // URL сохраняется, но при перезагрузке страницы blob: URL теряются. 
                   // В полноценном приложении здесь хранится base64 или ссылка на файл.
      })),
      midiNotes: state.midiNotes || ['C4', 'E4', 'G4'],
      midiBPM: state.midiBPM || 120,
      midiWaveType: state.midiWaveType || 'sine',
      masterVol: state.masterVol || 100,
      compRatio: state.compRatio || 4,
      compThresh: state.compThresh || -18,
      masterEQ: state.masterEQ || [0, 0, 0, 0, 0],
      clipScenes: state.clipScenes || [],
      clipScript: state.clipScript || ''
    };
    
    store.put(lightState);
    
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = (event) => reject(event.target.error);
    });
  } catch (error) {
    console.error('Failed to save project:', error);
    throw error;
  }
}

// Загрузка проекта из IndexedDB
export async function loadProject() {
  try {
    const db = await initDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get('current_project');
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = (event) => reject(event.target.error);
    });
  } catch (error) {
    console.error('Failed to load project:', error);
    throw error;  }
}

// Управление историей (Undo/Redo)
export function pushToHistory(state) {
  if (saveStateTimeout) clearTimeout(saveStateTimeout);
  
  // Debounce: ждем 500мс после последнего изменения перед сохранением в историю
  saveStateTimeout = setTimeout(() => {
    // Если мы были в середине истории и сделали новое действие, отбрасываем "будущее"
    if (historyIndex < historyStack.length - 1) {
      historyStack = historyStack.slice(0, historyIndex + 1);
    }
    
    // Глубокое копирование состояния для истории
    historyStack.push(JSON.parse(JSON.stringify(state)));
    
    // Ограничиваем размер истории
    if (historyStack.length > MAX_HISTORY) {
      historyStack.shift();
    } else {
      historyIndex++;
    }
  }, 500);
}

export function undo() {
  if (historyIndex > 0) {
    historyIndex--;
    return JSON.parse(JSON.stringify(historyStack[historyIndex]));
  }
  return null;
}

export function redo() {
  if (historyIndex < historyStack.length - 1) {
    historyIndex++;
    return JSON.parse(JSON.stringify(historyStack[historyIndex]));
  }
  return null;
}

// Работа с токеном Hugging Face (только локально в браузере!)
export function saveHFToken(token) {
  if (token && token.trim().startsWith('hf_')) {
    localStorage.setItem('kaskad_hf_token', token.trim());
    return true;
  }
  return false;
}
export function getHFToken() {
  return localStorage.getItem('kaskad_hf_token') || '';
}

export function clearHFToken() {
  localStorage.removeItem('kaskad_hf_token');
}
