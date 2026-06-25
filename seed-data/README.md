# seed-data/ — Реальные данные FixPlast для загрузки в Firestore

Положите CSV-файлы в эту папку и запустите `npm run seed`.

---

## Ожидаемые файлы

### 1. `Журнал_Банк.csv` — банковские транзакции

| Колонка CSV | Поле Firestore | Тип | Пример |
|---|---|---|---|
| Дата | `date` | DD.MM.YYYY | `01.05.2026` |
| Описание | `description` | string | `Оплата аренды` |
| Контрагент | `counterparty` | string | `ТОО "Аренда Плюс"` |
| БИН | `partnerBin` | string (11 цифр) | `123456789012` |
| Сумма | `amount` | number (положительная) | `500000` |
| Тип | `type` | `income`/`expense` | `expense` |
| Статья | `categoryName` | string | `Аренда` |
| Счёт | `accountName` | string | `Халык основной` |
| Юр.лицо | `legalEntity` | string | `ТОО Teplomax KZ` |

**Коллекция Firestore:** `transactions`

---

### 2. `Счета.csv` — банковские счета и кассы

| Колонка CSV | Поле Firestore | Тип | Пример |
|---|---|---|---|
| Название | `name` | string | `Халык основной` |
| Тип | `type` | `bank`/`cash`/`card`/`safe` | `bank` |
| Начальный остаток | `startingBalance` | number | `1500000` |
| Банк | `bankName` | string | `Halyk Bank` |
| Активен | `isActive` | `TRUE`/`FALSE` | `TRUE` |

**Коллекция Firestore:** `accounts`

---

### 3. `Категории.csv` — справочник статей

| Колонка CSV | Поле Firestore | Тип | Пример |
|---|---|---|---|
| Название | `name` | string | `Аренда помещения` |
| Тип ДДС | `cashflowType` | `operational`/`investment`/`financial`/`ignore` | `operational` |
| Тип ОПиУ | `pnlType` | `revenue`/`cogs`/`opex`/`ignore` | `opex` |
| Родительская | `parentName` | string | `Операционные расходы` |

**Коллекция Firestore:** `categories`

---

### 4. `Сделки.csv` — продажи / выручка

| Колонка CSV | Поле Firestore | Тип | Пример |
|---|---|---|---|
| Период | `date` | MM.YYYY или DD.MM.YYYY | `05.2026` |
| Юр.лицо | `legalEntity` | string | `ТОО Teplomax KZ` |
| Менеджер | `managerName` | string | `Иванов А.` |
| Контрагент | `counterparty` | string | `ТОО "Строй-Сервис"` |
| Номенклатура | `productName` | string | `Гвоздь строительный 3x70` |
| Количество | `quantity` | number | `5000` |
| Выручка | `revenue` | number (тенге) | `750000` |
| НДС | `vat` | number | `90000` |
| Прибыль | `profit` | number | `180000` |

**Коллекции Firestore:** `sales` (сырые данные) + `transactions` (income транзакция по дате)

---

### 5. `Себестоимость.csv` — себестоимость номенклатуры

| Колонка CSV | Поле Firestore | Тип | Пример |
|---|---|---|---|
| Номенклатура | `name` | string | `Гвоздь строительный 3x70` |
| Единица | `unit` | string | `кг` |
| Себестоимость | `costPerUnit` | number | `120.50` |
| Сырьё | `rawMaterial` | string | `Проволока ст.3` |
| Вес на единицу | `weightPerUnit` | number | `1.05` |

**Коллекция Firestore:** `costItems`

---

### 6. `Займы.csv` — выданные займы

| Колонка CSV | Поле Firestore | Тип | Пример |
|---|---|---|---|
| Дата выдачи | `issueDate` | DD.MM.YYYY | `15.03.2026` |
| Заёмщик | `borrowerName` | string | `Иванов Алмас` |
| Сумма | `amount` | number | `5000000` |
| Ставка | `rate` | number (%) | `12` |
| Срок (мес) | `termMonths` | number | `12` |
| Статус | `status` | `active`/`repaid` | `active` |

**Коллекция Firestore:** `loans`

---

### 7. `ReEstr_OS_FixPlast_Group.xlsx` — реестр основных средств

| Колонка Excel | Поле Firestore | Тип |
|---|---|---|
| Наименование | `name` | string |
| Инвентарный номер | `inventoryNumber` | string |
| Дата ввода в эксплуатацию | `commissionDate` | date |
| Первоначальная стоимость | `initialCost` | number |
| Остаточная стоимость | `residualCost` | number |
| Срок полезного использования | `usefulLifeYears` | number |
| Норма амортизации | `depreciationRate` | number |
| Местонахождение | `location` | string |

**Коллекция Firestore:** `fixedAssets`

---

## После добавления файлов

```bash
npm run seed
```

Скрипт загрузит данные в порядке:
1. accounts (счета)
2. categories (категории)
3. transactions (транзакции из Журнал_Банк.csv)
4. sales (сделки + income транзакции)
5. costItems (себестоимость)
6. loans (займы)
7. fixedAssets (основные средства из Excel)

Проверить результат: http://localhost:4000 → Firestore
