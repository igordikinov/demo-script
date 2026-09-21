// Общие приёмы jsdom-тестов, которые не зависят от конкретного файла.
import { screen } from '@testing-library/react';

/**
 * DN-ysk (SPEC 1.9, §4.1): верхней полосы A0 больше нет ни на одном экране —
 * единственный <header> в приложении теперь заголовок карточки шага
 * (StepCard.tsx, внутри <article>, SPEC §4.4:271). По HTML-AAM вложенный в
 * article/section/aside/main/nav <header> не banner, но
 * @testing-library/dom 10.4.1 (aria-query 5.3.0) ancestor-констрейнт не
 * учитывает и getByRole('banner') всё равно находит этот <header> — см.
 * node_modules/aria-query/lib/etc/roles/literal/bannerRole.js. Поэтому
 * «баннера на странице нет» проверяется фильтром по closest('article'), а не
 * прямым screen.queryByRole('banner'). В браузере landmark считается по
 * спецификации — e2e/*.spec.ts используют page.getByRole('banner') напрямую,
 * без этого хелпера.
 */
export function pageBanners(): HTMLElement[] {
  return screen.queryAllByRole('banner').filter((el) => el.closest('article') === null);
}

/** Ландмарки banner вне `<article>` на странице нет (DN-ysk, SPEC §4.1). */
export function expectNoPageBanner(): void {
  expect(pageBanners()).toHaveLength(0);
}
