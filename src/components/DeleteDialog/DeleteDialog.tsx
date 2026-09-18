// Подтверждение удаления «моего» сценария A5.2 — SPEC §4.2:255, макет
// design/catalog-mockup.html:243–250. Открывает его корзина в строке «Моих»
// (Catalog → openDelete), App рендерит его при modal.kind === 'delete'.
//
// - Окно 480 px на общем Modal: отступы и закрытие — как у всех окон (§4.8:329,
//   §11 №12). Крестика в макете нет (CAT:248), поэтому closeLabel не передаётся;
//   Esc и клик по фону закрывают окно так же, как «Отмена».
// - Фокус при открытии — на «Отмена», первую кнопку окна (Modal по умолчанию):
//   для необратимого действия безопаснее. После «Отмены» он возвращается на
//   корзину; после «Удалить» строки с корзиной уже нет — SPEC это не описывает.
// - «Удалить» → removeMine: список «Моих» пишется целиком (§3.6:205), окно
//   закрывается, тост «Сценарий удалён». Не хватило места — тост про квоту
//   показал стор, список прежний, окно остаётся открытым.
// - Каталог виден только без открытого сценария (App), поэтому удалить открытый
//   сценарий из этого окна нельзя; удаление из другой вкладки (§4.7:323) — не здесь.
import { useCallback } from 'react';
import { ru } from '../../i18n/ru.ts';
import { useAppStore } from '../../state/context.ts';
import { findInLibrary } from '../../state/library.ts';
import { Button } from '../ui/Button.tsx';
import { Modal } from '../ui/Modal.tsx';

export interface DeleteDialogProps {
  /** id «моего» сценария из state.modal. */
  scenarioId: string;
}

export function DeleteDialog({ scenarioId }: DeleteDialogProps) {
  const { state, dispatch, commands } = useAppStore();

  const close = useCallback(() => {
    dispatch({ type: 'closeModal' });
  }, [dispatch]);

  const scenario = findInLibrary(state.library.items, scenarioId);
  // Сценария уже нет в «Моих» — подтверждать нечего.
  if (scenario === undefined) {
    return null;
  }
  // Окно открыто, пока в сторе запрошено удаление именно этого сценария: closeModal
  // закрывает его, даже если компонент ещё смонтирован.
  const open = state.modal?.kind === 'delete' && state.modal.scenarioId === scenarioId;

  const confirm = (): void => {
    if (!commands.removeMine(scenarioId)) {
      return;
    }
    close();
    dispatch({ type: 'showToast', message: ru.deleteDialog.deleted });
  };

  const footer = (
    <>
      <Button variant="neutral" onClick={close}>
        {ru.deleteDialog.cancel}
      </Button>
      <Button variant="destructive" onClick={confirm}>
        {ru.deleteDialog.confirm}
      </Button>
    </>
  );

  return (
    <Modal open={open} width={480} title={ru.deleteDialog.title} onClose={close} footer={footer}>
      {ru.deleteDialog.body(scenario.title)}
    </Modal>
  );
}
