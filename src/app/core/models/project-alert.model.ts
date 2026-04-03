export type ProjectAlertType = 'delay' | 'blockage' | 'validation';
export type ProjectAlertSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface ProjectAlert {
  id: string;
  projectId: string;
  type: ProjectAlertType;
  severity: ProjectAlertSeverity;
  message: string;
  relatedId: string;
  createdAt: number;
  resolved: boolean;
}
