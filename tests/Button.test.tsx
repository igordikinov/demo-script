import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Button, type ButtonVariant } from '../src/components/ui/Button';
import { ru } from '../src/i18n/ru';

// API и разметка — DN-02 (SPEC §5:358, §4.5:274, §4.4:236 «кнопка primary
// «Открыть экран» с иконкой»). Классы CSS-модулей в jsdom не читаются
// (Vitest подменяет их прокси-строками), поэтому сверяем поведение и
// атрибуты data-*, а не classList.
describe('Button', () => {
  it('по умолчанию type="button", явный type пробрасывается', () => {
    const { rerender } = render(<Button>Открыть экран</Button>);
    expect(screen.getByRole('button', { name: 'Открыть экран' })).toHaveAttribute('type', 'button');

    rerender(<Button type="submit">Открыть экран</Button>);
    expect(screen.getByRole('button', { name: 'Открыть экран' })).toHaveAttribute('type', 'submit');
  });

  it('data-variant по умолчанию primary, остальные варианты отражаются в атрибуте', () => {
    const { rerender } = render(<Button>Отмена</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('data-variant', 'primary');

    const variants: ButtonVariant[] = [
      'primary',
      'stroked',
      'neutral',
      'destructive',
      'ghost-destructive',
    ];
    for (const variant of variants) {
      rerender(<Button variant={variant}>Отмена</Button>);
      expect(screen.getByRole('button')).toHaveAttribute('data-variant', variant);
    }
  });

  it('onClick срабатывает, disabled блокирует клик и делает кнопку disabled', () => {
    const onClick = vi.fn();
    const { rerender } = render(<Button onClick={onClick}>Отмена</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(
      <Button disabled onClick={onClick}>
        Отмена
      </Button>,
    );
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('iconOnly с aria-label доступна по имени, помечена data-icon-only, иконка скрыта от скринридера', () => {
    render(<Button iconOnly icon={<svg data-testid="icon" />} aria-label="Следующий шаг" />);
    const button = screen.getByRole('button', { name: 'Следующий шаг' });
    expect(button).toHaveAttribute('data-icon-only', 'true');
    const icon = screen.getByTestId('icon');
    expect(icon.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('title пробрасывается на элемент button', () => {
    render(<Button title="Закрыть">Отмена</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('title', 'Закрыть');
  });

  it('иконка перед текстом по умолчанию, после текста при iconPosition="end"', () => {
    const { rerender } = render(<Button icon={<svg />}>Открыть экран</Button>);
    let html = screen.getByRole('button').innerHTML;
    expect(html.indexOf('<svg')).toBeLessThan(html.indexOf('Открыть экран'));

    rerender(
      <Button icon={<svg />} iconPosition="end">
        Открыть экран
      </Button>,
    );
    html = screen.getByRole('button').innerHTML;
    expect(html.indexOf('<svg')).toBeGreaterThan(html.indexOf('Открыть экран'));
  });

  it('forwardRef указывает на элемент button', () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Button ref={ref}>Отмена</Button>);
    expect(ref.current).toBe(screen.getByRole('button'));
  });

  it('без size — data-size="md"', () => {
    render(<Button>Отмена</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('data-size', 'md');
  });

  // Иконка-кнопка корзины «Удалить из браузера» (DN-esa, SPEC §4.2:253,
  // CAT:33–34, :143): 32×32 (size="sm" + iconOnly), вариант
  // ghost-destructive; size — служебный проп разметки, в DOM как атрибут
  // HTML-кнопки попадать не должен.
  it('иконка-кнопка sm ghost-destructive: data-атрибуты, доступное имя, клик, disabled', () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <Button
        size="sm"
        iconOnly
        variant="ghost-destructive"
        icon={<svg data-testid="icon" />}
        aria-label={ru.catalog.deleteFromBrowser}
        onClick={onClick}
      />,
    );
    const button = screen.getByRole('button', { name: 'Удалить из браузера' });
    expect(button).toHaveAttribute('data-size', 'sm');
    expect(button).toHaveAttribute('data-variant', 'ghost-destructive');
    expect(button).toHaveAttribute('data-icon-only', 'true');
    expect(button).not.toHaveAttribute('size');

    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(
      <Button
        size="sm"
        iconOnly
        variant="ghost-destructive"
        icon={<svg data-testid="icon" />}
        aria-label={ru.catalog.deleteFromBrowser}
        onClick={onClick}
        disabled
      />,
    );
    const disabledButton = screen.getByRole('button', { name: 'Удалить из браузера' });
    expect(disabledButton).toBeDisabled();
    fireEvent.click(disabledButton);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
