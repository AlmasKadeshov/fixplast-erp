// @ts-nocheck
/**
 * Инициализация Firebase Admin SDK для seed-скриптов
 * Подключается к локальному эмулятору через FIRESTORE_EMULATOR_HOST
 */
import { initializeApp, cert, getApps, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { createHash } from 'crypto';

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8080';

let app: App;
let _db: Firestore;

export function getAdminDb(): Firestore {
  if (_db) return _db;

  // Устанавливаем эмулятор до инициализации приложения
  process.env.FIRESTORE_EMULATOR_HOST = EMULATOR_HOST;

  if (getApps().length === 0) {
    // Для эмулятора не нужен реальный сервисный аккаунт
    app = initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || 'fixplast-erp-dev',
    });
  }

  _db = getFirestore();
  return _db;
}

export function md5(str: string): string {
  return createHash('md5').update(str).digest('hex');
}

export function log(msg: string): void {
  console.log(msg);
}
