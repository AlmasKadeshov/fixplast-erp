import { collection, getDocs, addDoc, updateDoc, doc, Timestamp, DocumentData } from 'firebase/firestore';
import { db } from '../config/firebase';
import { PayrollRecord } from '../models/payroll';

function mapDoc(id: string, data: DocumentData): PayrollRecord {
  return { id, employeeId: data.employeeId || '', employeeName: data.employeeName || '', month: data.month || 1, year: data.year || 2026, baseSalary: data.baseSalary || 0, bonus: data.bonus, deductions: data.deductions, netPay: data.netPay || 0, status: data.status || 'pending', paidDate: data.paidDate instanceof Timestamp ? data.paidDate.toDate() : undefined, transactionId: data.transactionId };
}

export const payrollService = {
  async getAll(): Promise<PayrollRecord[]> {
    const snap = await getDocs(collection(db, 'payroll'));
    return snap.docs.map(d => mapDoc(d.id, d.data()));
  },
  async create(r: Omit<PayrollRecord, 'id'>): Promise<PayrollRecord> {
    const ref = await addDoc(collection(db, 'payroll'), { ...r, createdAt: Timestamp.now() });
    return { ...r, id: ref.id };
  },
  async update(id: string, r: Partial<PayrollRecord>): Promise<void> {
    await updateDoc(doc(db, 'payroll', id), r);
  },
};
