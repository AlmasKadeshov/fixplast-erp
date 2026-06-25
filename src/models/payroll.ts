export interface PayrollRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  month: number;
  year: number;
  baseSalary: number;
  bonus?: number;
  deductions?: number;
  netPay: number;
  status: 'pending' | 'paid';
  paidDate?: Date;
  transactionId?: string;
}
