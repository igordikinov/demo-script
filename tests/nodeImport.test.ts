// @vitest-environment node
// Сторож для правила из плана DN-03 (п.0.1): Node с --experimental-strip-types
// не приемлет расширение-less импорты и импорт типов без ключевого слова
// `type`. tsc это не ловит (нет verbatimModuleSyntax в tsconfig.json),
// поэтому проверяем реальным запуском node, а не сборкой.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

describe('node --experimental-strip-types может импортировать src/model/schema.ts и src/i18n/ru.ts', () => {
  it('модули читаются напрямую .ts без сборки', { timeout: 30_000 }, () => {
    // Вывод — только ASCII (обход кодировки консоли Windows, план DN-03).
    const script =
      "const s=await import('./src/model/schema.ts');" +
      "const r=await import('./src/i18n/ru.ts');" +
      "if(typeof s.ScenarioSchema.parse!=='function'||typeof r.ru.summary.text!=='function')process.exit(2);" +
      "console.log('ok')";
    const out = execFileSync(
      process.execPath,
      ['--experimental-strip-types', '--no-warnings', '--input-type=module', '-e', script],
      { cwd: root, encoding: 'utf8' },
    );
    expect(out.trim()).toBe('ok');
  });
});

// Тот же сторож для src/excel/write.ts (план DN-04): npm run fixture (DN-08)
// запускается через node --experimental-strip-types и должен уметь напрямую
// импортировать .ts-модуль с расширением, без сборки.
describe('node --experimental-strip-types может импортировать src/excel/write.ts', () => {
  it('writeWorkbook отдаёт непустой Uint8Array', { timeout: 30_000 }, () => {
    const script =
      "const w=await import('./src/excel/write.ts');" +
      "const bytes=await w.writeWorkbook([{name:'S',rows:[['1.10']]}]);" +
      'if(!(bytes instanceof Uint8Array)||bytes.length===0)process.exit(2);' +
      "console.log('ok')";
    const out = execFileSync(
      process.execPath,
      ['--experimental-strip-types', '--no-warnings', '--input-type=module', '-e', script],
      { cwd: root, encoding: 'utf8' },
    );
    expect(out.trim()).toBe('ok');
  });
});

// Тот же сторож для src/excel/read.ts (план DN-05, снимки — план DN-06): npm run
// scenarios (DN-08, SPEC §3.7:215) читает книги той же readWorkbook через node
// --experimental-strip-types, без сборки, и передаёт снимки карт из src/data/pm/
// через fs — так же, как это сделает DN-22 (сборка). Кириллица — только
// \u-escape, вывод script'а — ASCII (обход кодировки консоли Windows, план DN-03).
describe('node --experimental-strip-types может импортировать src/excel/read.ts', () => {
  it(
    'readWorkbook разбирает книгу, id — слаг имени файла, шаг сохраняет id-строку "1.10", ровно одна строка I03',
    { timeout: 30_000 },
    () => {
      const script =
        "const w=await import('./src/excel/write.ts');" +
        "const r=await import('./src/excel/read.ts');" +
        "const fs=await import('node:fs');const snap=(m)=>JSON.parse(fs.readFileSync('src/data/pm/'+m+'.json','utf8'));" +
        "const b=await w.writeWorkbook([{name:'S',rows:[['\\u2116','\\u0428\\u0430\\u0433'],['1.10','x']]}]);" +
        "const res=await r.readWorkbook(b.slice().buffer,'demo.xlsx',{snp:snap('snp'),mrp:snap('mrp')});" +
        "console.log(res.scenario.id+' '+res.scenario.blocks[0].steps[0].id+' '+res.summary.steps+' '+res.report.filter(x=>x.code==='I03').length)";
      const out = execFileSync(
        process.execPath,
        ['--experimental-strip-types', '--no-warnings', '--input-type=module', '-e', script],
        { cwd: root, encoding: 'utf8' },
      );
      expect(out.trim()).toBe('demo 1.10 1 1');
    },
  );
});
