// Адрес `?scenario=<id>&step=<stepId>` — SPEC §4.7:320–325 (путь — §2:52).
// Активный сценарий и шаг живут только в адресе, в хранилище не пишутся (§3.6:207).
//
// 1. Разбор при старте — один раз (§4.7:325):
//    - `scenario` нет или пуст → каталог (§4.7:320). closeScenario не зовётся: каталог
//      и так начальное состояние, а initialState с открытым сценарием трогать нельзя;
//    - `my-…` → из библиотеки (заметка DN-09: через openScenario, без проверки шага
//      вручную); нет → тост notFoundLocal (§4.7:321);
//    - иначе → commands.openShared(id, step) (заметка DN-23). Любой `false` — 404,
//      сеть, не по схеме, чужой id внутри, недопустимый id — тост notFoundShared:
//      SPEC сетевую ошибку от «не найден» не отличает. Пока файл грузится, виден
//      каталог; index.json открытие не ждёт;
//    - `step` нет, пуст или не найден → первый шаг — это делает редьюсер (§4.7:322).
//    Флаг «уже разобрано» — в ref, без отмены в cleanup: StrictMode запускает эффект
//    дважды, и шаблон `cancelled` из store.tsx отменил бы первый запуск, а второй
//    пропустился бы по ref — адрес не начал бы следовать за стором.
// 2. Адрес следует за стором (§4.7:323–324) — только после разбора, иначе адрес
//    общего стёрся бы, пока грузится файл. Открыт сценарий → `scenario` и `step`;
//    каталог → оба убираются, в том числе после «не найден» (§4.7:321). Всегда
//    history.replaceState с прежним history.state, никогда pushState: приложение
//    живёт в iframe вики, «назад» браузера не поддерживается (§4.7:324). Путь (base
//    './', подкаталог Pages — §7:380) и hash не трогаются. Адрес после «Добавить в
//    мои» — тот же путь через openScenario (§4.8:350); id при замене прежний, ссылка
//    `my-…` продолжает работать (§3.6:203).
//    Остальные параметры сохраняются (§4.7:324), но URLSearchParams пересобирает
//    строку: `a%20b` → `a+b`, `flag` → `flag=`. Смысл тот же — принятый риск. Чтобы
//    каталог без `scenario` и `step` не трогал адрес вовсе, replaceState зовётся,
//    только если href изменился.
// 3. «Мои» изменены в другой вкладке — событие `storage` (§4.7:323, заметка DN-23):
//    «Мои» перечитываются, открытый «мой», которого больше нет, → каталог. Тоста нет:
//    текста в SPEC нет. `key === null` — localStorage.clear() в другой вкладке —
//    тоже изменение «Моих». Хранилище недоступно → событие не трогает «Мои» в памяти.
//
// Пробелы (src/state не меняется):
// - гонка: пока грузится общий из адреса, пользователь может открыть другой из
//   каталога; ответ openShared откроет сценарий из адреса поверх выбора;
// - хранилище из пропа `storage` провайдера наружу не отдаётся — событие `storage`
//   перечитывает window.localStorage (getBrowserStorage);
// - открытый «мой», заменённый в другой вкладке, остаётся прежним до переоткрытия.
import { useEffect, useRef, useState } from 'react';
import { ru } from '../i18n/ru.ts';
import { useAppStore } from '../state/context.ts';
import { LIBRARY_KEY, findInLibrary, getBrowserStorage, readLibrary } from '../state/library.ts';

interface StartLink {
  id: string;
  /** `undefined` — `step` в адресе нет; пустой или неизвестный разбирает редьюсер. */
  step: string | undefined;
}

/** Параметры адреса при старте; `null` — `scenario` нет или пуст (§4.7:320). */
function readStartLink(): StartLink | null {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('scenario') ?? '';
  return id === '' ? null : { id, step: params.get('step') ?? undefined };
}

export function useStepDeepLink(): void {
  const { state, dispatch, commands } = useAppStore();
  // Адрес читается один раз — при первом рендере (§4.7:325).
  const [start] = useState(readStartLink);
  const [resolved, setResolved] = useState(start === null);
  const started = useRef(false);
  const libraryItems = state.library.items;
  const scenarioId = state.scenario?.id ?? null;
  const { stepId } = state;
  const openLocalId = state.scenario?.source === 'local' ? state.scenario.id : null;

  // 1. Разбор при старте.
  useEffect(() => {
    if (start === null || started.current) {
      return;
    }
    started.current = true;
    if (start.id.startsWith('my-')) {
      const found = findInLibrary(libraryItems, start.id);
      if (found === undefined) {
        dispatch({ type: 'showToast', message: ru.deepLink.notFoundLocal(start.id) });
      } else {
        dispatch({ type: 'openScenario', scenario: found, stepId: start.step });
      }
      setResolved(true);
      return;
    }
    void commands.openShared(start.id, start.step).then((opened) => {
      if (!opened) {
        dispatch({ type: 'showToast', message: ru.deepLink.notFoundShared(start.id) });
      }
      setResolved(true);
    });
  }, [start, commands, dispatch, libraryItems]);

  // 2. Адрес следует за стором.
  useEffect(() => {
    if (!resolved) {
      return;
    }
    const url = new URL(window.location.href);
    const params = new URLSearchParams(url.search);
    if (scenarioId === null) {
      if (!params.has('scenario') && !params.has('step')) {
        return;
      }
      params.delete('scenario');
      params.delete('step');
    } else {
      params.set('scenario', scenarioId);
      if (stepId === null) {
        params.delete('step');
      } else {
        params.set('step', stepId);
      }
    }
    // Пустая строка убирает и «?».
    url.search = params.toString();
    if (url.href !== window.location.href) {
      window.history.replaceState(window.history.state, '', url.href);
    }
  }, [resolved, scenarioId, stepId]);

  // 3. «Мои» изменены в другой вкладке.
  useEffect(() => {
    const handleStorage = (event: StorageEvent): void => {
      if (event.key !== LIBRARY_KEY && event.key !== null) {
        return;
      }
      const read = readLibrary(getBrowserStorage());
      if (!read.available) {
        return;
      }
      dispatch({ type: 'librarySet', items: read.items });
      if (openLocalId !== null && findInLibrary(read.items, openLocalId) === undefined) {
        dispatch({ type: 'closeScenario' });
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
    };
  }, [dispatch, openLocalId]);
}
