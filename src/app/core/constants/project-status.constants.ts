import { ProjectStatus } from '../models/project.model';

export interface ProjectStatusOption {
  value: ProjectStatus;
  label: string;
}

export const PROJECT_STATUS_OPTIONS: ProjectStatusOption[] = [
  { value: 'planned', label: 'Planifie' },
  { value: 'in_progress', label: 'En cours' },
  { value: 'blocked', label: 'Bloque' },
  { value: 'in_validation', label: 'En validation' },
  { value: 'validated', label: 'Valide' },
  { value: 'closed', label: 'Clos' },
];

export const PROJECT_CREATION_ROLES = ['admin', 'pmo', 'project_manager'] as const;
