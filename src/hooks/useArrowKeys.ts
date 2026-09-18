// Клавиши ← → листают шаги, как ‹ › (SPEC §4.5:290; путь — §2:52): один
// слушатель keydown на window, как в design/Демо-навигатор v2.dc.html:415–422.
// Условия §4.5:290 — сценарий загружен, окно закрыто, фокус не в input,
// textarea, select или [contenteditable]; иначе клавиши не перехватываются.
// Край (первый и последний шаг) — canPrev/canNext стора, те же, что у ‹ ›.
//
// Отступления от макета и SPEC — решение DN-13, кандидаты в уточнения SPEC:
// - с Alt, Ctrl или Meta стрелки не перехватываются: Alt+← — «назад» браузера;
// - preventDefault — только при реальном переходе (макет зовёт его всегда,
//   в том числе на краях);
// - клавиши блокирует любое окно (state.modal), а не только окно загрузки.
// Фокус на кнопке (шаг схемы, ‹ ›, «Загрузить из Excel») листать не мешает:
// §4.5:290 исключает только поля ввода.
import { useEffect } from 'react';
import { useAppStore } from '../state/context.ts';
import { canNext, canPrev } from '../state/reducer.ts';

const EDITABLE = 'input, textarea, select, [contenteditable]';

export function useArrowKeys(): void {
  const { state, dispatch } = useAppStore();
  const enabled = state.scenario !== null && state.modal === null;
  const prevAllowed = canPrev(state);
  const nextAllowed = canNext(state);

  // Флаги — зависимости эффекта: слушатель переставляется на каждой смене шага.
  // Обновление из нативного keydown React применяет с дискретным приоритетом,
  // так что следующий keydown видит уже новые флаги.
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
        return;
      }
      if (event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }
      const active = document.activeElement;
      if (active instanceof Element && active.closest(EDITABLE) !== null) {
        return;
      }
      const forward = event.key === 'ArrowRight';
      if (forward ? !nextAllowed : !prevAllowed) {
        return;
      }
      event.preventDefault();
      dispatch({ type: forward ? 'nextStep' : 'prevStep' });
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled, prevAllowed, nextAllowed, dispatch]);
}
