# CLAUDE.md — правила разработки In.Plan Demo Navigator

Ты работаешь над статическим React-приложением по `PRD.md` и `SPEC.md`. При противоречии главнее SPEC.md. Референс визуала — `design/` (макеты и снимки, только чтение).

## Роль главной сессии

Ты — оркестратор (SPEC §10). Кода не пишешь: ведёшь beads, вызываешь субагентов из `.claude/agents/`, принимаешь результат, коммитишь, закрываешь задачи, делаешь push. Цепочка по задаче и правила — SPEC §10.1–10.5, бэклог — §10.6.

## Трекер: beads (`bd`)

Все работы — только через `bd`. Никаких TODO в markdown.

```bash
bd prime                 # начало сессии
bd ready                 # что можно брать
bd show DN-NN
bd update DN-NN --claim
npm run check            # перед закрытием
bd close DN-NN "что сделано, какие ТК зелёные"
```

- Первый запуск: `bd init --prefix DN`, `bd hooks install --beads`, затем бэклог SPEC §10.6 одной пачкой с зависимостями.
- Нашёл новую работу или баг — `bd create ... -t bug|task`, не молчаливая правка.
- Вопрос к владельцу — `bd create ... -t decision -p 0` со ссылкой на SPEC §11 (типа `question` в bd нет).
- Неочевидное про проект — `bd remember "..."`.
- Не закрывай задачу, если `npm run check` красный или DoD SPEC §9 не выполнен.

## Кодовые правила

- TypeScript strict, без `any`. Строки UI — только `src/i18n/ru.ts`.
- Цвета и размеры — только `src/theme/tokens.css`; hex в `*.tsx` запрещён ESLint.
- `src/excel/*` — чистые функции без React и DOM.
- SheetJS — только динамическим импортом и только версии из SPEC §1.
- Новая зависимость — только через задачу bd с обоснованием.
- `base: './'` в Vite не трогать.
- Коммит: `DN-NN feat: ...` / `DN-NN fix: ...` / `DN-NN test: ...`; ветка `dn-NN-краткое-имя`.

## Команды

```bash
npm i
npm run dev            # http://localhost:5173
npm run check          # tsc + eslint + vitest + prettier
npm run e2e            # playwright
npm run build          # dist/
npm run fixture        # tests/fixtures/*.json → *.xlsx, scenarios/deployment-demo.xlsx
npm run scenarios      # scenarios/*.xlsx → public/scenarios/ (сам запускается перед dev и build)
npm run pm:snapshot -- --from ../process-map   # снимок узлов карты
```

В песочнице без скачивания браузеров Playwright запускается с `executablePath: '/opt/pw-browsers/chromium'`.

## Чего не делать

- Не добавлять режим ведущего, таймеры, реестр экранов, подстановку стенда, скриншоты, папки и теги в каталоге — это не-цели PRD §3.
- Не добавлять бэкенд, роутер, Tailwind, UI-киты, `_ds_bundle.js`.
- Не придумывать содержание сценария: эталон — `tests/fixtures/deployment-demo.json`.
- Не класть в репо и в `scenarios/` имена заказчиков (SPEC §11, вопрос 6): общие сценарии публикуются вместе с приложением.
- Референс каталога — `design/catalog-mockup.html` (нарисован по SPEC, не Claude Design); остальное — `design/Демо-навигатор v2.dc.html`.
- Не менять `design/`.


<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:6cd5cc61 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.

## Agent Context Profiles

The managed Beads block is task-tracking guidance, not permission to override repository, user, or orchestrator instructions.

- **Conservative (default)**: Use `bd` for task tracking. Do not run git commits, git pushes, or Dolt remote sync unless explicitly asked. At handoff, report changed files, validation, and suggested next commands.
- **Minimal**: Keep tool instruction files as pointers to `bd prime`; use the same conservative git policy unless active instructions say otherwise.
- **Team-maintainer**: Only when the repository explicitly opts in, agents may close beads, run quality gates, commit, and push as part of session close. A current "do not commit" or "do not push" instruction still wins.

## Session Completion

This protocol applies when ending a Beads implementation workflow. It is subordinate to explicit user, repository, and orchestrator instructions.

1. **File issues for remaining work** - Create beads for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **Handle git/sync by active profile**:
   ```bash
   # Conservative/minimal/default: report status and proposed commands; wait for approval.
   git status

   # Team-maintainer opt-in only, unless current instructions forbid it:
   git pull --rebase
   git push
   git status
   ```
5. **Hand off** - Summarize changes, validation, issue status, and any blocked sync/commit/push step

**Critical rules:**
- Explicit user or orchestrator instructions override this Beads block.
- Do not commit or push without clear authority from the active profile or the current user request.
- If a required sync or push is blocked, stop and report the exact command and error.
<!-- END BEADS INTEGRATION -->
