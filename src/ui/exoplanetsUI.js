// Окно конструктора экзопланет
import { clearExoBtn, closeExoModalBtn, createExoBtn, exoDistSlider, exoDistVal, exoNameInput, exoTypeSelect, exoplanetBtn, exoplanetModal, viewModeBtns } from '../dom.js';
import { S } from '../state.js';
import { updateHUDViewLabels } from './hud.js';
import { saveCustomStateToStorage, syncCustomPlanetButtons } from './storage.js';



// Подписки на события (выполнялись при загрузке страницы)
export function initExoplanetsUI() {
  exoplanetBtn.addEventListener('click', () => { exoplanetModal.style.display = 'flex'; });

  closeExoModalBtn.addEventListener('click', () => { exoplanetModal.style.display = 'none'; });

  exoDistSlider.addEventListener('input', (e) => {
    exoDistVal.innerText = `${parseFloat(e.target.value).toFixed(2)} а.е.`;
  });

  createExoBtn.addEventListener('click', () => {
    const dist = parseFloat(exoDistSlider.value);
    const name = exoNameInput.value.trim() || `Экзопланета-${S.customExoplanets.length + 1}`;
    const type = exoTypeSelect.value;
    const newExoId = `exo_${Date.now()}`;
    S.customExoplanets.push({
      id: newExoId,
      name: name,
      baseDistAU: dist,
      birthMass: Math.max(0.1, S.selectedStarMass),
      type: type,
      seedAngle: Math.random() * Math.PI * 2
    });
    syncCustomPlanetButtons();
    saveCustomStateToStorage();
    exoplanetModal.style.display = 'none';
    if (S.currentView !== 'space') {
      S.currentView = 'space';
      viewModeBtns.forEach(b => b.classList.toggle('active', b.dataset.view === 'space'));
      updateHUDViewLabels();
    }
  });

  clearExoBtn.addEventListener('click', () => {
    S.customExoplanets.length = 0;
    S.customExoplanets = [];
    if (String(S.currentPlanet).startsWith('exo_')) S.currentPlanet = 'earth';
    if (String(S.cameraFocus).startsWith('exo_')) S.cameraFocus = 'sun';
    syncCustomPlanetButtons();
    saveCustomStateToStorage();
    updateHUDViewLabels();
    exoplanetModal.style.display = 'none';
  });
}
