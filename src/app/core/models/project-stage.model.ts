export type StageStatus = 'todo' | 'in_progress' | 'blocked' | 'done' | 'validated';

export interface ProjectStage {
  id: string;
  projectId: string;
  name: string;
  order: number;
  responsibleUid: string;
  startDate: string;
  endDate: string;
  status: StageStatus;
  progress: number;
  createdAt: number;
  updatedAt: number;
}

export type ProjectStageCreatePayload = Omit<
  ProjectStage,
  'id' | 'projectId' | 'createdAt' | 'updatedAt' | 'progress'
> & {
  progress?: number;
};

export type ProjectStageUpdatePayload = Partial<Omit<ProjectStage, 'id' | 'projectId' | 'createdAt'>>;
