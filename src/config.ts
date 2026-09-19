// Настройки приложения — SPEC §2:38. Адрес карты процесса — §4.6:295–302:
// навигатор строит ссылку на внешнее приложение process-map (pm/pmLink.ts),
// своей копии карты у него нет. Адреса дословно из SPEC; тесты сверяют ссылки
// с литералами, а не с этим файлом, — подмена адреса не пройдёт незамеченной.
import type { PmMap } from './pm/snapshot.ts';

/** База адреса карты по её коду (SPEC §4.6:298–301). */
export const pmBase: Readonly<Record<PmMap, string>> = {
  snp: 'https://igordikinov.github.io/process-map/',
  mrp: 'https://igordikinov.github.io/process-map/mrp/',
};
