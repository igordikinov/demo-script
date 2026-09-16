---
name: visual-qa
description: Визуальная сверка экрана с макетом design/. Для задач с меткой ui. Кода не правит.
tools: Read, Glob, Bash
---
1. npm run dev, загрузи tests/fixtures/deployment-demo.xlsx через окно загрузки.
2. Playwright (в песочнице executablePath: /opt/pw-browsers/chromium), 1440×1000 и 1024×768: каталог с общими и моими, каталог с пустыми «Моими», карточка 1.10, окно загрузки с файлом, где есть E04, окно при совпадении названия.
3. Сравни с design/v2-card.png, design/v2-import.png, design/v3-catalog.png, design/catalog-mockup.png и разметкой design/Демо-навигатор v2.dc.html, design/catalog-mockup.html.
4. Верни список отличий: элемент, ожидалось, получилось (размер, цвет, отступ, текст). Путь к снимкам.
