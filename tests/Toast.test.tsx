import { render } from '@testing-library/react';
import { Toast } from '../src/components/ui/Toast';

// Toast — SPEC §4.8:346 «тост «Сценарий добавлен в „Мои“…» на 3,2 с.» —
// единственное место, где длительность задана явно; 3200 мс взяты как
// значение по умолчанию (план D9). role="status" — обязательный live-регион,
// чтобы скринридер прочитал текст тоста без явного управления фокусом.
// Регион role="status" — один и тот же DOM-узел всё время жизни компонента
// (план DN-k9y): его не пересоздаёт ни смена текста, ни message=null. Проп
// `restartKey` перезапускает отсчёт и заменяет только внутренний узел с
// текстом; сам регион при этом не трогается.
describe('Toast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('дефолтная длительность 3200 мс: onDismiss не вызван до неё и вызван по её истечении', () => {
    const onDismiss = vi.fn();
    const { getByRole } = render(<Toast message="Сценарий удалён" onDismiss={onDismiss} />);
    expect(getByRole('status')).toHaveTextContent('Сценарий удалён');

    vi.advanceTimersByTime(3199);
    expect(onDismiss).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('message=null — регион пуст и таймер не запускается', () => {
    const onDismiss = vi.fn();
    const { getByRole } = render(<Toast message={null} onDismiss={onDismiss} />);
    expect(getByRole('status')).toBeEmptyDOMElement();

    vi.advanceTimersByTime(10_000);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('новый текст на середине показа перезапускает отсчёт заново', () => {
    const onDismiss = vi.fn();
    const { rerender } = render(<Toast message="Сценарий удалён" onDismiss={onDismiss} />);

    vi.advanceTimersByTime(2000);
    rerender(<Toast message="Сценарий обновлён: 5 шагов" onDismiss={onDismiss} />);

    vi.advanceTimersByTime(3199);
    expect(onDismiss).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('одинаковый текст подряд не перезапускает таймер (без restartKey) — колбэк на момент срабатывания берётся актуальный', () => {
    const onDismissA = vi.fn();
    const onDismissB = vi.fn();
    const { rerender } = render(<Toast message="Сценарий удалён" onDismiss={onDismissA} />);

    vi.advanceTimersByTime(2000);
    // Текст не меняется, меняется только функция — эффект таймера от него
    // не зависит (onDismiss хранится в ref), поэтому обратный отсчёт не
    // сбрасывается на 3200 мс заново.
    rerender(<Toast message="Сценарий удалён" onDismiss={onDismissB} />);

    vi.advanceTimersByTime(1199);
    expect(onDismissA).not.toHaveBeenCalled();
    expect(onDismissB).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onDismissB).toHaveBeenCalledTimes(1);
    expect(onDismissA).not.toHaveBeenCalled();
  });

  it('durationMs переопределяет длительность показа', () => {
    const onDismiss = vi.fn();
    render(
      <Toast
        message="Браузер не дал открыть вкладку. Проверьте настройки встраивания"
        onDismiss={onDismiss}
        durationMs={1000}
      />,
    );

    vi.advanceTimersByTime(999);
    expect(onDismiss).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

// restartKey — план DN-k9y: перезапускает отсчёт и заменяет внутренний узел
// с текстом, но не должен пересоздавать сам регион role="status" (иначе
// скринридер может потерять живой регион между тостами).
describe('Toast: restartKey и живой регион', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('смена текста с новым restartKey: регион role="status" — тот же узел', () => {
    const onDismiss = vi.fn();
    const { getByRole, rerender } = render(
      <Toast message="Сценарий удалён" onDismiss={onDismiss} restartKey={1} />,
    );
    const region = getByRole('status');

    rerender(<Toast message="Сценарий обновлён: 5 шагов" onDismiss={onDismiss} restartKey={2} />);

    expect(getByRole('status')).toBe(region);
    expect(getByRole('status')).toHaveTextContent('Сценарий обновлён: 5 шагов');
  });

  it('тот же текст с новым restartKey: регион тот же, внутренний узел — новый', () => {
    const onDismiss = vi.fn();
    const { getByRole, rerender } = render(
      <Toast message="Сценарий удалён" onDismiss={onDismiss} restartKey={1} />,
    );
    const region = getByRole('status');
    const firstInner = region.firstElementChild;

    rerender(<Toast message="Сценарий удалён" onDismiss={onDismiss} restartKey={2} />);

    expect(getByRole('status')).toBe(region);
    const secondInner = getByRole('status').firstElementChild;
    expect(secondInner).not.toBeNull();
    expect(secondInner).not.toBe(firstInner);
    expect(secondInner).toHaveTextContent('Сценарий удалён');
  });

  it('message=null между показами: регион не пересоздаётся, затем снова показывает текст', () => {
    const onDismiss = vi.fn();
    const { getByRole, rerender } = render(
      <Toast message="Сценарий удалён" onDismiss={onDismiss} />,
    );
    const region = getByRole('status');

    rerender(<Toast message={null} onDismiss={onDismiss} />);
    expect(getByRole('status')).toBe(region);
    expect(getByRole('status')).toBeEmptyDOMElement();

    rerender(<Toast message="Сценарий удалён" onDismiss={onDismiss} restartKey={2} />);
    expect(getByRole('status')).toBe(region);
    expect(getByRole('status')).toHaveTextContent('Сценарий удалён');
  });

  it('новый restartKey на середине показа перезапускает отсчёт заново', () => {
    const onDismiss = vi.fn();
    const { rerender } = render(
      <Toast message="Сценарий удалён" onDismiss={onDismiss} restartKey={1} />,
    );

    vi.advanceTimersByTime(3000);
    rerender(<Toast message="Сценарий удалён" onDismiss={onDismiss} restartKey={2} />);

    vi.advanceTimersByTime(3000);
    expect(onDismiss).not.toHaveBeenCalled();

    vi.advanceTimersByTime(200);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('тот же restartKey и тот же текст: отсчёт и внутренний узел не перезапускаются', () => {
    const onDismissA = vi.fn();
    const onDismissB = vi.fn();
    const { getByRole, rerender } = render(
      <Toast message="Сценарий удалён" onDismiss={onDismissA} restartKey={1} />,
    );
    const firstInner = getByRole('status').firstElementChild;

    vi.advanceTimersByTime(2000);
    rerender(<Toast message="Сценарий удалён" onDismiss={onDismissB} restartKey={1} />);
    expect(getByRole('status').firstElementChild).toBe(firstInner);

    vi.advanceTimersByTime(1199);
    expect(onDismissA).not.toHaveBeenCalled();
    expect(onDismissB).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onDismissB).toHaveBeenCalledTimes(1);
    expect(onDismissA).not.toHaveBeenCalled();
  });
});
