// Размер бандла после `npm run build` (SPEC §8:427): «бандл ≤ 350 KB gzip,
// стартовый чанк без SheetJS ≤ 120 KB gzip». Запуск: `npm run size`
// (`node --experimental-strip-types scripts/size.ts [--dist <каталог>]`).
//
// Трактовка SPEC §8:427, принятая здесь:
// - «бандл» — все .js, .mjs и .css в dist; размер — gzip (zlib, уровень по
//   умолчанию, как в выводе `vite build`); 1 KB = 1000 байт, как «kB» у Vite;
// - стартовый набор — записи манифеста Vite с isEntry и транзитивное замыкание
//   по их статическим `imports` (без `dynamicImports`), с их `file` и `css`;
// - шрифты .woff2 уже сжаты: в лимиты не входят, выводятся отдельной строкой
//   (9 файлов Open Sans ≈ 142 KB вместе с чанком SheetJS ≈ 163 KB gzip
//   превысили бы 350 KB при любом размере кода приложения);
// - SheetJS в стартовом наборе ищется по ключу или `src` записи манифеста
//   (node_modules/xlsx/…) и по легальному комментарию «2013-present SheetJS»
//   в тексте файла — он переживает tree-shaking. Поле `name` не используется:
//   общий чанк загрузчика src/excel/xlsx.ts тоже может называться «xlsx»;
// - «первая отрисовка < 1 с» этим скриптом не меряется.
//
// Только стираемый синтаксис TypeScript: файл запускает Node без сборки.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { z } from 'zod';

export interface Limits {
  readonly startGzip: number;
  readonly totalGzip: number;
}

export const LIMITS: Limits = { startGzip: 120_000, totalGzip: 350_000 };

export const SHEETJS_MARKER = '2013-present SheetJS';

export interface FileSize {
  readonly file: string;
  readonly bytes: number;
  readonly gzip: number;
  /** Входит в стартовый набор. */
  readonly start: boolean;
}

export interface SizeReport {
  /** JS, CSS и шрифты .woff2 из dist. */
  readonly files: readonly FileSize[];
  readonly startGzip: number;
  /** Все JS и CSS, gzip. */
  readonly totalGzip: number;
  /** Сумма .woff2 в байтах — в лимиты не входит. */
  readonly fontBytes: number;
  readonly violations: readonly string[];
  readonly limits: Limits;
}

const ManifestChunkSchema = z
  .object({
    file: z.string(),
    src: z.string().optional(),
    name: z.string().optional(),
    isEntry: z.boolean().optional(),
    isDynamicEntry: z.boolean().optional(),
    imports: z.array(z.string()).optional(),
    dynamicImports: z.array(z.string()).optional(),
    css: z.array(z.string()).optional(),
    assets: z.array(z.string()).optional(),
  })
  .passthrough();
const ManifestSchema = z.record(ManifestChunkSchema);
type Manifest = z.infer<typeof ManifestSchema>;

const CODE_FILE = /\.(?:m?js|css)$/;
const FONT_FILE = /\.woff2$/;
const SHEETJS_MODULE = /(^|\/)node_modules\/xlsx\//;

const kb = (n: number): string => `${(n / 1000).toFixed(1)} KB`;

function startKeys(manifest: Manifest, violations: string[]): Set<string> {
  const seen = new Set<string>();
  const queue = Object.keys(manifest).filter((key) => manifest[key]?.isEntry === true);
  while (queue.length > 0) {
    const key = queue.shift();
    if (key === undefined || seen.has(key)) continue;
    const chunk = manifest[key];
    if (!chunk) {
      violations.push(`Манифест ссылается на отсутствующую запись: ${key}`);
      continue;
    }
    seen.add(key);
    queue.push(...(chunk.imports ?? []));
  }
  return seen;
}

/**
 * Проверяет сборку по манифесту Vite. `files` — содержимое dist (пути через
 * «/», относительно dist, без .vite/). Ничего не печатает и не читает с диска.
 */
export function analyzeBundle(
  manifest: unknown,
  files: ReadonlyMap<string, Uint8Array>,
  limits: Limits = LIMITS,
): SizeReport {
  const violations: string[] = [];
  const startFiles = new Set<string>();

  const parsed = ManifestSchema.safeParse(manifest);
  if (!parsed.success) {
    violations.push(`Манифест Vite не распознан: ${parsed.error.message}`);
  } else {
    const data = parsed.data;
    if (!Object.values(data).some((chunk) => chunk.isEntry === true)) {
      violations.push('В манифесте Vite нет ни одного входа (isEntry)');
    }
    for (const chunk of Object.values(data)) {
      for (const file of [chunk.file, ...(chunk.css ?? []), ...(chunk.assets ?? [])]) {
        if (!files.has(file)) violations.push(`Файла из манифеста нет в сборке: ${file}`);
      }
    }
    for (const key of startKeys(data, violations)) {
      const chunk = data[key];
      if (!chunk) continue;
      if (SHEETJS_MODULE.test(key) || (chunk.src !== undefined && SHEETJS_MODULE.test(chunk.src))) {
        violations.push(`SheetJS в стартовом наборе: ${key} → ${chunk.file}`);
      }
      startFiles.add(chunk.file);
      for (const css of chunk.css ?? []) startFiles.add(css);
    }
  }

  const decoder = new TextDecoder();
  const sizes: FileSize[] = [];
  let startGzip = 0;
  let totalGzip = 0;
  let fontBytes = 0;
  for (const [file, content] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
    const isCode = CODE_FILE.test(file);
    const isFont = FONT_FILE.test(file);
    if (!isCode && !isFont) continue;
    const start = startFiles.has(file);
    const gzip = gzipSync(content).byteLength;
    sizes.push({ file, bytes: content.byteLength, gzip, start });
    if (isFont) {
      fontBytes += content.byteLength;
      continue;
    }
    totalGzip += gzip;
    if (start) startGzip += gzip;
  }

  for (const file of startFiles) {
    const content = files.get(file);
    if (content && decoder.decode(content).includes(SHEETJS_MARKER)) {
      violations.push(`SheetJS в стартовом файле (маркер «${SHEETJS_MARKER}»): ${file}`);
    }
  }
  if (startGzip > limits.startGzip) {
    violations.push(`Стартовый набор ${kb(startGzip)} gzip > ${kb(limits.startGzip)}`);
  }
  if (totalGzip > limits.totalGzip) {
    violations.push(`Весь JS и CSS ${kb(totalGzip)} gzip > ${kb(limits.totalGzip)}`);
  }

  return { files: sizes, startGzip, totalGzip, fontBytes, violations, limits };
}

export function formatReport(report: SizeReport): string {
  const header = ['Файл', 'Байт', 'gzip', 'Старт'];
  const rows = report.files.map((f) => [
    f.file,
    String(f.bytes),
    FONT_FILE.test(f.file) ? '—' : String(f.gzip),
    f.start ? 'да' : '',
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]?.length ?? 0)));
  const line = (cells: readonly string[]): string =>
    cells
      .map((cell, i) => (i === 0 ? cell.padEnd(widths[i] ?? 0) : cell.padStart(widths[i] ?? 0)))
      .join('  ')
      .trimEnd();

  const out = [line(header), ...rows.map(line), ''];
  out.push(`Стартовый набор, gzip: ${kb(report.startGzip)} (лимит ${kb(report.limits.startGzip)})`);
  out.push(`Весь JS и CSS, gzip:   ${kb(report.totalGzip)} (лимит ${kb(report.limits.totalGzip)})`);
  out.push(`Шрифты .woff2:         ${kb(report.fontBytes)} (в лимиты не входят)`);
  out.push('');
  if (report.violations.length === 0) {
    out.push('Нарушений нет.');
  } else {
    out.push('Нарушения:');
    for (const v of report.violations) out.push(`- ${v}`);
  }
  return out.join('\n');
}

function readDist(dist: string): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  for (const entry of readdirSync(dist, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const abs = join(entry.parentPath, entry.name);
    const rel = relative(dist, abs).replace(/\\/g, '/');
    if (rel.startsWith('.vite/')) continue;
    files.set(rel, readFileSync(abs));
  }
  return files;
}

function distFromArgv(argv: readonly string[]): string {
  const i = argv.indexOf('--dist');
  const value = i === -1 ? undefined : argv[i + 1];
  return resolve(process.cwd(), value ?? 'dist');
}

function run(argv: readonly string[]): number {
  const dist = distFromArgv(argv);
  const manifestPath = join(dist, '.vite', 'manifest.json');
  if (!existsSync(manifestPath)) {
    console.error(`Нет ${manifestPath} — сначала npm run build.`);
    return 1;
  }
  let manifest: unknown;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    console.error(`Не удалось прочитать ${manifestPath}: ${String(error)}`);
    return 1;
  }
  const report = analyzeBundle(manifest, readDist(dist));
  console.log(formatReport(report));
  return report.violations.length === 0 ? 0 : 1;
}

// Модуль импортируют тесты ради analyzeBundle — CLI только при прямом запуске.
function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  try {
    return resolve(entry) === resolve(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  process.exitCode = run(process.argv.slice(2));
}
