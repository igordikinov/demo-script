import { render, screen } from '@testing-library/react';
import { Badge, type BadgeTone } from '../src/components/ui/Badge';

// Тона Badge — SPEC §4.2:239 (Badge модуля) и §4.8:335 (пилюли отчёта:
// danger/warning/info, цвета §5:360). Цвета сверяются отдельно в
// tokens.test.ts по CSS, здесь — только то, что тон долетает до разметки.
describe('Badge', () => {
  const tones: BadgeTone[] = ['module', 'danger', 'warning', 'info'];

  it.each(tones)('тон %s рендерится как span с data-tone', (tone) => {
    render(<Badge tone={tone}>SNP</Badge>);
    const badge = screen.getByText('SNP');
    expect(badge.tagName).toBe('SPAN');
    expect(badge).toHaveAttribute('data-tone', tone);
  });
});
