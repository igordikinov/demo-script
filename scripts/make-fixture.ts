// Фикстура и первый общий сценарий — SPEC §6:374, §2:36.
//
//   npm run fixture
//
// Читает tests/fixtures/deployment-demo.json и той же функцией записи, что и
// шаблон (src/excel/write.ts, листы — scenarioSheets из src/excel/template.ts),
// пишет tests/fixtures/deployment-demo.xlsx и scenarios/deployment-demo.xlsx.
// Книга: `_Сценарий` (название, модуль, карта), на каждый блок — лист `Блок {n}`:
// A1 — название блока, строка 2 — заголовки, шаги с 3-й строки; `id` и `url` —
// текстом. Файлы коммитятся; руками их не правят. Одинаковый JSON даёт
// побайтово одинаковые книги — tests/fixture.test.ts сверяет закоммиченные
// файлы со свежей сборкой.
//
// --out <каталог> — дополнение к SPEC: корень, от которого пишутся оба файла
// (по умолчанию корень этого репозитория). Нужно тестам, чтобы не перезаписывать
// закоммиченные файлы. JSON всегда читается из этого репозитория.
//
// Вход проверяется строгой схемой: поле, которого нет в книге, при записи
// потерялось бы молча — такой JSON отвергается.
//
// Код выхода: 0 — файлы записаны; 1 — ошибка (сообщение в stderr).
//
// Запуск: node --experimental-strip-types — без enum/namespace, импорт типов
// только с `type`, относительные импорты с расширением .ts.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { scenarioSheets } from '../src/excel/template.ts';
import { writeWorkbook } from '../src/excel/write.ts';
import { BlockSchema, ScenarioSchema, StepSchema } from '../src/model/schema.ts';

const USAGE = 'пример вызова:\n  npm run fixture\n  npm run fixture -- --out <каталог>';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const SOURCE = join(REPO_ROOT, 'tests', 'fixtures', 'deployment-demo.json');
/** Куда пишется книга — относительно корня (§6:374). */
const TARGETS: readonly (readonly string[])[] = [
  ['tests', 'fixtures', 'deployment-demo.xlsx'],
  ['scenarios', 'deployment-demo.xlsx'],
];

/** То, что хранит книга: сценарий без служебных полей, блоки без `n` и `sheet`. */
const FixtureSchema = z
  .object({
    title: ScenarioSchema.shape.title,
    module: ScenarioSchema.shape.module,
    map: ScenarioSchema.shape.map,
    blocks: z
      .array(
        z
          .object({
            title: BlockSchema.shape.title,
            steps: z.array(StepSchema.strict()).min(1),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

function readRoot(): string {
  let values: { out?: string };
  try {
    ({ values } = parseArgs({
      options: { out: { type: 'string' } },
      strict: true,
      allowPositionals: false,
    }));
  } catch (e) {
    throw new Error(`${e instanceof Error ? e.message : String(e)}\n${USAGE}`);
  }
  return values.out === undefined ? REPO_ROOT : resolve(process.cwd(), values.out);
}

function readSource(): z.infer<typeof FixtureSchema> {
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(SOURCE, 'utf8'));
  } catch (e) {
    throw new Error(
      `не удалось прочитать ${SOURCE}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  const parsed = FixtureSchema.safeParse(json);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(корень)'}: ${issue.message}`)
      .join('; ');
    throw new Error(`${SOURCE}: ${issues}`);
  }
  return parsed.data;
}

async function main(): Promise<void> {
  const root = readRoot();
  const bytes = await writeWorkbook(scenarioSheets(readSource()));
  for (const parts of TARGETS) {
    const target = join(root, ...parts);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
    console.log(`${target}: ${bytes.length} байт`);
  }
}

try {
  await main();
} catch (e) {
  console.error(`fixture: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
}
