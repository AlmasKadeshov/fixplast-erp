/**
 * Базовый интерфейс для всех сущностей
 */
export interface BaseEntity {
  /** Уникальный идентификатор */
  id: string;
  /** Дата создания записи */
  createdAt: Date;
  /** Дата последнего обновления */
  updatedAt: Date;
}

// ============================================
// СОТРУДНИКИ
// ============================================

/** Роль сотрудника в системе */
export type EmployeeRole = 'owner' | 'director' | 'manager' | 'engineer' | 'accountant';

/** Статус сотрудника */
export type EmployeeStatus = 'active' | 'inactive';

/**
 * Сотрудник компании
 */
export interface Employee extends BaseEntity {
  /** Краткое имя (для отображения) */
  name: string;
  /** Полное ФИО */
  fullName: string;
  /** Должность */
  position: string;
  /** Отдел/подразделение */
  department: string;
  /** Оклад (тенге) */
  salary: number;
  /** Максимальный бонус (тенге) */
  bonusMax: number;
  /** Время начала работы (формат HH:mm) */
  workStart: string;
  /** Время окончания работы (формат HH:mm) */
  workEnd: string;
  /** Номер телефона */
  phone: string;
  /** Email адрес */
  email: string;
  /** Telegram ID для уведомлений */
  telegramId?: string;
  /** ID руководителя (ссылка на другого сотрудника) */
  managerId?: string;
  /** Роль в системе */
  role: EmployeeRole;
  /** Список ID объектов, на которых сотрудник может отмечаться */
  allowedObjects: string[];
  /** Статус сотрудника */
  status: EmployeeStatus;
  /** Тип выплаты зарплаты */
  paymentType?: 'official' | 'cash';
  /** Дата приёма на работу */
  hireDate: Date;
}

// ============================================
// ЖИЛЫЕ КОМПЛЕКСЫ
// ============================================

export * from './residentialComplex';

// ============================================
// ПРОЕКТЫ
// ============================================

/** Статус проекта */
export type ProjectStatus = 'planning' | 'in_progress' | 'finishing' | 'completed';

/** Тип проекта для иерархии */
export type ProjectType = 'group' | 'block' | 'system' | 'contract' | 'project';

/**
 * Проект = Категория + Блок в рамках ЖК
 * Например: "ОВК - Блок А" в ЖК "Ла Фамилия"
 *
 * Каждый проект имеет:
 * - 2 ГПР: один для СМР, второй для Поставки ТМЦ
 */
export interface Project extends BaseEntity {
  /** Код проекта (например: PRJ-2024-001) */
  code: string;

  /** Название проекта (автогенерируется: "ОВК - Блок А") */
  name: string;

  /** Тип проекта (для иерархии) */
  type?: ProjectType;

  /** ID родительского проекта (для иерархии) */
  parentId?: string;

  /** Иконка проекта */
  icon?: string;

  /** ID жилого комплекса */
  complexId?: string;

  /** Название ЖК (денормализованное поле) */
  complexName?: string;

  /** Категория работ (ОВК, НВК, Электрика и т.д.) */
  category?: import('./residentialComplex').WorkCategory;

  /** Название блока/здания (Блок А, Блок Б, Блок 1, и т.д.) */
  blockName?: string;

  /** Описание проекта */
  description?: string;

  /** ID заказчика (контрагента) */
  clientId?: string;

  /** Название заказчика (денормализованное поле) */
  clientName?: string;

  /** Сумма договора (тенге) */
  contractAmount?: number;

  /** Плановая маржа (%) */
  plannedMargin?: number;

  /** Дата начала проекта */
  startDate?: Date;

  /** Дата окончания проекта */
  endDate?: Date;

  /** ID руководителя проекта */
  rpId?: string;

  /** ID ПТО (инженер производственно-технического отдела) */
  ptoId?: string;

  /** ID технадзора */
  technadzorId?: string;

  /** Статус проекта */
  status: ProjectStatus;

  /** Прогресс выполнения (0-100%) */
  progress?: number;

  /** Номер договора */
  contractNumber?: string;

  /** Дата договора */
  contractDate?: Date;

  /** Является ли проект АУП (административно-управленческие) */
  isAUP?: boolean;
}


// ============================================
// КОНТРАГЕНТЫ
// ============================================

/** Тип контрагента */
export type PartnerType = 'CLIENT' | 'SUPPLIER' | 'SUBCONTRACTOR' | 'BANK';

/**
 * Контрагент (клиент, поставщик, субподрядчик, банк)
 */
export interface Partner extends BaseEntity {
  /** Название организации */
  name: string;
  /** Тип контрагента */
  type: PartnerType;
  /** БИН (бизнес-идентификационный номер) */
  bin: string;
  /** Контактное лицо */
  contactPerson?: string;
  /** Номер телефона */
  phone?: string;
  /** Email адрес */
  email?: string;
  /** ID проекта по умолчанию (для привязки расходов) */
  defaultProjectId?: string;
  /** 
   * ID аффилированного (головного) контрагента.
   * Используется для группировки связанных компаний.
   * Например: Aitore → Тан Шолпан (одна группа компаний)
   */
  affiliatedPartnerId?: string;
}

// ============================================
// ОБЪЕКТЫ (ПЛОЩАДКИ)
// ============================================

/** Статус объекта */
export type ObjectStatus = 'active' | 'inactive';

/**
 * Геолокация объекта
 */
export interface GeoLocation {
  /** Широта */
  lat: number;
  /** Долгота */
  lng: number;
}

/**
 * Объект/площадка (место проведения работ)
 */
export interface SiteObject extends BaseEntity {
  /** Название объекта */
  name: string;
  /** Адрес объекта */
  address: string;
  /** ID проекта, к которому привязан объект */
  projectId: string;
  /** Секретный ключ для генерации QR-кода */
  qrSecret: string;
  /** URL для QR-кода (для отметки посещений) */
  qrUrl: string;
  /** Геолокация объекта */
  location: GeoLocation;
  /** Статус объекта */
  status: ObjectStatus;
}

// ============================================
// ГПР (ГРАФИК ПРОИЗВОДСТВА РАБОТ)
// ============================================

export * from './gpr';

// ============================================
// ТАБЕЛЬ (УЧЁТ РАБОЧЕГО ВРЕМЕНИ)
// ============================================

export * from './attendance';

// ============================================
// ПТО / СНАБЖЕНИЕ (ВДЦ НАКОПИТЕЛЬ)
// ============================================

export * from './pto';

// ============================================
// КП (КОММЕРЧЕСКИЕ ПРЕДЛОЖЕНИЯ)
// ============================================

export * from './kp';

// ============================================
// ПОСТАВЩИКИ
// ============================================

export * from './supplier';

export * from './user';

// ============================================
// ЦЕНОВОЙ АНАЛИЗ
// ============================================

export * from './priceAnalysis';

// ============================================
// ФИНАНСЫ
// ============================================

export * from './finance';
export * from './account';
export * from './category';
export * from './tag';
export * from './budgetPlan';
export * from './projectDocuments';
