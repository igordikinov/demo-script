import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';

// Hex-цвет как подстрока: '#fff', '1px solid #EAEAEA', '#0000001A'. Не ловит
// '#root' и HTML-сущности вида '&#123'. В регэкспе esquery нельзя '/'.
const HEX = '(?:^|[^&\\w])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\\w-])';
const HEX_MESSAGE = 'Хардкод hex-цвета запрещён — используйте переменные из src/theme/tokens.css.';
const XLSX_MESSAGE =
  'SheetJS — только динамическим импортом: loadXlsx() из src/excel/xlsx.ts; типы — import type.';

export default defineConfig(
  // Flat config не читает .gitignore. design/ — макет (только чтение), его
  // *.js ESLint разбирал бы по умолчанию.
  globalIgnores([
    'dist',
    'coverage',
    'playwright-report',
    'test-results',
    'design',
    '.beads',
    '.agents',
    '.codex',
  ]),
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    // Запрет хардкода hex-цветов (SPEC §5, CLAUDE.md): цвета и размеры
    // берутся только из src/theme/tokens.css.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/theme/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: `Literal[value=/${HEX}/]`, message: HEX_MESSAGE },
        { selector: `TemplateElement[value.raw=/${HEX}/]`, message: HEX_MESSAGE },
      ],
    },
  },
  {
    // src/** уезжает в браузер: `process` там превратится в ReferenceError,
    // а импорт node:* уронит сборку Vite. Настройками tsc эту границу не
    // провести — глобалы Node видны из любого файла программы.
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'process',
          message:
            'src/** уезжает в браузер: process там не существует. Значения времени сборки — через import.meta.env.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['node:*'],
              message: 'src/** уезжает в браузер: встроенные модули Node в бандле недоступны.',
            },
          ],
        },
      ],
    },
  },
  {
    // SPEC §1:20, CLAUDE.md: SheetJS — только динамическим импортом через
    // loadXlsx() (src/excel/xlsx.ts), иначе он попадёт в стартовый чанк.
    // Типы — import type (стираются). Исключения для src/excel/xlsx.ts нет:
    // import('xlsx') правило пропускает, а статический импорт значения там
    // утащил бы SheetJS в чанк любого, кто импортирует loadXlsx.
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'xlsx', message: XLSX_MESSAGE, allowTypeImports: true }],
          patterns: [{ group: ['xlsx/*'], message: XLSX_MESSAGE, allowTypeImports: true }],
        },
      ],
    },
  },
  {
    files: [
      'tests/**/*.{ts,tsx}',
      'e2e/**/*.{ts,tsx}',
      'e2e-preview/**/*.{ts,tsx}',
      'scripts/**/*.ts',
      '*.config.{ts,js}',
    ],
    languageOptions: {
      globals: globals.node,
    },
  },
  prettierConfig,
);
