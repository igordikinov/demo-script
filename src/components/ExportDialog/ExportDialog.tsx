// Окно «Перенести в общие» A5.3 — SPEC §4.2:255, DN-rmz. Открывает его иконка
// со стрелкой вниз в строке «Моих» (Catalog → openExport), App рендерит при
// modal.kind === 'export'.
//
// - Окно 480 px на общем Modal, крестика нет — как у A5.2: Esc и клик по фону
//   закрывают окно так же, как «Закрыть» (§4.8:329, §11 №12).
// - Фокус при открытии — на «Закрыть», первую кнопку окна (Modal по
//   умолчанию): скачивание можно повторить, закрытие безопаснее.
// - Имя файла — exportFileName: слаг названия без `my-` плюс `.xlsx`
//   (§3.6:203); по этому имени файл ляжет в scenarios/ и станет id общего.
// - «Скачать .xlsx» собирает книгу тем же построителем, что шаблон (§6), и
//   отдаёт её браузеру (download.ts); окно остаётся открытым — можно скачать
//   снова или закрыть.
// - Совпадение имени с существующим общим — строка «файл его заменит»:
//   по этому имени в scenarios/ уже лежит другой файл, коммит перезапишет его.
import { useCallback } from 'react';
import { ru } from '../../i18n/ru.ts';
import { exportFileName, exportScenarioId } from '../../excel/export.ts';
import { useAppStore } from '../../state/context.ts';
import { findInLibrary } from '../../state/library.ts';
import { downloadMine } from '../ui/download.ts';
import { Button } from '../ui/Button.tsx';
import { Modal } from '../ui/Modal.tsx';
import styles from './ExportDialog.module.css';

export interface ExportDialogProps {
  /** id «моего» сценария из state.modal. */
  scenarioId: string;
}

export function ExportDialog({ scenarioId }: ExportDialogProps) {
  const { state, dispatch } = useAppStore();

  const close = useCallback(() => {
    dispatch({ type: 'closeModal' });
  }, [dispatch]);

  const scenario = findInLibrary(state.library.items, scenarioId);
  // Сценария уже нет в «Моих» — переносить нечего.
  if (scenario === undefined) {
    return null;
  }
  // Окно открыто, пока в сторе запрошен перенос именно этого сценария, —
  // как у DeleteDialog: closeModal закрывает его до размонтирования.
  const open = state.modal?.kind === 'export' && state.modal.scenarioId === scenarioId;

  const file = exportFileName(scenario);
  const exists =
    state.shared.status === 'ready' &&
    state.shared.items.some((item) => item.id === exportScenarioId(scenario));

  const footer = (
    <>
      <Button variant="neutral" onClick={close}>
        {ru.exportDialog.cancel}
      </Button>
      <Button
        variant="primary"
        onClick={() => {
          void downloadMine(scenario);
        }}
      >
        {ru.exportDialog.submit}
      </Button>
    </>
  );

  return (
    <Modal open={open} width={480} title={ru.exportDialog.title} onClose={close} footer={footer}>
      <p className={styles.paragraph}>{ru.exportDialog.body(file)}</p>
      {exists && <p className={styles.paragraph}>{ru.exportDialog.exists}</p>}
      <p className={styles.paragraph}>{ru.exportDialog.stays}</p>
    </Modal>
  );
}
