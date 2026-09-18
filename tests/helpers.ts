// Общие приёмы jsdom-тестов, которые не зависят от конкретного файла.
import { screen } from '@testing-library/react';

/**
 * Шапка A0 (SPEC §4.1:236–241) — единственный настоящий landmark banner.
 * С открытым сценарием в DOM два <header>: шапка (SPEC §4.1:241) и заголовок
 * карточки StepCard.tsx:50 внутри <article> (SPEC §4.4:271). По HTML-AAM
 * вложенный в article/section/aside/main/nav <header> не banner, но
 * @testing-library/dom 10.4.1 (aria-query 5.3.0) ancestor-констрейнт не
 * учитывает, и getByRole('banner') находит оба — см.
 * node_modules/aria-query/lib/etc/roles/literal/bannerRole.js. В браузере
 * landmark один — e2e/*.spec.ts используют page.getByRole('banner') напрямую,
 * без этого хелпера (bd DN-26).
 */
export function appBanner(): HTMLElement {
  const banner = screen.getAllByRole('banner').find((el) => el.closest('article') === null);
  if (banner === undefined) {
    throw new Error('шапка A0 (banner вне article) не найдена');
  }
  return banner;
}
