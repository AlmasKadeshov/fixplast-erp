/**
 * Инициализация Firebase Admin SDK для разовых скриптов.
 *
 * Учётные данные (любой из вариантов):
 *   GOOGLE_APPLICATION_CREDENTIALS=/путь/к/serviceAccount.json
 *   SERVICE_ACCOUNT=/путь/к/serviceAccount.json
 * Ключ берётся в Firebase Console → Project settings → Service accounts →
 * Generate new private key.
 *
 * Проект по умолчанию читается из .firebaserc.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export function projectId() {
    if (process.env.FIREBASE_PROJECT_ID) return process.env.FIREBASE_PROJECT_ID;
    const rc = JSON.parse(readFileSync(resolve(ROOT, '.firebaserc'), 'utf8'));
    return rc.projects?.default;
}

export function credentialsPath() {
    return process.env.SERVICE_ACCOUNT || process.env.GOOGLE_APPLICATION_CREDENTIALS || null;
}

/**
 * Возвращает экземпляр Firestore. Бросает понятную ошибку, если нет ключа
 * или не установлен firebase-admin.
 */
export async function getFirestore() {
    const keyPath = credentialsPath();
    if (!keyPath) {
        throw new Error(
            'Нет учётных данных. Скачайте service account JSON и запустите:\n' +
            '  SERVICE_ACCOUNT=/путь/к/key.json node scripts/<скрипт>.mjs --apply'
        );
    }

    let admin;
    try {
        admin = await import('firebase-admin/app');
    } catch {
        throw new Error('Не установлен firebase-admin. Выполните: npm i -D firebase-admin');
    }
    const { getFirestore: adminFirestore } = await import('firebase-admin/firestore');

    const serviceAccount = JSON.parse(readFileSync(resolve(keyPath), 'utf8'));
    const app = admin.getApps().length
        ? admin.getApps()[0]
        : admin.initializeApp({
            credential: admin.cert(serviceAccount),
            projectId: projectId(),
        });

    return adminFirestore(app);
}

/**
 * Запись пачками по 500 документов (лимит батча Firestore).
 * ops: [{ ref, data, merge }]
 */
export async function commitInChunks(db, ops, chunkSize = 400) {
    for (let i = 0; i < ops.length; i += chunkSize) {
        const batch = db.batch();
        for (const op of ops.slice(i, i + chunkSize)) {
            batch.set(op.ref, op.data, { merge: !!op.merge });
        }
        await batch.commit();
        process.stdout.write(`  записано ${Math.min(i + chunkSize, ops.length)} / ${ops.length}\r`);
    }
    if (ops.length) process.stdout.write('\n');
}
