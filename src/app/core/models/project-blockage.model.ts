export type BlockageSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface ProjectBlockage {
  id: string;
  projectId: string;
  stageId?: string;
  activityId?: string;
  title: string;
  cause: string;
  impact: string;
  severity: BlockageSeverity;
  ownerUid: string;
  isResolved: boolean;
  createdAt: number;
  resolvedAt?: number;
}

export type ProjectBlockageCreatePayload = Omit<
  ProjectBlockage,
  'id' | 'projectId' | 'ownerUid' | 'isResolved' | 'createdAt' | 'resolvedAt'
> & {
  stageId?: string;
  activityId?: string;
};
