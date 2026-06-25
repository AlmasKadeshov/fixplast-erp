export interface GprTask {
  id: string;
  name: string;
  projectId: string;
  startDate?: Date;
  endDate?: Date;
  progress?: number;
}
