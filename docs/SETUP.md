# FixPlast ERP — Инструкция по запуску

## Требования

- Node.js 20+
- npm 10+
- Java 11+ (для Firebase Emulator)
- `firebase-tools` глобально: `npm install -g firebase-tools`

---

## 1. Клонирование и установка зависимостей

```bash
git clone https://github.com/<your-org>/fixplast-erp.git
cd fixplast-erp
npm install
```

---

## 2. Настройка переменных окружения

Скопируй `.env.example` в `.env.local`:

```bash
cp .env.example .env.local
```

Для работы **только на эмуляторе** (режим разработки) `.env.local` уже заполнен корректными значениями — дальнейшая правка не нужна.

Для подключения к **боевому Firebase** заполни переменные из Firebase Console → Project Settings → Your apps → SDK setup:

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_USE_EMULATOR=false
```

---

## 3. Запуск Firebase Emulator (только для разработки)

```bash
npm run emulators
# или
firebase emulators:start
```

Эмулятор поднимает:
- Firestore → http://localhost:8080
- Auth → http://localhost:9099
- Hosting → http://localhost:5000
- UI → http://localhost:4000

### Создание тестового пользователя

После запуска эмулятора открой http://localhost:4000 → вкладка **Authentication** → кнопка **Add user**:

| Поле | Значение |
|------|----------|
| Email | admin@fixplast.kz |
| Password | test12345 |

Либо через REST API:

```bash
curl -X POST \
  "http://localhost:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-key" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@fixplast.kz","password":"test12345","returnSecureToken":true}'
```

---

## 4. Импорт данных (seed)

Положи CSV-файлы в папку `seed-data/` согласно `seed-data/README.md`.

**Убедись, что эмулятор запущен**, затем:

```bash
npm run seed
```

Если `seed-data/` пустая — скрипт выведет предупреждение и завершится без ошибки.

---

## 5. Запуск dev-сервера

```bash
npm run dev
```

Приложение доступно на http://localhost:5173

---

## 6. Production build

```bash
npm run build
```

Артефакты в папке `dist/`. Для деплоя на Firebase Hosting:

```bash
firebase deploy --only hosting
```

---

## Структура проекта

```
fixplast-erp/
├── src/
│   ├── config/firebase.ts     # инициализация Firebase + эмулятор
│   ├── contexts/AuthContext.tsx
│   ├── pages/Finance/         # все финансовые страницы
│   │   └── MobileExecutiveDashboard.tsx  # главная страница "/"
│   ├── services/              # Firestore CRUD-сервисы
│   ├── hooks/                 # React-хуки
│   ├── models/                # TypeScript-типы
│   └── utils/
├── scripts/seed/              # Node.js скрипты импорта CSV → Firestore
├── seed-data/                 # CSV-файлы (не в репо, добавить вручную)
│   └── README.md              # описание формата каждого файла
├── docs/
│   ├── SETUP.md               # этот файл
│   ├── WORK_LOG.md            # журнал работ и задачи
│   └── PROJECT_DESCRIPTION_FOR_PM.md
├── firestore.rules
├── firebase.json
├── .env.example               # шаблон переменных (без секретов)
└── .env.local                 # локальные значения (в .gitignore)
```

---

## Роли пользователей

| Роль | Доступ |
|------|--------|
| `owner` | всё |
| `director` | финансы, проекты |
| `manager` | проекты, транзакции |
| `accountant` | финансы, отчёты |
| `engineer` | проекты |

Роль определяется по email (временная логика в `AuthContext.tsx`).
Домен `@fixplast.kz` → `director`.

---

## Возможные проблемы

**`FIRESTORE_EMULATOR_HOST is not set`**
→ Убедись, что `VITE_USE_EMULATOR=true` в `.env.local`.

**`Permission denied` при входе**
→ Проверь `firestore.rules` — добавь свой email в функцию `isSuperAdmin()`.

**Blank screen при старте**
→ Проверь консоль браузера; скорее всего Firebase не инициализирован — проверь `.env.local`.
