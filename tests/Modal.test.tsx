import { useRef, useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Modal } from '../src/components/ui/Modal';

// Modal — DN-02 (SPEC §4.8:325 «модальное окно… закрытие крестиком, «Отмена»,
// Esc и кликом по фону. Фокус при открытии — на зоне выбора файла; при
// закрытии возвращается на кнопку, открывшую окно.»). Правило дано только
// для окна загрузки (720px), но по плану поведение общее для компонента
// Modal, окно 480px (A5.2) переиспользует его без изменений.
//
// Без fake timers: фокус в Modal ставится синхронно в эффекте, а не через
// rAF/setTimeout (см. план D8), поэтому достаточно ждать через waitFor —
// это ловит и возможную регрессию на асинхронную простановку фокуса.

describe('Modal', () => {
  it('open=false — диалога нет в DOM', () => {
    render(
      <Modal open={false} title="Загрузка из Excel" width={720} onClose={vi.fn()}>
        Тело
      </Modal>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('open — role=dialog, aria-modal, доступное имя из title, data-width, рендер в портал body', () => {
    const { container } = render(
      <Modal open title="Загрузка из Excel" width={720} onClose={vi.fn()}>
        Тело
      </Modal>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName('Загрузка из Excel');
    expect(dialog).toHaveAttribute('data-width', '720');

    // Портал в document.body: диалог — не потомок узла, который отрисовал RTL.
    expect(container.contains(dialog)).toBe(false);
    expect(document.body.contains(dialog)).toBe(true);
  });

  describe('закрытие', () => {
    it('Esc вызывает onClose', () => {
      const onClose = vi.fn();
      render(
        <Modal open title="Загрузка из Excel" width={720} onClose={onClose}>
          Тело окна
        </Modal>,
      );
      fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('клик по оверлею (фону) вызывает onClose', () => {
      const onClose = vi.fn();
      render(
        <Modal open title="Загрузка из Excel" width={720} onClose={onClose}>
          Тело окна
        </Modal>,
      );
      const dialog = screen.getByRole('dialog');
      const overlay = dialog.parentElement;
      expect(overlay).not.toBeNull();
      fireEvent.click(overlay as HTMLElement);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('клик по самому диалогу и по тексту тела не закрывает окно', () => {
      const onClose = vi.fn();
      render(
        <Modal open title="Загрузка из Excel" width={720} onClose={onClose}>
          Тело окна
        </Modal>,
      );
      const dialog = screen.getByRole('dialog');
      fireEvent.click(dialog);
      fireEvent.click(screen.getByText('Тело окна'));
      expect(onClose).toHaveBeenCalledTimes(0);
    });
  });

  describe('крестик', () => {
    it('с closeLabel рендерится кнопка с этим именем и вызывает onClose', () => {
      const onClose = vi.fn();
      render(
        <Modal open title="Загрузка из Excel" width={720} closeLabel="Закрыть" onClose={onClose}>
          Тело
        </Modal>,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('без closeLabel и без кнопок в детях кнопок в диалоге нет', () => {
      render(
        <Modal open title="Загрузка из Excel" width={720} onClose={vi.fn()}>
          Просто текст без интерактивных элементов
        </Modal>,
      );
      expect(screen.queryAllByRole('button')).toHaveLength(0);
    });

    it('footer рендерится, если передан', () => {
      render(
        <Modal
          open
          title="Загрузка из Excel"
          width={720}
          onClose={vi.fn()}
          footer={<button type="button">Отмена</button>}
        >
          Тело
        </Modal>,
      );
      expect(screen.getByRole('button', { name: 'Отмена' })).toBeInTheDocument();
    });
  });

  describe('фокус при открытии', () => {
    it('уходит на initialFocusRef, если он передан', async () => {
      function Wrapper() {
        const inputRef = useRef<HTMLInputElement>(null);
        return (
          <Modal
            open
            title="Загрузка из Excel"
            width={720}
            onClose={vi.fn()}
            closeLabel="Закрыть"
            initialFocusRef={inputRef}
          >
            {/* Крестик из шапки идёт первым по DOM, но initialFocusRef важнее. */}
            <input ref={inputRef} aria-label="Файл" />
          </Modal>
        );
      }
      render(<Wrapper />);
      const input = screen.getByRole('textbox', { name: 'Файл' });
      await waitFor(() => expect(input).toHaveFocus());
    });

    it('без initialFocusRef — на первый фокусируемый элемент (крестик)', async () => {
      render(
        <Modal open title="Загрузка из Excel" width={720} closeLabel="Закрыть" onClose={vi.fn()}>
          <input aria-label="Файл" />
        </Modal>,
      );
      const closeButton = screen.getByRole('button', { name: 'Закрыть' });
      await waitFor(() => expect(closeButton).toHaveFocus());
    });

    it('без фокусируемых элементов — фокус на сам диалог', async () => {
      render(
        <Modal open title="Загрузка из Excel" width={720} onClose={vi.fn()}>
          Просто текст без интерактивных элементов
        </Modal>,
      );
      const dialog = screen.getByRole('dialog');
      await waitFor(() => expect(dialog).toHaveFocus());
    });
  });

  it('возврат фокуса: после закрытия фокус возвращается на кнопку, открывшую окно', async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Загрузить из Excel
          </button>
          <Modal
            open={open}
            title="Загрузка из Excel"
            width={720}
            closeLabel="Закрыть"
            onClose={() => setOpen(false)}
          >
            Тело
          </Modal>
        </>
      );
    }
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Загрузить из Excel' });
    trigger.focus();
    fireEvent.click(trigger);
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('опенер размонтирован в том же коммите, что закрытие (DN-ysk, §4.8:329) — фокус остаётся на body, без исключений', async () => {
    // Как ImportModal при submit: React батчит closeModal и размонтирование
    // каталога в одном коммите (кнопка-опенер — часть каталога) — cleanup
    // эффекта Modal видит уже оторванный от DOM узел и не должен пытаться
    // вызвать focus() на нём.
    function Harness() {
      const [open, setOpen] = useState(false);
      const [showTrigger, setShowTrigger] = useState(true);
      return (
        <>
          {showTrigger && (
            <button type="button" onClick={() => setOpen(true)}>
              Загрузить из Excel
            </button>
          )}
          <Modal
            open={open}
            title="Загрузка из Excel"
            width={720}
            closeLabel="Закрыть"
            onClose={() => {
              setOpen(false);
              setShowTrigger(false);
            }}
          >
            Тело
          </Modal>
        </>
      );
    }
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Загрузить из Excel' });
    trigger.focus();
    fireEvent.click(trigger);
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByRole('button', { name: 'Загрузить из Excel' })).not.toBeInTheDocument();
    expect(document.body).toHaveFocus();
  });

  it('ловушка Tab: с последнего фокусируемого элемента Tab уходит на первый, Shift+Tab с первого — на последний', async () => {
    render(
      <Modal
        open
        title="Загрузка из Excel"
        width={720}
        closeLabel="Закрыть"
        onClose={vi.fn()}
        footer={<button type="button">Добавить в мои</button>}
      >
        <input aria-label="Файл" />
      </Modal>,
    );
    const first = screen.getByRole('button', { name: 'Закрыть' });
    const last = screen.getByRole('button', { name: 'Добавить в мои' });

    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    await waitFor(() => expect(first).toHaveFocus());

    first.focus();
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    await waitFor(() => expect(last).toHaveFocus());
  });
});
