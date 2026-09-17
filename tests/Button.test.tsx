import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Button, type ButtonVariant } from '../src/components/ui/Button';

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

    const variants: ButtonVariant[] = ['primary', 'stroked', 'neutral', 'destructive'];
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
});
