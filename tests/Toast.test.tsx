import { render } from '@testing-library/react';
import { Toast } from '../src/components/ui/Toast';

// Toast — SPEC §4.8:346 «тост «Сценарий добавлен в „Мои“…» на 3,2 с.» —
// единственное место, где длительность задана явно; 3200 мс взяты как
// значение по умолчанию (план D9). role="status" — обязательный live-регион,
// чтобы скринридер прочитал текст тоста без явного управления фокусом.
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

  it('одинаковый текст подряд не перезапускает таймер — колбэк на момент срабатывания берётся актуальный', () => {
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
