export type ValidationDecisionStatus = 'pending' | 'approved' | 'rejected';

export interface ProjectDecision {
  id: string;
  projectId: string;
  stageId: string;
  requestedByUid: string;
  validatorUid: string;
  level: number;
  status: ValidationDecisionStatus;
  comment: string;
  createdAt: number;
  decidedAt?: number;
}

export type ProjectDecisionCreatePayload = Omit<
  ProjectDecision,
  'id' | 'projectId' | 'requestedByUid' | 'status' | 'createdAt' | 'decidedAt'
>;
