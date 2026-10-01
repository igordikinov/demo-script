// Окно «Перенести в общие» A5.3 — SPEC §4.2:255, DN-rmz. Открывает его иконка
// со стрелкой вниз в строке «Моих» (Catalog → openExport), App рендерит при
// modal.kind === 'export'.
//
// - Окно 480 px на общем Modal, крестика нет — как у A5.2: Esc и клик по фону
//   закрывают окно так же, как «Закрыть» (§4.8:329, §11 №12).
// - Primary «Отправить в репозиторий» коммитит книгу в main через GitHub API
//   (gh/publish.ts): файл существует — заменяется (строка «заменит» выше),
//   push запускает CI, сценарий появится в «Общих» после деплоя. Право даёт
//   fine-grained токен из поля «GitHub-токен»; после первого успеха он
//   запоминается в localStorage (ghToken.ts) и поле больше не обязательно.
//   401/403 — текст про токен, сохранённый токен забывается; сеть — свой
//   текст; SheetJS не загрузился — «не получилось».
// - «Скачать .xlsx вручную» — ссылка в теле: прежний путь без токена, файл
//   кладётся в scenarios/ руками.
// - Успех меняет тело окна: «Отправлено», текст про пару минут сборки и ссылка
//   на коммит. Окно остаётся открытым до «Закрыть».
import { useCallback, useId, useState } from 'react';
import { ru } from '../../i18n/ru.ts';
import { exportFileName, exportScenarioId } from '../../excel/export.ts';
import { GH_TOKEN_CREATE_URL, publishScenario } from '../../gh/publish.ts';
import { useAppStore } from '../../state/context.ts';
import { findInLibrary, getBrowserStorage } from '../../state/library.ts';
import { clearGhToken, readGhToken, writeGhToken } from '../../state/ghToken.ts';
import { downloadMine } from '../ui/download.ts';
import { Button } from '../ui/Button.tsx';
import { Modal } from '../ui/Modal.tsx';
import styles from './ExportDialog.module.css';

/** Отправка: до неё, идёт, готово, отказ с причиной. */
type SendState =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent'; commitUrl: string }
  | { kind: 'error'; error: 'auth' | 'network' | 'other' };

export interface ExportDialogProps {
  /** id «моего» сценария из state.modal. */
  scenarioId: string;
}

export function ExportDialog({ scenarioId }: ExportDialogProps) {
  const { state, dispatch } = useAppStore();
  const [send, setSend] = useState<SendState>({ kind: 'idle' });
  const [token, setToken] = useState(() => readGhToken(getBrowserStorage()) ?? '');
  const [tokenStored, setTokenStored] = useState(() => readGhToken(getBrowserStorage()) !== null);
  const tokenId = useId();

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

  const forget = (): void => {
    clearGhToken(getBrowserStorage());
    setTokenStored(false);
    setToken('');
  };

  const doSend = async (): Promise<void> => {
    const value = token.trim();
    if (value === '' || send.kind === 'sending' || send.kind === 'sent') {
      return;
    }
    setSend({ kind: 'sending' });
    let next: SendState;
    try {
      const result = await publishScenario(scenario, value);
      if (result.ok) {
        // Первый успех запоминает токен; повторный — уже сохранён.
        writeGhToken(getBrowserStorage(), value);
        setTokenStored(true);
        next = { kind: 'sent', commitUrl: result.commitUrl };
      } else {
        if (result.error === 'auth') {
          clearGhToken(getBrowserStorage());
          setTokenStored(false);
        }
        next = { kind: 'error', error: result.error };
      }
    } catch {
      // SheetJS не загрузился и книгу собрать не удалось (как у шаблона, §6).
      next = { kind: 'error', error: 'other' };
    }
    setSend(next);
  };

  let errorText: string | null = null;
  if (send.kind === 'error') {
    errorText =
      send.error === 'auth'
        ? ru.exportDialog.errorAuth
        : send.error === 'network'
          ? ru.exportDialog.errorNetwork
          : ru.exportDialog.errorOther;
  }

  const footer =
    send.kind === 'sent' ? (
      <Button variant="neutral" onClick={close}>
        {ru.exportDialog.cancel}
      </Button>
    ) : (
      <>
        <Button variant="neutral" onClick={close} disabled={send.kind === 'sending'}>
          {ru.exportDialog.cancel}
        </Button>
        <Button
          variant="primary"
          disabled={token.trim() === '' || send.kind === 'sending'}
          onClick={() => {
            void doSend();
          }}
        >
          {send.kind === 'sending' ? ru.exportDialog.sending : ru.exportDialog.send}
        </Button>
      </>
    );

  return (
    <Modal open={open} width={480} title={ru.exportDialog.title} onClose={close} footer={footer}>
      {send.kind === 'sent' ? (
        <>
          <p className={styles.paragraph}>
            <b>{ru.exportDialog.sentTitle}</b>
          </p>
          <p className={styles.paragraph}>{ru.exportDialog.sentText}</p>
          <p className={styles.paragraph}>
            <a className={styles.link} href={send.commitUrl} target="_blank" rel="noreferrer">
              {ru.exportDialog.sentLink}
            </a>
          </p>
        </>
      ) : (
        <>
          <p className={styles.paragraph}>{ru.exportDialog.body(file)}</p>
          {exists && <p className={styles.paragraph}>{ru.exportDialog.exists}</p>}
          <p className={styles.paragraph}>{ru.exportDialog.stays}</p>
          <div className={styles.tokenBlock}>
            <label htmlFor={tokenId} className={styles.tokenLabel}>
              {ru.exportDialog.tokenLabel}
            </label>
            <input
              id={tokenId}
              type="password"
              className={styles.tokenInput}
              value={token}
              autoComplete="off"
              disabled={send.kind === 'sending'}
              onChange={(event) => {
                setToken(event.target.value);
              }}
            />
            <p className={styles.tokenHint}>
              {ru.exportDialog.tokenHint}{' '}
              <a
                className={styles.link}
                href={GH_TOKEN_CREATE_URL}
                target="_blank"
                rel="noreferrer"
              >
                {ru.exportDialog.tokenLink}
              </a>
              {tokenStored && (
                <>
                  {' · '}
                  <button type="button" className={styles.link} onClick={forget}>
                    {ru.exportDialog.forgetToken}
                  </button>
                </>
              )}
            </p>
          </div>
          {errorText !== null && (
            <p role="alert" className={styles.error}>
              {errorText}
            </p>
          )}
          <p className={styles.paragraph}>
            <button
              type="button"
              className={styles.link}
              onClick={() => {
                downloadMine(scenario).catch(() => undefined);
              }}
            >
              {ru.exportDialog.downloadManual}
            </button>
          </p>
        </>
      )}
    </Modal>
  );
}
