// Пользовательские экзопланеты
import { S } from '../state.js';

export function getCustomExo(id) {
  return S.customExoplanets.find(e => e.id === id) || null;
}

export function getPlanetDisplayName(id) {
  const exo = getCustomExo(id);
  if (exo) return exo.name;
  const pNames = { mercury: 'Меркурий', venus: 'Венера', earth: 'Земля', mars: 'Марс', europa: 'Европа', titan: 'Титан', pluto: 'Плутон', uranus: 'Уран', neptune: 'Нептун', haumea: 'Хаумеа', makemake: 'Макемаке', eris: 'Эрида', oort: 'Облако Оорта' };
  return pNames[id] || 'Земля';
}
