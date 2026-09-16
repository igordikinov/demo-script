#!/usr/bin/env bash
# Бэклог SPEC §10.6 одной пачкой. Запуск один раз после `bd init --prefix DN`.
# Точный синтаксис флагов сверить с `bd --help`; id задаются явно, чтобы совпали с SPEC.
set -euo pipefail

bd create "Каркас: Vite 6, React 18, TS strict, ESLint (запрет hex в tsx), Prettier, Vitest, Playwright, base: './', npm run check" --id DN-01 -t task -p 1 -l ф1,ci --acceptance "npm run check зелёный на пустом приложении"
bd create "Токены §5 из design/_ds, шрифт локально; компоненты Button, Badge, Modal, Toast" --id DN-02 -t task -p 1 -l ф1,ui --acceptance "компоненты в Testing Library; сверка цветов с §5"
bd create "Модель §3.1, ru.ts, plural.ts" --id DN-03 -t task -p 1 -l ф1,excel --acceptance "ТК 23"
bd create "SheetJS 0.20.3 с CDN, динамический импорт, write.ts" --id DN-04 -t task -p 1 -l ф1,excel --acceptance "SheetJS не в стартовом чанке (scripts/size.ts)"
bd create "Разбор книги §3.2–3.3: заголовки, алиасы, гиперссылки, названия блоков, _Сценарий, сводка" --id DN-05 -t task -p 1 -l ф1,excel --acceptance "ТК 5, 6, 7, 9"
bd create "Проверки §3.5 и отчёт" --id DN-06 -t task -p 1 -l ф1,excel --acceptance "ТК 2, 3, 4, 8"
bd create "Снимок карты §3.4: scripts/pm-snapshot.ts, src/data/pm/*.json" --id DN-07 -t task -p 1 -l ф1,pm --acceptance "ТК 24; файлы собраны из текущего process-map"
bd create "Шаблон §6; npm run fixture → tests/fixtures/deployment-demo.xlsx, scenarios/deployment-demo.xlsx" --id DN-08 -t task -p 1 -l ф1,excel --acceptance "ТК 1, 10, 12, 20"
bd create "Стор: открытый сценарий, активный шаг, окна, признак карты" --id DN-09 -t task -p 2 -l ф2,ui --acceptance "стор покрыт тестами редьюсера"
bd create "Шапка A0 §4.1: вариант каталога и вариант сценария" --id DN-10 -t task -p 2 -l ф2,ui --acceptance "visual-qa: обе шапки"
bd create "Схема сценария A2 §4.3" --id DN-11 -t task -p 2 -l ф2,ui --acceptance "visual-qa: схема"
bd create "Карточка шага A3 §4.4, открытие экрана §4.9" --id DN-12 -t task -p 2 -l ф2,ui --acceptance "ТК 16; visual-qa: карточка 1.10"
bd create "Навигация §4.5: кнопки и клавиши" --id DN-13 -t task -p 2 -l ф2,ui --acceptance "ТК 13"
bd create "Окно загрузки A4 §4.8 без блока совпадения, тост" --id DN-14 -t task -p 2 -l ф2,ui,excel --acceptance "ТК 19; visual-qa: окно"
bd create "Секция «Карта процесса» и встроенная карта §4.6" --id DN-15 -t task -p 2 -l ф3,ui,pm --acceptance "ТК 11, 17"
bd create "Deep-link ?scenario=&step= §4.7" --id DN-16 -t task -p 2 -l ф3,ui --acceptance "ТК 14, 30"
bd create "e2e: iframe и визуальные снимки" --id DN-17 -t task -p 2 -l ф3,ci --acceptance "ТК 21, 22, 33"
bd create "CI и деплой на GitHub Pages §7 (fetch-depth: 0, npm run scenarios); проверка размера бандла" --id DN-18 -t task -p 2 -l ф3,ci --acceptance "Pages открывается, ?scenario=deployment-demo&step=1.10 работает"
bd create "README: запуск, шаблон, общие сценарии (как добавить файл), снимок карты, встраивание; CHANGELOG" --id DN-19 -t task -p 2 -l ф3,docs --acceptance "инструкция встраивания проверена на стенде вики"
bd create "Приёмка: общий deployment-demo из каталога и тот же файл загрузкой в «Мои», проход 29 шагов, открытие экранов и карты, замена и удаление" --id DN-20 -t task -p 2 -l ф3 --acceptance "verifier по всем ТК §8"
bd create "Решения владельца по §11 (вопросы 1–7)" --id DN-21 -t decision -p 0 -l ф1 --acceptance "ответы записаны в SPEC"
bd create "Сборка общих сценариев §3.7: scripts/build-scenarios.ts, predev/prebuild, public/scenarios/ в .gitignore" --id DN-22 -t task -p 1 -l ф1,excel,ci --acceptance "ТК 25"
bd create "Библиотека «моих» §3.6 и загрузка общих §3.7 (library.ts, shared.ts)" --id DN-23 -t task -p 2 -l ф2,ui --acceptance "ТК 15, 31, 32"
bd create "Каталог A5, A5.1 §4.2: разделы, поиск, открытие" --id DN-24 -t task -p 2 -l ф2,ui --acceptance "ТК 26; visual-qa: каталог"
bd create "Добавление в «Мои», совпадение названий A4′ §4.8, удаление A5.2 §4.2" --id DN-25 -t task -p 2 -l ф2,ui,excel --acceptance "ТК 18, 27, 28, 29; visual-qa: A4′"
bd create "Переходы каталог ↔ сценарий, Tag источника в шапке" --id DN-26 -t task -p 2 -l ф2,ui --acceptance "переход по строке и «‹ Сценарии» работает"

bd dep add DN-02 DN-01
bd dep add DN-03 DN-01
bd dep add DN-04 DN-01
bd dep add DN-05 DN-03
bd dep add DN-05 DN-04
bd dep add DN-06 DN-05
bd dep add DN-06 DN-07
bd dep add DN-07 DN-01
bd dep add DN-08 DN-04
bd dep add DN-08 DN-05
bd dep add DN-09 DN-03
bd dep add DN-10 DN-02
bd dep add DN-10 DN-09
bd dep add DN-11 DN-02
bd dep add DN-11 DN-09
bd dep add DN-12 DN-02
bd dep add DN-12 DN-09
bd dep add DN-13 DN-11
bd dep add DN-13 DN-12
bd dep add DN-14 DN-06
bd dep add DN-14 DN-08
bd dep add DN-14 DN-10
bd dep add DN-15 DN-07
bd dep add DN-15 DN-12
bd dep add DN-16 DN-13
bd dep add DN-16 DN-26
bd dep add DN-17 DN-15
bd dep add DN-17 DN-16
bd dep add DN-17 DN-25
bd dep add DN-18 DN-17
bd dep add DN-19 DN-18
bd dep add DN-20 DN-19
bd dep add DN-22 DN-05
bd dep add DN-22 DN-06
bd dep add DN-22 DN-08
bd dep add DN-23 DN-09
bd dep add DN-23 DN-22
bd dep add DN-24 DN-10
bd dep add DN-24 DN-23
bd dep add DN-25 DN-14
bd dep add DN-25 DN-24
bd dep add DN-26 DN-10
bd dep add DN-26 DN-12
bd dep add DN-26 DN-24

bd ready
