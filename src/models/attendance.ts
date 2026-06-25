export interface AttendanceRecord {
  id: string;
  employeeId: string;
  objectId: string;
  date: Date;
  type: 'checkin' | 'checkout';
}
