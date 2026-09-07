# Скачивание программы на Python — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** собранную из блоков программу можно унести с собой файлом `.py` —
первый шаг моста на железо из фазы 5 брифа.

**Architecture:** скрипт уже считается для показа на вкладке «Код»; кнопка
заворачивает ту же строку в Blob и отдаёт браузеру. Ни сервера, ни второго
генератора.

**Tech Stack:** React 19, next-intl, Playwright.

Спека: [../specs/2026-09-06-python-download-design.md](../specs/2026-09-06-python-download-design.md).

---

## Карта файлов

| Файл | Ответственность |
|---|---|
| `components/simulator/program-panel.tsx` | кнопка скачивания на вкладке кода |
| `components/simulator/lesson-workspace.tsx` | имя файла из задания |
| `messages/ru.json`, `messages/en.json` | подпись кнопки |
| `tests/e2e/lesson.spec.ts` | скачивание отдаёт файл с тем же кодом |

---

## Task 1: Кнопка

**Files:**
- Modify: `components/simulator/program-panel.tsx`, `components/simulator/lesson-workspace.tsx`
- Modify: `messages/ru.json`, `messages/en.json`

- [x] **Step 1: Строка**

`lesson.downloadPython` в обоих файлах переводов.

- [x] **Step 2: Кнопка и файл**

Скрипт считается один раз и идёт и в показ, и в файл. Ссылка отзывается сразу
после нажатия: иначе Blob висит в памяти вкладки до перезагрузки.

- [x] **Step 3: Проверить типы**

Run: `npm run typecheck`
Expected: без вывода.

## Task 2: Проверка

**Files:**
- Modify: `tests/e2e/lesson.spec.ts`

- [x] **Step 1: E2E**

Нажатие на вкладке «Код» даёт файл `<id задания>.py`, и его содержимое
совпадает с показанным кодом.

- [x] **Step 2: Прогнать**

Run: `npx playwright test tests/e2e/lesson.spec.ts`
Expected: PASS.

- [x] **Step 3: Коммит**
