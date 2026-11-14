// Сохранение пользовательских звёзд и экзопланет в localStorage
import { STAR_CATALOG } from '../data/catalog.js';
import { viewModeBtns } from '../dom.js';
import { S } from '../state.js';
import { updateHUDViewLabels } from './hud.js';

export function saveCustomStateToStorage() {
  try {
    const customStars = STAR_CATALOG.filter(s => String(s.id).startsWith('custom_'));
    localStorage.setItem('sun_evo_v37_stars', JSON.stringify(customStars));
    localStorage.setItem('sun_evo_v37_exos', JSON.stringify(S.customExoplanets));
  } catch (e) {}
}

export function syncCustomPlanetButtons() {
  const pGroup = document.getElementById('planetGroup');
  const fGroup = document.getElementById('focusGroup');
  if (!pGroup || !fGroup) return;

  pGroup.querySelectorAll('.custom-exo-pill').forEach(el => el.remove());
  fGroup.querySelectorAll('.custom-exo-pill').forEach(el => el.remove());

  S.customExoplanets.forEach(exo => {
    if (!exo.id) exo.id = 'exo_' + Math.random().toString(36).slice(2, 7);

    const pBtn = document.createElement('button');
    pBtn.className = 'pill-item data-planet custom-exo-pill' + (S.currentPlanet === exo.id ? ' active' : '');
    pBtn.dataset.planet = exo.id;
    pBtn.innerText = '✦ ' + exo.name;
    pBtn.addEventListener('click', () => {
      S.planetBtns.forEach(b => b.classList.remove('active'));
      pBtn.classList.add('active');
      S.currentPlanet = exo.id;
      if (S.currentView === 'space' || S.currentView === 'interstellar') {
        S.currentView = 'orbit';
        viewModeBtns.forEach(b => b.classList.toggle('active', b.dataset.view === 'orbit'));
      }
      updateHUDViewLabels();
    });
    pGroup.appendChild(pBtn);

    const fBtn = document.createElement('button');
    fBtn.className = 'pill-item custom-exo-pill' + (S.cameraFocus === exo.id ? ' active' : '');
    fBtn.dataset.focus = exo.id;
    fBtn.innerText = '✦ ' + exo.name;
    fBtn.addEventListener('click', () => {
      S.focusBtns.forEach(b => b.classList.remove('active'));
      fBtn.classList.add('active');
      S.cameraFocus = exo.id;
      S.currentView = 'space';
      viewModeBtns.forEach(b => b.classList.toggle('active', b.dataset.view === 'space'));
      if (S.camZoom < 0.15) S.camZoom = 1.0;
      S.planetBtns.forEach(b => b.classList.remove('active'));
      updateHUDViewLabels();
    });
    fGroup.insertBefore(fBtn, fGroup.querySelector('[data-focus="oort"]'));
  });

  S.planetBtns = document.querySelectorAll('#planetGroup .pill-item');
  S.focusBtns = document.querySelectorAll('#focusGroup .pill-item');
}

export function loadCustomStateFromStorage() {
  try {
    const savedStars = JSON.parse(localStorage.getItem('sun_evo_v37_stars') || '[]');
    savedStars.forEach(st => {
      if (!STAR_CATALOG.some(s => s.id === st.id)) STAR_CATALOG.unshift(st);
    });
    const savedExos = JSON.parse(localStorage.getItem('sun_evo_v37_exos') || '[]');
    if (Array.isArray(savedExos) && savedExos.length > 0) {
      S.customExoplanets = savedExos;
      syncCustomPlanetButtons();
    }
  } catch (e) {}
}
