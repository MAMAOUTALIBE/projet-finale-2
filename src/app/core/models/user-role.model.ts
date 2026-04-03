export type UserRole =
  | 'admin'
  | 'pmo'
  | 'project_manager'
  | 'stakeholder'
  | 'validator'
  | 'decision_maker';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  organization?: string;
  activeProjectIds?: string[];
  createdAt?: number;
  updatedAt?: number;
}
