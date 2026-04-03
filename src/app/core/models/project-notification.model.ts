export type NotificationChannel = 'in_app' | 'email';

export type ProjectNotificationType =
  | 'document_submitted'
  | 'document_approved'
  | 'document_rejected'
  | 'document_general'
  | 'decision_action_assigned'
  | 'decision_action_status'
  | 'decision_action_escalated'
  | 'decision_action_reminder'
  | 'decision_action_acknowledged'
  | 'report_digest'
  | 'report_dispatch_alert';

export interface ProjectNotification {
  id: string;
  projectId: string;
  recipientUid: string;
  actorUid: string;
  type: ProjectNotificationType;
  title: string;
  message: string;
  actionUrl: string;
  relatedId?: string;
  channels: NotificationChannel[];
  isRead: boolean;
  createdAt: number;
  readAt?: number;
}

export type NotificationOutboxStatus = 'pending' | 'sent' | 'failed';

export interface NotificationOutboxItem {
  id: string;
  projectId: string;
  notificationId: string;
  recipientUid: string;
  recipientEmail: string;
  subject: string;
  message: string;
  actionUrl?: string;
  status: NotificationOutboxStatus;
  requestedByUid: string;
  createdAt: number;
  attempts?: number;
  attemptedAt?: number;
  sentAt?: number;
  failedAt?: number;
  lastError?: string;
  provider?: string;
}
