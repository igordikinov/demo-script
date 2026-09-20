// Корень приложения: стор (SPEC §1:15) → шапка A0 (§4.1), область содержимого,
// окно загрузки A4 (§4.8:329) и хост тоста (§4.8:350). В области содержимого —
// каталог, пока сценарий не открыт (§4.2:245, §4.7:320; DN-24). Открытый
// сценарий (DN-26) — раскладка v2:43–90: полоса схемы на всю ширину под шапкой
// (§4.3:263), под ней main с карточкой шага (§4.4:273). Полоса — соседка main,
// а не его часть, как в макете; у main в обоих вариантах меняется только класс.
// Под карточкой в том же main — встроенная карта процесса, если раскрыта
// (§4.4:285, §4.6:311; DN-15): соседка article, как в макете v2:171.
// Клавиши ← → — §4.5:290 (DN-13): слушатель один на приложение, в AppShell.
// AppShell выделен, чтобы хост тоста можно было проверить с initialState.
import { useLayoutEffect, useRef } from 'react';
import { useAppStore } from './state/context.ts';
import { useArrowKeys } from './hooks/useArrowKeys.ts';
import { useStepDeepLink } from './hooks/useStepDeepLink.ts';
import { StoreProvider } from './state/store.tsx';
import { Header } from './components/Header/Header.tsx';
import { ImportModal } from './components/ImportModal/ImportModal.tsx';
import { DeleteDialog } from './components/DeleteDialog/DeleteDialog.tsx';
import { Catalog } from './components/Catalog/Catalog.tsx';
import { ScenarioScheme } from './components/ScenarioScheme/ScenarioScheme.tsx';
import { StepCard } from './components/StepCard/StepCard.tsx';
import { ProcessMapSection } from './components/ProcessMapSection/ProcessMapSection.tsx';
import { Toast } from './components/ui/Toast.tsx';
import styles from './App.module.css';

export function AppShell() {
  const { state, dispatch } = useAppStore();
  useArrowKeys();
  useStepDeepLink();
  const { toast, modal, scenario } = state;
  const scenarioId = scenario?.id ?? null;
  const shownScenarioId = useRef(scenarioId);

  // Смена экрана (открыт сценарий, другой сценарий или возврат в каталог)
  // начинается с верха страницы, как в design/v2-card.png: иначе прокрутка
  // каталога (страница прокручивается целиком, SPEC §4.10:358) переходит на
  // экран сценария и шапка с «‹ Сценарии» (§4.1:241) уезжает за край окна.
  // Layout-, а не обычный эффект: он успевает до passive-эффектов экрана
  // (полосы схемы и карточки), и сброс не спорит с их прокруткой. С DN-91e
  // полоса окно и не двигает: она правит только свой scrollLeft (§4.3:267).
  // Первый рендер пропускается — страница и так наверху.
  useLayoutEffect(() => {
    if (shownScenarioId.current === scenarioId) {
      return;
    }
    shownScenarioId.current = scenarioId;
    window.scrollTo(0, 0);
  }, [scenarioId]);

  return (
    <>
      <Header />
      {scenario !== null && <ScenarioScheme />}
      <main className={scenario === null ? undefined : styles.scenario}>
        {scenario === null ? (
          <Catalog />
        ) : (
          <>
            <StepCard />
            <ProcessMapSection />
          </>
        )}
      </main>
      {/* Монтируется на каждое открытие: после «Отмены» окно снова пустое. */}
      {modal?.kind === 'import' && <ImportModal />}
      {/* Подтверждение удаления «моего» A5.2 (§4.2:255): его открывает корзина каталога. */}
      {modal?.kind === 'delete' && <DeleteDialog scenarioId={modal.scenarioId} />}
      {/* restartKey={seq}: повтор того же текста перезапускает отсчёт; key не ставить — пересоздаст живой регион role="status". */}
      <Toast
        restartKey={toast?.seq}
        message={toast?.message ?? null}
        onDismiss={() => {
          dispatch({ type: 'dismissToast' });
        }}
      />
    </>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <AppShell />
    </StoreProvider>
  );
}
