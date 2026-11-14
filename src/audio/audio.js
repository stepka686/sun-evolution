// Звук
import { soundBtn } from '../dom.js';
import { getAsteroseismicData } from '../model/activity.js';
import { S } from '../state.js';
import { createModeSynth } from './stellarSound.js';
import { seismology } from '../model/interior.js';

let modes = null;

let audioCtx = null;

let spaceOsc1 = null;

let spaceOsc2 = null;

let spaceGain = null;

let atmosNoise = null;

let atmosFilter = null;

let atmosGain = null;

let masterGain = null;

export function initAudio() {
  if (audioCtx) return;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext();

    masterGain = audioCtx.createGain();
    masterGain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    masterGain.connect(audioCtx.destination);

    spaceGain = audioCtx.createGain();
    spaceGain.gain.setValueAtTime(0.18, audioCtx.currentTime);
    spaceGain.connect(masterGain);

    const spaceFilter = audioCtx.createBiquadFilter();
    spaceFilter.type = 'lowpass';
    spaceFilter.frequency.setValueAtTime(220, audioCtx.currentTime);
    spaceFilter.connect(spaceGain);

    spaceOsc1 = audioCtx.createOscillator();
    spaceOsc1.type = 'sawtooth';
    spaceOsc1.frequency.setValueAtTime(55, audioCtx.currentTime);
    spaceOsc1.connect(spaceFilter);

    spaceOsc2 = audioCtx.createOscillator();
    spaceOsc2.type = 'sine';
    spaceOsc2.frequency.setValueAtTime(56.5, audioCtx.currentTime);
    spaceOsc2.connect(spaceFilter);

    atmosGain = audioCtx.createGain();
    atmosGain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    atmosGain.connect(masterGain);

    atmosFilter = audioCtx.createBiquadFilter();
    atmosFilter.type = 'bandpass';
    atmosFilter.frequency.setValueAtTime(400, audioCtx.currentTime);
    atmosFilter.Q.setValueAtTime(1.5, audioCtx.currentTime);
    atmosFilter.connect(atmosGain);

    const bufferSize = audioCtx.sampleRate * 2;
    const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    atmosNoise = audioCtx.createBufferSource();
    atmosNoise.buffer = noiseBuffer;
    atmosNoise.loop = true;
    atmosNoise.connect(atmosFilter);

    // 5.1: спектр p-мод — мимо фильтра низких частот, сразу на общую громкость космоса
    modes = createModeSynth(audioCtx, spaceGain);

    spaceOsc1.start();
    spaceOsc2.start();
    atmosNoise.start();
  } catch (e) {
    console.warn("Audio init error", e);
  }
}

export function updateAudio(state) {
  if (!audioCtx || !S.isSoundOn) return;
  try {
    const t = audioCtx.currentTime;
    if (S.currentView === 'space' || S.currentView === 'interstellar') {
      spaceGain.gain.setTargetAtTime(0.20, t, 0.1);
      atmosGain.gain.setTargetAtTime(0.0001, t, 0.1);

      if (S.isDeepTime && state.temp < 1000) {
        masterGain.gain.setTargetAtTime(0.0001, t, 0.2);
        return;
      }

      const seismic = getAsteroseismicData(state);
      const baseFreq = seismic.freqHz;

      if (S.selectedStarMass >= 20.0 && state.r < 0.001) {
        // Чёрная дыра: гравитационный инфразвук горизонта событий
        spaceOsc1.frequency.setTargetAtTime(32.0, t, 0.15);
        spaceOsc2.frequency.setTargetAtTime(32.8, t, 0.15);
      } else if (S.selectedStarMass >= 8.0 && state.r < 0.001) {
        // Радиопульсар: быстрая модуляция луча
        spaceOsc1.frequency.setTargetAtTime(440.0, t, 0.1);
        spaceOsc2.frequency.setTargetAtTime(443.5, t, 0.1);
      } else if (state.r < 0.05) {
        // Белый карлик: высокочастотный хрустальный тон
        spaceOsc1.frequency.setTargetAtTime(587.3, t, 0.1);
        spaceOsc2.frequency.setTargetAtTime(591.0, t, 0.1);
      } else {
        // Колебания недр: если у звезды есть конвективная оболочка — звучит её настоящий спектр p-мод,
        // иначе (горячие звёзды) — прежний ровный тон
        const q = seismology(state.mass || S.selectedStarMass, state.r, state.temp);
        if (q && modes) {
          modes.update(q.numax, q.dnu, true);
          spaceOsc1.frequency.setTargetAtTime(Math.max(20, baseFreq * 0.25), t, 0.15);
          spaceOsc2.frequency.setTargetAtTime(Math.max(20, baseFreq * 0.25 * 1.003), t, 0.15);
          return;
        }
        spaceOsc1.frequency.setTargetAtTime(baseFreq, t, 0.15);
        spaceOsc2.frequency.setTargetAtTime(baseFreq * 1.502, t, 0.15);
      }
      if (modes) modes.update(0, 0, false);
    } else {
      if (modes) modes.update(0, 0, false);
      spaceGain.gain.setTargetAtTime(0.02, t, 0.1);
      if (S.currentPlanet === 'earth') {
        if (state.t < 5.5 && !S.isDeepTime) {
          atmosFilter.type = 'lowpass';
          atmosFilter.frequency.setTargetAtTime(450, t, 0.1);
          atmosGain.gain.setTargetAtTime(0.18, t, 0.1);
        } else if (state.t < 11.5 && !S.isDeepTime) {
          atmosFilter.type = 'bandpass';
          atmosFilter.frequency.setTargetAtTime(700, t, 0.1);
          atmosGain.gain.setTargetAtTime(0.22, t, 0.1);
        } else {
          atmosGain.gain.setTargetAtTime(0.0001, t, 0.1);
        }
      } else if (S.currentPlanet === 'mars') {
        if (state.t >= 7.0 && state.t <= 9.8 && !S.isDeepTime) {
          atmosFilter.type = 'bandpass';
          atmosFilter.frequency.setTargetAtTime(550, t, 0.1);
          atmosGain.gain.setTargetAtTime(0.20, t, 0.1);
        } else {
          atmosFilter.type = 'highpass';
          atmosFilter.frequency.setTargetAtTime(1200, t, 0.1);
          atmosGain.gain.setTargetAtTime(0.08, t, 0.1);
        }
      } else if (S.currentPlanet === 'venus') {
        atmosFilter.type = 'lowpass';
        atmosFilter.frequency.setTargetAtTime(180, t, 0.1);
        atmosGain.gain.setTargetAtTime(0.30, t, 0.1);
      } else {
        atmosGain.gain.setTargetAtTime(0.0001, t, 0.1);
      }
    }
  } catch (e) {
    console.warn("Audio error", e);
  }
}

export function toggleAudio() {
  initAudio();
  if (!audioCtx) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();
  S.isSoundOn = !S.isSoundOn;
  if (S.isSoundOn) {
    soundBtn.classList.add('active');
    soundBtn.innerText = 'Звук: Вкл';
    masterGain.gain.setTargetAtTime(0.2, audioCtx.currentTime, 0.15);
  } else {
    soundBtn.classList.remove('active');
    soundBtn.innerText = 'Звук: Выкл';
    masterGain.gain.setTargetAtTime(0.0001, audioCtx.currentTime, 0.1);
  }
}

// Подписки на события (выполнялись при загрузке страницы)
export function initAudioControls() {
  soundBtn.addEventListener('click', toggleAudio);
}
