// Панель спектра: режимы и подсказки по линиям
import { peakWavelengthText, planckCanvas, spectrumCanvas, spectrumHeadlineText, spectrumModeToggleBtn } from '../dom.js';
import { S } from '../state.js';

let probeTimer = null;

export function inspectSpectrumAtX(clientX, targetCanvas) {
  const canvasEl = targetCanvas || spectrumCanvas;
  const rect = canvasEl.getBoundingClientRect();
  const clickX = clientX - rect.left;
  const frac = Math.max(0, Math.min(1, clickX / rect.width));

  if (S.spectrumMode === 'star') {
    const clickedNm = Math.round(380 + frac * (750 - 380));
    let info = `${clickedNm} нм: Непрерывный спектр фотосферы`;

    if (Math.abs(clickedNm - 393) <= 15) {
      info = "Ca II (393.4 нм): Ионизованный кальций";
    } else if (Math.abs(clickedNm - 486) <= 15) {
      info = "H-β (486.1 нм): Бальмеровский водород";
    } else if (Math.abs(clickedNm - 589) <= 15) {
      info = "Na D (589.0 нм): Дублет нейтрального натрия";
    } else if (Math.abs(clickedNm - 656) <= 15) {
      info = "H-α (656.3 нм): Хромосфера и протуберанцы";
    }
    S.spectralProbeInfo = info;
  } else if (S.spectrumMode === 'atmosphere') {
    const lambdaUm = (0.5 + frac * 4.5).toFixed(2);
    let info = `${lambdaUm} мкм: ИК-окно атмосферы`;
    if (Math.abs(lambdaUm - 0.6) <= 0.25) info = "O₃ (0.6 мкм): Озоновый слой (биосигнатура)";
    else if (Math.abs(lambdaUm - 1.4) <= 0.35) info = "H₂O (1.4 мкм): Водяной пар (парник/океан)";
    else if (Math.abs(lambdaUm - 2.3) <= 0.35) info = "CH₄ (2.3 мкм): Метан (органика/биосигнатура)";
    else if (Math.abs(lambdaUm - 4.3) <= 0.45) info = "CO₂ (4.3 мкм): Углекислый газ (атмосфера)";
    S.spectralProbeInfo = info;
  }

  if (peakWavelengthText && S.spectralProbeInfo) {
    peakWavelengthText.innerText = S.spectralProbeInfo;
  }

  clearTimeout(probeTimer);
  probeTimer = setTimeout(() => {
    S.spectralProbeInfo = "";
  }, 5000);
}

// Подписки на события (выполнялись при загрузке страницы)
export function initSpectrum() {
  spectrumCanvas.addEventListener('click', (e) => inspectSpectrumAtX(e.clientX, spectrumCanvas));

  spectrumCanvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) inspectSpectrumAtX(e.touches[0].clientX, spectrumCanvas);
  }, { passive: true });

  planckCanvas.addEventListener('click', (e) => inspectSpectrumAtX(e.clientX, planckCanvas));

  planckCanvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) inspectSpectrumAtX(e.touches[0].clientX, planckCanvas);
  }, { passive: true });

  spectrumModeToggleBtn.addEventListener('click', () => {
    if (S.spectrumMode === 'star') {
      S.spectrumMode = 'atmosphere';
      spectrumModeToggleBtn.innerText = 'Атмосфера';
      spectrumHeadlineText.innerText = 'Спектроскопия';
    } else if (S.spectrumMode === 'atmosphere') {
      S.spectrumMode = 'transit';
      spectrumModeToggleBtn.innerText = 'Транзит';
      spectrumHeadlineText.innerText = 'Кривая блеска';
    } else {
      S.spectrumMode = 'star';
      spectrumModeToggleBtn.innerText = 'Звезда';
      spectrumHeadlineText.innerText = 'Спектр';
    }
  });
}
