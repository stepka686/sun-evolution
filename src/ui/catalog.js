// Каталог звёзд и конструктор светил
import { STAR_CATALOG } from '../data/catalog.js';
import { formatFeH, metalFraction } from '../model/mistTracks.js';
import { catalogFilterBtns, closeCatalogModalBtn, forgeCreateBtn, forgeFehSlider, forgeFehVal, forgeMassSlider, forgeMassVal, forgeNameInput, starCatalogBtn, starCatalogGrid, starCatalogModal } from '../dom.js';
import { BROWN_DWARF_LIMIT } from '../physics/stellar.js';
import { S } from '../state.js';
import { saveCustomStateToStorage } from './storage.js';
import { selectStarById } from './timeControls.js';

export function renderStarCatalogCards(filterCat) {
  if (!starCatalogGrid) return;
  starCatalogGrid.innerHTML = '';
  const filtered = filterCat === 'all' ? STAR_CATALOG : STAR_CATALOG.filter(s => s.cat === filterCat);

  filtered.forEach(star => {
    const card = document.createElement('div');
    const isSelected = (star.id === S.selectedStarId);
    card.style.cssText = `
      background: ${isSelected ? 'rgba(37, 99, 235, 0.22)' : 'rgba(255, 255, 255, 0.03)'};
      border: 1px solid ${isSelected ? '#3b82f6' : 'rgba(255, 255, 255, 0.08)'};
      border-radius: 8px;
      padding: 8px 10px;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: 3px;
      transition: all 0.15s ease;
    `;
    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <strong style="font-size: 0.82rem; color: ${isSelected ? '#93c5fd' : '#f8fafc'};">${star.name}</strong>
        <span style="font-size: 0.68rem; color: #38bdf8; font-family: monospace;">${star.mass} M☉</span>
      </div>
      <div style="font-size: 0.68rem; color: #facc15;">Класс: ${star.spec}${star.feh !== undefined ? ` <span style="color:#a5b4fc">• [Fe/H] ${formatFeH(star.feh)}</span>` : ''}</div>
      <p style="font-size: 0.68rem; color: #94a3b8; line-height: 1.3; margin-top: 2px;">${star.desc}</p>
    `;
    card.addEventListener('click', () => {
      selectStarById(star.id);
      starCatalogModal.style.display = 'none';
    });
    starCatalogGrid.appendChild(card);
  });
}

// Подписки на события (выполнялись при загрузке страницы)
export function initCatalog() {
  starCatalogBtn.addEventListener('click', () => {
    renderStarCatalogCards('all');
    starCatalogModal.style.display = 'flex';
  });

  closeCatalogModalBtn.addEventListener('click', () => {
    starCatalogModal.style.display = 'none';
  });

  catalogFilterBtns.forEach(b => {
    b.addEventListener('click', () => {
      catalogFilterBtns.forEach(btn => btn.classList.remove('active'));
      b.classList.add('active');
      renderStarCatalogCards(b.dataset.cat);
    });
  });

  if (forgeMassSlider && forgeMassVal) {
    forgeMassSlider.addEventListener('input', (e) => {
      forgeMassVal.innerText = `${parseFloat(e.target.value).toFixed(2)} M☉`;
    });
  }
  if (forgeFehSlider && forgeFehVal) {
    forgeFehSlider.addEventListener('input', (e) => {
      const f = parseFloat(e.target.value);
      forgeFehVal.innerText = `${formatFeH(f)} (Z = ${metalFraction(f).toPrecision(2)})`;
    });
  }

  if (forgeCreateBtn) {
    forgeCreateBtn.addEventListener('click', () => {
      const mass = parseFloat(forgeMassSlider.value) || 1.0;
      const feh = forgeFehSlider ? (parseFloat(forgeFehSlider.value) || 0) : 0;
      const name = (forgeNameInput.value.trim() || `Светилище-${mass}M☉`);
      const customId = `custom_${Date.now()}`;
  
      const newStar = {
        id: customId,
        name: name,
        cat: 'exotic',
        mass: mass,
        feh: feh,
        startAge: 0.0,
        spec: mass > 20 ? 'O3V' : (mass > 8 ? 'B2V' : (mass > 1.5 ? 'A5V' : (mass < BROWN_DWARF_LIMIT ? 'L/T (BD)' : (mass < 0.45 ? 'M4V' : (mass < 0.8 ? 'K5V' : 'G2V'))))),
        desc: `Пользовательская звезда ${name} с начальной массой ${mass} M☉ и металличностью [Fe/H] = ${formatFeH(feh)}.`
      };
  
      STAR_CATALOG.unshift(newStar);
      saveCustomStateToStorage();
      selectStarById(customId);
      starCatalogModal.style.display = 'none';
    });
  }
}
