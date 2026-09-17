// Пробный вход для scripts/size.ts и tests/size.test.ts (план DN-04, D3):
// статический импорт значения из xlsx — должен утащить SheetJS в стартовый
// чанк. Побочный эффект (console.log) обязателен, иначе Rollup выкинет
// неиспользуемые экспорты входа и SheetJS в чанк не попадёт.
import { write, utils } from 'xlsx';

console.log(write(utils.book_new(), { type: 'array', bookType: 'xlsx' }));
