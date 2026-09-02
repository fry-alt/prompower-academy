# PROMPOWER Academy — правила проекта

> **Этот файл ОТМЕНЯЕТ `~/CLAUDE.md`.** Тот файл описывает другой проект
> (Telegram Mini App «tiply» на Supabase). Здесь Supabase, Telegram SDK,
> shadcn/ui и Server Actions **не используются**.

Источник истины по требованиям — [docs/brief.md](docs/brief.md). Читать целиком
перед работой. Не начинать фазу N+1, пока не выполнен DoD фазы N (§12 брифа).

## Стек (зафиксирован, §2 брифа)

| Слой | Решение |
|---|---|
| Фронтенд | Next.js 15 (App Router) + TypeScript strict + Tailwind CSS |
| 3D | three.js через @react-three/fiber + @react-three/drei |
| Робот | `urdf-loader`, меши в glTF/Draco |
| IK | `closed-chain-ik-js` |
| Блоки | Blockly (Apache 2.0), кастомные блоки под команды JAKA |
| Бэкенд | Next.js Route Handlers (тот же репозиторий) |
| БД | PostgreSQL + Prisma |
| Auth | Auth.js (NextAuth), credentials + argon2 |
| Файлы | S3-совместимое хранилище (Selectel / Yandex Object Storage) |
| Хостинг | Только российские площадки (152-ФЗ) |
| i18n | `next-intl` с первого дня, строк в JSX нет |
| Тесты | Vitest (sim-core), Playwright (e2e) |

## Жёсткие инварианты

- `packages/sim-core` не импортирует ни React, ни three.js. Чистая логика под unit-тесты.
- Программа хранится как JSON-AST (дискриминированное объединение по `op`), не как строка кода.
- Интерпретатор детерминирован: без `Math.random()`, без `Date.now()`. Время — счётчик тиков.
- Ни одна характеристика робота не хардкодится — всё из URDF или конфига плагина модели.
- Каждая модель кобота — отдельный плагин в `packages/robot-plugins/<model-slug>/`.
- Физического движка нет. Кинематика + AABB-коллизии — потолок (§4.3, §13 брифа).
- Прогресс — только в БД. `localStorage` допустим лишь для несохранённого черновика программы.
- Секреты только через переменные окружения. В репозитории — `.env.example`, реальный `.env` — никогда.

## Данные PROMPOWER

URDF, меши, спецификации и брендбук предоставляет заказчик. **Не выдумывать
параметры роботов и не тянуть модели из публичных репозиториев JAKA** — спрашивать.

## Рабочий процесс

1. PLAN → `/writing-plans`
2. CODE → по плану
3. REVIEW → `/code-review`
4. SIMPLIFY → `/simplify`
5. VERIFY → `/verification-before-completion`
