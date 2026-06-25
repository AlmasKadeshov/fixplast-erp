# FixPlast ERP

Внутренняя ERP-система для Fix Plast Group (Астана, производство пластиковых изделий).

## Стек

- **React 19** + **TypeScript 5.8** + **Vite 6**
- **Firebase 11** (Firestore, Auth) + **Firebase Emulator** для разработки
- **Tailwind CSS v4** (CSS-first, без tailwind.config.js)
- **Framer Motion** — анимации
- **Recharts** — графики
- **React Router v7**

## Быстрый старт

```bash
npm install
npm run emulators   # Firestore:8080, Auth:9099, UI:4000
npm run dev         # http://localhost:5173
```

Подробная инструкция: [docs/SETUP.md](docs/SETUP.md)

## Загрузка данных

```bash
# Положи CSV-файлы в seed-data/ (см. seed-data/README.md)
npm run seed
```

## Структура модулей

| Модуль | Путь |
|--------|------|
| Главный дашборд (мобильный) | `src/pages/Finance/MobileExecutiveDashboard.tsx` |
| ДДС / Кэшфлоу | `src/pages/Finance/CashflowPage.tsx` |
| ОПиУ / P&L | `src/pages/Finance/PnLPage.tsx` |
| Баланс | `src/pages/Finance/BalancePage.tsx` |
| План-факт | `src/pages/Finance/PlanFactPage.tsx` |
| Дебиторка | `src/pages/Finance/DebtsReportPage.tsx` |
| Зарплата | `src/pages/Finance/PayrollPage.tsx` |
| Транзакции | `src/pages/Finance/TransactionsPage.tsx` |

## Переменные окружения

Скопируй `.env.example` в `.env.local`. Для разработки с эмулятором значения уже заполнены.

> ⚠️ Никогда не коммить `.env.local` в git — файл в `.gitignore`.

## Журнал работ

[WORK_LOG.md](WORK_LOG.md)
