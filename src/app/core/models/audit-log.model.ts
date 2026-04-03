export type AuditTargetType =
  | 'project'
  | 'stage'
  | 'activity'
  | 'blockage'
  | 'decision'
  | 'document'
  | 'decision_action';

export interface AuditLog {
  id: string;
  projectId: string;
  actorUid: string;
  action: string;
  targetType: AuditTargetType;
  targetId: string;
  message: string;
  createdAt: number;
}

export type AuditLogCreatePayload = Omit<AuditLog, 'id' | 'actorUid' | 'createdAt'>;
