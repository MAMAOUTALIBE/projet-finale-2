export type ProjectStatus =
  | 'planned'
  | 'in_progress'
  | 'blocked'
  | 'in_validation'
  | 'validated'
  | 'closed';

export interface Project {
  id: string;
  code: string;
  name: string;
  description: string;
  sponsor: string;
  ownerOrganization: string;
  startDate: string;
  endDate: string;
  budget: number;
  status: ProjectStatus;
  progress: number;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export type ProjectCreatePayload = Omit<
  Project,
  'id' | 'progress' | 'createdBy' | 'createdAt' | 'updatedAt'
> & {
  progress?: number;
};
