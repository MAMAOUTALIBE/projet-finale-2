import { ActivityStatus } from '../models/project-activity.model';
import { BlockageSeverity } from '../models/project-blockage.model';
import { DecisionActionPriority, DecisionActionStatus } from '../models/project-decision-action.model';
import { StageStatus } from '../models/project-stage.model';

export interface LabelValueOption<T extends string> {
  value: T;
  label: string;
}

export const STAGE_STATUS_OPTIONS: LabelValueOption<StageStatus>[] = [
  { value: 'todo', label: 'A faire' },
  { value: 'in_progress', label: 'En cours' },
  { value: 'blocked', label: 'Bloque' },
  { value: 'done', label: 'Termine' },
  { value: 'validated', label: 'Valide' },
];

export const ACTIVITY_STATUS_OPTIONS: LabelValueOption<ActivityStatus>[] = [
  { value: 'todo', label: 'A faire' },
  { value: 'in_progress', label: 'En cours' },
  { value: 'blocked', label: 'Bloque' },
  { value: 'done', label: 'Termine' },
];

export const BLOCKAGE_SEVERITY_OPTIONS: LabelValueOption<BlockageSeverity>[] = [
  { value: 'low', label: 'Faible' },
  { value: 'medium', label: 'Moyenne' },
  { value: 'high', label: 'Elevee' },
  { value: 'critical', label: 'Critique' },
];

export const DECISION_ACTION_PRIORITY_OPTIONS: LabelValueOption<DecisionActionPriority>[] = [
  { value: 'critical', label: 'Critique' },
  { value: 'high', label: 'Elevee' },
  { value: 'medium', label: 'Moyenne' },
  { value: 'low', label: 'Faible' },
];

export const DECISION_ACTION_STATUS_OPTIONS: LabelValueOption<DecisionActionStatus>[] = [
  { value: 'todo', label: 'A lancer' },
  { value: 'in_progress', label: 'En cours' },
  { value: 'blocked', label: 'Bloquee' },
  { value: 'done', label: 'Terminee' },
];
