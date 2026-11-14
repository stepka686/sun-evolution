// Экспедиции (туры по эпохам)
import { expExitBtn, expNextBtn, expPrevBtn, expStepTag, expText, expTitle, expeditionBtn, expeditionCard, viewModeBtns } from '../dom.js';
import { getExpeditionSteps } from '../model/expeditions.js';
import { S } from '../state.js';
import { updateHUDViewLabels } from './hud.js';

export function applyExpeditionStep(stepIndex) {
  const steps = getExpeditionSteps();

  if (stepIndex < 0 || stepIndex >= steps.length) return;
  S.currentExpStep = stepIndex;
  const step = steps[stepIndex];

  S.currentAge = step.t;
  S.currentView = step.view;

  viewModeBtns.forEach(b => b.classList.toggle('active', b.dataset.view === S.currentView));

  if (step.planet) {
    S.currentPlanet = step.planet;
    S.planetBtns.forEach(b => b.classList.toggle('active', b.dataset.planet === S.currentPlanet));
  }

  if (step.focus) {
    S.cameraFocus = step.focus;
    S.focusBtns.forEach(b => b.classList.toggle('active', b.dataset.focus === S.cameraFocus));
  }

  expTitle.innerText = step.title;
  expText.innerText = step.text;
  expStepTag.innerText = `Шаг ${stepIndex + 1} из ${steps.length}`;

  expPrevBtn.disabled = stepIndex === 0;
  expNextBtn.innerText = stepIndex === steps.length - 1 ? 'Завершить тур' : 'Далее';
  updateHUDViewLabels();
}

// Подписки на события (выполнялись при загрузке страницы)
export function initExpedition() {
  expeditionBtn.addEventListener('click', () => {
    S.isExpeditionActive = !S.isExpeditionActive;
    expeditionBtn.classList.toggle('active', S.isExpeditionActive);
    expeditionCard.style.display = S.isExpeditionActive ? 'flex' : 'none';
    if (S.isExpeditionActive) applyExpeditionStep(0);
  });

  expPrevBtn.addEventListener('click', () => {
    if (S.currentExpStep > 0) applyExpeditionStep(S.currentExpStep - 1);
  });

  expNextBtn.addEventListener('click', () => {
    const steps = getExpeditionSteps();
    if (S.currentExpStep < steps.length - 1) {
      applyExpeditionStep(S.currentExpStep + 1);
    } else {
      S.isExpeditionActive = false;
      expeditionBtn.classList.remove('active');
      expeditionCard.style.display = 'none';
    }
  });

  expExitBtn.addEventListener('click', () => {
    S.isExpeditionActive = false;
    expeditionBtn.classList.remove('active');
    expeditionCard.style.display = 'none';
  });
}
