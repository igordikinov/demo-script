// Пробный вход для scripts/size.ts и tests/size.test.ts (план DN-04, D3):
// динамический import('xlsx') внутри src/excel/write.ts должен вынести
// SheetJS отдельным чанком, не попадающим в стартовый набор. Побочный эффект
// (обработчик клика) обязателен — иначе Rollup выкинет неиспользуемый экспорт.
import { writeWorkbook } from '../../src/excel/write.ts';

document.addEventListener('click', () => {
  void writeWorkbook([{ name: 'S', rows: [['x']] }]).then((b) => console.log(b.length));
});
