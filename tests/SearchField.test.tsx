// SearchField — поле поиска каталога (SPEC §4.2:247: «справа SearchField
// 320 px «Поиск по названию»»). Своих подписей у компонента нет — label и
// placeholder передаёт потребитель (как у Button/Badge). Пути иконки поиска
// (data-icon="search") сверяются здесь же — tests/icons.test.tsx новыми
// иконками не расширяется без отдельного разрешения (bd DN-24).
import { fireEvent, render, screen } from '@testing-library/react';
import { SearchField } from '../src/components/ui/SearchField';

describe('SearchField (SPEC §4.2:247)', () => {
  it('role=searchbox, имя из label, placeholder из пропа, value управляемый', () => {
    render(
      <SearchField
        value="deploy"
        onChange={() => undefined}
        placeholder="Поиск по названию"
        label="Поиск по названию"
      />,
    );
    const field = screen.getByRole('searchbox', { name: 'Поиск по названию' });
    expect(field).toHaveAttribute('placeholder', 'Поиск по названию');
    expect(field).toHaveValue('deploy');
  });

  it('change вызывает onChange с новым значением поля', () => {
    const onChange = vi.fn();
    render(<SearchField value="" onChange={onChange} placeholder="p" label="l" />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'abc' } });
    expect(onChange).toHaveBeenCalledWith('abc');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('value не меняется без внешнего onChange (управляемое поле)', () => {
    render(<SearchField value="fixed" onChange={() => undefined} placeholder="p" label="l" />);
    const field = screen.getByRole('searchbox');
    fireEvent.change(field, { target: { value: 'other' } });
    expect(field).toHaveValue('fixed');
  });

  it('иконка поиска: circle + один отрезок ручки, скрыта от AT (CAT:102)', () => {
    render(<SearchField value="" onChange={() => undefined} placeholder="p" label="l" />);
    const icon = document.querySelector('svg[data-icon="search"]');
    if (icon === null) throw new Error('svg[data-icon="search"] не найден');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    const circle = icon.querySelector('circle');
    expect(circle).toHaveAttribute('cx', '11');
    expect(circle).toHaveAttribute('cy', '11');
    expect(circle).toHaveAttribute('r', '7');
    expect(icon.querySelector('path')).toHaveAttribute('d', 'M20 20l-3.5-3.5');
  });

  it('className пробрасывается на корневой узел поля', () => {
    const { container } = render(
      <SearchField
        value=""
        onChange={() => undefined}
        placeholder="p"
        label="l"
        className="my-x"
      />,
    );
    expect(container.querySelector('.my-x')).not.toBeNull();
  });
});
