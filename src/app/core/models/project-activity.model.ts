export type ActivityStatus = 'todo' | 'in_progress' | 'blocked' | 'done';

export interface ProjectActivity {
  id: string;
  projectId: string;
  stageId: string;
  title: string;
  description: string;
  responsibleUid: string;
  dueDate: string;
  status: ActivityStatus;
  progress: number;
  dependencyActivityIds: string[];
  createdAt: number;
  updatedAt: number;
}

export type ProjectActivityCreatePayload = Omit<
  ProjectActivity,
  'id' | 'projectId' | 'createdAt' | 'updatedAt'
>;

export type ProjectActivityUpdatePayload = Partial<
  Omit<ProjectActivity, 'id' | 'projectId' | 'createdAt'>
>;
