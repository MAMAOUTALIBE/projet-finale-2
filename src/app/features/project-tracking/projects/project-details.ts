import { AsyncPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { combineLatest } from 'rxjs';
import { filter, map, shareReplay, switchMap } from 'rxjs/operators';
import {
  ACTIVITY_STATUS_OPTIONS,
  BLOCKAGE_SEVERITY_OPTIONS,
  DECISION_ACTION_PRIORITY_OPTIONS,
  STAGE_STATUS_OPTIONS,
} from '../../../core/constants/project-execution.constants';
import { ProjectActivity, ProjectActivityCreatePayload, ActivityStatus } from '../../../core/models/project-activity.model';
import { ProjectAlert, ProjectAlertSeverity } from '../../../core/models/project-alert.model';
import { ProjectBlockage, ProjectBlockageCreatePayload, BlockageSeverity } from '../../../core/models/project-blockage.model';
import {
  DecisionActionPriority,
  DecisionActionStatus,
  ProjectDecisionAction,
  ProjectDecisionActionCreatePayload,
} from '../../../core/models/project-decision-action.model';
import {
  ProjectDecision,
  ProjectDecisionCreatePayload,
  ValidationDecisionStatus,
} from '../../../core/models/project-decision.model';
import { DocumentValidationStatus, ProjectDocument } from '../../../core/models/project-document.model';
import { ProjectStage, ProjectStageCreatePayload, StageStatus } from '../../../core/models/project-stage.model';
import { UserRole } from '../../../core/models/user-role.model';
import { ProjectTrackingService } from '../../../core/services/project-tracking.service';
import { RoleService } from '../../../core/services/role.service';

@Component({
  selector: 'app-project-details',
  imports: [AsyncPipe, DatePipe, DecimalPipe, ReactiveFormsModule, RouterModule],
  templateUrl: './project-details.html',
  styleUrl: './project-details.scss',
})
export class ProjectDetails {
  private route = inject(ActivatedRoute);
  private projectService = inject(ProjectTrackingService);
  private roleService = inject(RoleService);
  private formBuilder = inject(FormBuilder);

  readonly stageStatusOptions = STAGE_STATUS_OPTIONS;
  readonly activityStatusOptions = ACTIVITY_STATUS_OPTIONS;
  readonly blockageSeverityOptions = BLOCKAGE_SEVERITY_OPTIONS;
  readonly decisionActionPriorityOptions = DECISION_ACTION_PRIORITY_OPTIONS;
  readonly currentRole$ = this.roleService.currentUserRole$();
  readonly canManageProject$ = this.currentRole$.pipe(
    map((role) => this.hasAnyRole(role, ['admin', 'pmo', 'project_manager']))
  );
  readonly canManageDecisionActions$ = this.currentRole$.pipe(
    map((role) => this.hasAnyRole(role, ['admin', 'pmo', 'project_manager', 'decision_maker']))
  );
  readonly canDecideValidation$ = this.currentRole$.pipe(
    map((role) => this.hasAnyRole(role, ['admin', 'pmo', 'project_manager', 'validator', 'decision_maker']))
  );
  readonly canUploadDocuments$ = this.currentRole$.pipe(map((role) => role !== null));

  isSubmittingStage = false;
  isSubmittingActivity = false;
  isSubmittingBlockage = false;
  isSubmittingValidation = false;
  isSubmittingDecisionAction = false;
  isSubmittingDocument = false;
  processingBlockageId = '';
  processingDecisionId = '';
  processingDecisionActionId = '';
  processingDecisionActionAckId = '';
  processingDocumentId = '';
  processingDocumentDecisionId = '';
  selectedDocumentFile: File | null = null;
  selectedDocumentName = '';
  selectedVersionSourceDocument: ProjectDocument | null = null;
  submitError = '';

  readonly projectId$ = this.route.paramMap.pipe(
    map((params) => params.get('projectId')),
    filter((projectId): projectId is string => Boolean(projectId)),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  readonly project$ = this.projectId$.pipe(switchMap((projectId) => this.projectService.getProject(projectId)));
  readonly stages$ = this.projectId$.pipe(switchMap((projectId) => this.projectService.listStages(projectId)));
  readonly activities$ = this.projectId$.pipe(switchMap((projectId) => this.projectService.listActivities(projectId)));
  readonly blockages$ = this.projectId$.pipe(switchMap((projectId) => this.projectService.listBlockages(projectId)));
  readonly decisions$ = this.projectId$.pipe(switchMap((projectId) => this.projectService.listDecisions(projectId)));
  readonly decisionActions$ = this.projectId$.pipe(
    switchMap((projectId) => this.projectService.listDecisionActions(projectId))
  );
  readonly documents$ = this.projectId$.pipe(switchMap((projectId) => this.projectService.listProjectDocuments(projectId)));
  readonly alerts$ = this.projectId$.pipe(switchMap((projectId) => this.projectService.getProjectAlerts(projectId)));
  readonly auditLogs$ = this.projectId$.pipe(switchMap((projectId) => this.projectService.listAuditLogs(projectId)));

  readonly executionSummary$ = combineLatest([
    this.stages$,
    this.activities$,
    this.blockages$,
    this.decisions$,
    this.decisionActions$,
  ]).pipe(
    map(([stages, activities, blockages, decisions, decisionActions]) => ({
      stages: stages.length,
      activities: activities.length,
      blockedActivities: activities.filter((activity) => activity.status === 'blocked').length,
      openBlockages: blockages.filter((blockage) => !blockage.isResolved).length,
      pendingValidations: decisions.filter((decision) => decision.status === 'pending').length,
      openDecisionActions: decisionActions.filter((action) => action.status !== 'done').length,
      overdueDecisionActions: decisionActions.filter(
        (action) => action.status !== 'done' && this.parseDate(action.dueDate) < Date.now()
      ).length,
    }))
  );

  readonly stageForm = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(3)]],
    order: [1, [Validators.required, Validators.min(1)]],
    responsibleUid: ['', [Validators.required, Validators.minLength(3)]],
    startDate: ['', Validators.required],
    endDate: ['', Validators.required],
    status: ['todo' as StageStatus, Validators.required],
  });

  readonly activityForm = this.formBuilder.nonNullable.group({
    stageId: ['', Validators.required],
    title: ['', [Validators.required, Validators.minLength(3)]],
    description: ['', [Validators.required, Validators.minLength(5)]],
    responsibleUid: ['', [Validators.required, Validators.minLength(3)]],
    dueDate: ['', Validators.required],
    status: ['todo' as ActivityStatus, Validators.required],
    progress: [0, [Validators.required, Validators.min(0), Validators.max(100)]],
    dependencyActivityIdsText: [''],
  });

  readonly blockageForm = this.formBuilder.nonNullable.group({
    title: ['', [Validators.required, Validators.minLength(3)]],
    cause: ['', [Validators.required, Validators.minLength(3)]],
    impact: ['', [Validators.required, Validators.minLength(3)]],
    severity: ['medium' as BlockageSeverity, Validators.required],
    stageId: [''],
    activityId: [''],
  });

  readonly validationForm = this.formBuilder.nonNullable.group({
    stageId: ['', Validators.required],
    validatorUid: ['', [Validators.required, Validators.minLength(3)]],
    level: [1, [Validators.required, Validators.min(1), Validators.max(3)]],
    comment: [''],
  });

  readonly decisionActionForm = this.formBuilder.nonNullable.group({
    title: ['', [Validators.required, Validators.minLength(3)]],
    description: ['', [Validators.required, Validators.minLength(5)]],
    ownerUid: ['', [Validators.required, Validators.minLength(3)]],
    dueDate: ['', Validators.required],
    priority: ['medium' as DecisionActionPriority, Validators.required],
    decisionId: [''],
    stageId: [''],
  });

  readonly documentForm = this.formBuilder.nonNullable.group({
    description: [''],
  });

  async addStage(): Promise<void> {
    this.submitError = '';

    if (this.stageForm.invalid) {
      this.stageForm.markAllAsTouched();
      return;
    }

    const projectId = this.getCurrentProjectId();
    if (!projectId) {
      this.submitError = 'Projet introuvable.';
      return;
    }

    const value = this.stageForm.getRawValue();
    const payload: ProjectStageCreatePayload = {
      name: value.name.trim(),
      order: Number(value.order),
      responsibleUid: value.responsibleUid.trim(),
      startDate: value.startDate,
      endDate: value.endDate,
      status: value.status,
      progress: 0,
    };

    this.isSubmittingStage = true;
    try {
      await this.projectService.createStage(projectId, payload);
      this.stageForm.reset({
        name: '',
        order: value.order + 1,
        responsibleUid: '',
        startDate: '',
        endDate: '',
        status: 'todo',
      });
    } catch (error) {
      this.submitError = error instanceof Error ? error.message : 'Creation etape impossible.';
    } finally {
      this.isSubmittingStage = false;
    }
  }

  async addActivity(): Promise<void> {
    this.submitError = '';

    if (this.activityForm.invalid) {
      this.activityForm.markAllAsTouched();
      return;
    }

    const projectId = this.getCurrentProjectId();
    if (!projectId) {
      this.submitError = 'Projet introuvable.';
      return;
    }

    const value = this.activityForm.getRawValue();
    const dependencyActivityIds = value.dependencyActivityIdsText
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

    const payload: ProjectActivityCreatePayload = {
      stageId: value.stageId,
      title: value.title.trim(),
      description: value.description.trim(),
      responsibleUid: value.responsibleUid.trim(),
      dueDate: value.dueDate,
      status: value.status,
      progress: Number(value.progress),
      dependencyActivityIds,
    };

    this.isSubmittingActivity = true;
    try {
      await this.projectService.createActivity(projectId, payload);
      this.activityForm.reset({
        stageId: '',
        title: '',
        description: '',
        responsibleUid: '',
        dueDate: '',
        status: 'todo',
        progress: 0,
        dependencyActivityIdsText: '',
      });
    } catch (error) {
      this.submitError = error instanceof Error ? error.message : 'Creation activite impossible.';
    } finally {
      this.isSubmittingActivity = false;
    }
  }

  async addBlockage(): Promise<void> {
    this.submitError = '';

    if (this.blockageForm.invalid) {
      this.blockageForm.markAllAsTouched();
      return;
    }

    const projectId = this.getCurrentProjectId();
    if (!projectId) {
      this.submitError = 'Projet introuvable.';
      return;
    }

    const value = this.blockageForm.getRawValue();
    const payload: ProjectBlockageCreatePayload = {
      title: value.title.trim(),
      cause: value.cause.trim(),
      impact: value.impact.trim(),
      severity: value.severity,
      stageId: value.stageId.trim() || undefined,
      activityId: value.activityId.trim() || undefined,
    };

    this.isSubmittingBlockage = true;
    try {
      await this.projectService.createBlockage(projectId, payload);
      this.blockageForm.reset({
        title: '',
        cause: '',
        impact: '',
        severity: 'medium',
        stageId: '',
        activityId: '',
      });
    } catch (error) {
      this.submitError = error instanceof Error ? error.message : 'Creation blocage impossible.';
    } finally {
      this.isSubmittingBlockage = false;
    }
  }

  async addValidationRequest(): Promise<void> {
    this.submitError = '';

    if (this.validationForm.invalid) {
      this.validationForm.markAllAsTouched();
      return;
    }

    const projectId = this.getCurrentProjectId();
    if (!projectId) {
      this.submitError = 'Projet introuvable.';
      return;
    }

    const value = this.validationForm.getRawValue();
    const payload: ProjectDecisionCreatePayload = {
      stageId: value.stageId,
      validatorUid: value.validatorUid.trim(),
      level: Number(value.level),
      comment: value.comment.trim(),
    };

    this.isSubmittingValidation = true;
    try {
      await this.projectService.createValidationRequest(projectId, payload);
      this.validationForm.reset({
        stageId: '',
        validatorUid: '',
        level: 1,
        comment: '',
      });
    } catch (error) {
      this.submitError = error instanceof Error ? error.message : 'Demande de validation impossible.';
    } finally {
      this.isSubmittingValidation = false;
    }
  }

  async addDecisionAction(): Promise<void> {
    this.submitError = '';

    if (this.decisionActionForm.invalid) {
      this.decisionActionForm.markAllAsTouched();
      return;
    }

    const projectId = this.getCurrentProjectId();
    if (!projectId) {
      this.submitError = 'Projet introuvable.';
      return;
    }

    const value = this.decisionActionForm.getRawValue();
    const payload: ProjectDecisionActionCreatePayload = {
      title: value.title.trim(),
      description: value.description.trim(),
      ownerUid: value.ownerUid.trim(),
      dueDate: value.dueDate,
      priority: value.priority,
      decisionId: value.decisionId.trim() || undefined,
      stageId: value.stageId.trim() || undefined,
    };

    this.isSubmittingDecisionAction = true;
    try {
      await this.projectService.createDecisionAction(projectId, payload);
      this.decisionActionForm.reset({
        title: '',
        description: '',
        ownerUid: '',
        dueDate: '',
        priority: 'medium',
        decisionId: '',
        stageId: '',
      });
    } catch (error) {
      this.submitError = error instanceof Error ? error.message : 'Creation action decisionnelle impossible.';
    } finally {
      this.isSubmittingDecisionAction = false;
    }
  }

  async startDecisionAction(action: ProjectDecisionAction): Promise<void> {
    await this.changeDecisionActionStatus(action, 'in_progress', 'Action demarree via interface.');
  }

  async blockDecisionAction(action: ProjectDecisionAction): Promise<void> {
    await this.changeDecisionActionStatus(action, 'blocked', 'Action marquee bloquee via interface.');
  }

  async completeDecisionAction(action: ProjectDecisionAction): Promise<void> {
    await this.changeDecisionActionStatus(action, 'done', 'Action terminee via interface.');
  }

  async acknowledgeDecisionActionEscalation(action: ProjectDecisionAction): Promise<void> {
    if (Number(action.escalationLevel ?? 0) <= 0 || action.escalationAcknowledgedAt) {
      return;
    }

    const projectId = this.getCurrentProjectId();
    if (!projectId) {
      this.submitError = 'Projet introuvable.';
      return;
    }

    this.processingDecisionActionAckId = action.id;
    this.submitError = '';

    try {
      await this.projectService.acknowledgeDecisionActionEscalation(
        projectId,
        action.id,
        'Prise en charge accusee via interface projet.'
      );
    } catch (error) {
      this.submitError = error instanceof Error ? error.message : 'Accuse de prise en charge impossible.';
    } finally {
      this.processingDecisionActionAckId = '';
    }
  }

  onDocumentSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.selectedDocumentFile = file;
    this.selectedDocumentName = file?.name ?? '';
  }

  prepareNewDocumentVersion(document: ProjectDocument): void {
    if (document.isArchived) {
      return;
    }

    this.selectedVersionSourceDocument = document;
  }

  clearDocumentVersionSource(): void {
    this.selectedVersionSourceDocument = null;
  }

  async uploadDocument(fileInput?: HTMLInputElement): Promise<void> {
    this.submitError = '';
    const projectId = this.getCurrentProjectId();

    if (!projectId) {
      this.submitError = 'Projet introuvable.';
      return;
    }

    if (!this.selectedDocumentFile) {
      this.submitError = 'Selectionnez un fichier a televerser.';
      return;
    }

    this.isSubmittingDocument = true;
    try {
      const description = this.documentForm.controls.description.value ?? '';
      await this.projectService.uploadProjectDocument(
        projectId,
        this.selectedDocumentFile,
        description,
        this.selectedVersionSourceDocument?.id
      );
      this.documentForm.reset({ description: '' });
      this.selectedDocumentFile = null;
      this.selectedDocumentName = '';
      this.selectedVersionSourceDocument = null;
      if (fileInput) {
        fileInput.value = '';
      }
    } catch (error) {
      this.submitError = error instanceof Error ? error.message : 'Televersement impossible.';
    } finally {
      this.isSubmittingDocument = false;
    }
  }

  async archiveDocument(document: ProjectDocument): Promise<void> {
    if (document.isArchived) {
      return;
    }

    const projectId = this.getCurrentProjectId();
    if (!projectId) {
      this.submitError = 'Projet introuvable.';
      return;
    }

    this.processingDocumentId = document.id;
    this.submitError = '';

    try {
      await this.projectService.archiveProjectDocument(projectId, document.id);
      if (this.selectedVersionSourceDocument?.id === document.id) {
        this.selectedVersionSourceDocument = null;
      }
    } catch (error) {
      this.submitError = error instanceof Error ? error.message : 'Archivage document impossible.';
    } finally {
      this.processingDocumentId = '';
    }
  }

  async submitDocumentForValidation(document: ProjectDocument): Promise<void> {
    if (document.isArchived) {
      return;
    }

    const projectId = this.getCurrentProjectId();
    if (!projectId) {
      this.submitError = 'Projet introuvable.';
      return;
    }

    this.processingDocumentDecisionId = document.id;
    this.submitError = '';

    try {
      await this.projectService.submitProjectDocumentForValidation(projectId, document.id);
    } catch (error) {
      this.submitError = error instanceof Error ? error.message : 'Soumission document impossible.';
    } finally {
      this.processingDocumentDecisionId = '';
    }
  }

  async approveDocumentValidation(document: ProjectDocument): Promise<void> {
    await this.decideDocumentValidation(document, 'approved', 'Document approuve via interface.');
  }

  async rejectDocumentValidation(document: ProjectDocument): Promise<void> {
    await this.decideDocumentValidation(document, 'rejected', 'Document rejete via interface.');
  }

  async resolveBlockage(blockage: ProjectBlockage): Promise<void> {
    if (blockage.isResolved) {
      return;
    }

    const projectId = this.getCurrentProjectId();
    if (!projectId) {
      this.submitError = 'Projet introuvable.';
      return;
    }

    this.processingBlockageId = blockage.id;
    this.submitError = '';

    try {
      await this.projectService.resolveBlockage(projectId, blockage.id);
    } catch (error) {
      this.submitError = error instanceof Error ? error.message : 'Resolution blocage impossible.';
    } finally {
      this.processingBlockageId = '';
    }
  }

  async approveDecision(decision: ProjectDecision): Promise<void> {
    await this.decide(decision, 'approved', 'Validation approuvee via interface.');
  }

  async rejectDecision(decision: ProjectDecision): Promise<void> {
    await this.decide(decision, 'rejected', 'Validation rejetee via interface.');
  }

  stageStatusClass(status: StageStatus): string {
    switch (status) {
      case 'done':
      case 'validated':
        return 'bg-success-transparent text-success';
      case 'blocked':
        return 'bg-danger-transparent text-danger';
      case 'in_progress':
        return 'bg-info-transparent text-info';
      default:
        return 'bg-light text-dark';
    }
  }

  activityStatusClass(status: ActivityStatus): string {
    switch (status) {
      case 'done':
        return 'bg-success-transparent text-success';
      case 'blocked':
        return 'bg-danger-transparent text-danger';
      case 'in_progress':
        return 'bg-info-transparent text-info';
      default:
        return 'bg-light text-dark';
    }
  }

  blockageSeverityClass(severity: BlockageSeverity): string {
    switch (severity) {
      case 'critical':
        return 'bg-danger text-white';
      case 'high':
        return 'bg-warning text-dark';
      case 'medium':
        return 'bg-info text-white';
      default:
        return 'bg-light text-dark';
    }
  }

  decisionStatusClass(status: ValidationDecisionStatus): string {
    switch (status) {
      case 'approved':
        return 'bg-success-transparent text-success';
      case 'rejected':
        return 'bg-danger-transparent text-danger';
      default:
        return 'bg-warning-transparent text-warning';
    }
  }

  decisionActionPriorityClass(priority: DecisionActionPriority): string {
    switch (priority) {
      case 'critical':
        return 'bg-danger-transparent text-danger';
      case 'high':
        return 'bg-warning-transparent text-warning';
      case 'medium':
        return 'bg-info-transparent text-info';
      default:
        return 'bg-light text-dark';
    }
  }

  decisionActionStatusClass(status: DecisionActionStatus): string {
    switch (status) {
      case 'done':
        return 'bg-success-transparent text-success';
      case 'blocked':
        return 'bg-danger-transparent text-danger';
      case 'in_progress':
        return 'bg-info-transparent text-info';
      default:
        return 'bg-light text-dark';
    }
  }

  decisionActionStatusLabel(status: DecisionActionStatus): string {
    switch (status) {
      case 'todo':
        return 'A lancer';
      case 'in_progress':
        return 'En cours';
      case 'blocked':
        return 'Bloquee';
      case 'done':
        return 'Terminee';
      default:
        return status;
    }
  }

  isDecisionActionOverdue(action: ProjectDecisionAction): boolean {
    return action.status !== 'done' && this.parseDate(action.dueDate) < Date.now();
  }

  alertSeverityClass(severity: ProjectAlertSeverity): string {
    switch (severity) {
      case 'critical':
        return 'bg-danger text-white';
      case 'high':
        return 'bg-warning text-dark';
      case 'medium':
        return 'bg-info text-white';
      default:
        return 'bg-light text-dark';
    }
  }

  alertTypeLabel(alert: ProjectAlert): string {
    switch (alert.type) {
      case 'delay':
        return 'Retard';
      case 'blockage':
        return 'Blocage';
      default:
        return 'Validation';
    }
  }

  trackById(index: number, item: { id: string }): string {
    return item.id || index.toString();
  }

  stageNameById(stages: ProjectStage[], stageId: string): string {
    return stages.find((stage) => stage.id === stageId)?.name ?? '-';
  }

  formatFileSize(size: number): string {
    const value = Number(size ?? 0);
    if (value <= 0) {
      return '0 B';
    }

    if (value < 1024) {
      return `${value} B`;
    }

    if (value < 1024 * 1024) {
      return `${(value / 1024).toFixed(1)} KB`;
    }

    return `${(value / (1024 * 1024)).toFixed(2)} MB`;
  }

  documentStatusClass(document: ProjectDocument): string {
    if (document.isArchived) {
      return 'bg-danger-transparent text-danger';
    }

    if (document.isLatest) {
      return 'bg-success-transparent text-success';
    }

    return 'bg-light text-dark';
  }

  documentStatusLabel(document: ProjectDocument): string {
    if (document.isArchived) {
      return 'Archive';
    }

    if (document.isLatest) {
      return 'Actif';
    }

    return 'Historique';
  }

  documentValidationClass(document: ProjectDocument): string {
    const status = document.validationStatus ?? 'draft';

    switch (status) {
      case 'approved':
        return 'bg-success-transparent text-success';
      case 'rejected':
        return 'bg-danger-transparent text-danger';
      case 'submitted':
        return 'bg-warning-transparent text-warning';
      default:
        return 'bg-light text-dark';
    }
  }

  documentValidationLabel(document: ProjectDocument): string {
    const status = document.validationStatus ?? 'draft';

    switch (status) {
      case 'approved':
        return 'Approuve';
      case 'rejected':
        return 'Rejete';
      case 'submitted':
        return 'Soumis';
      default:
        return 'Brouillon';
    }
  }

  private getCurrentProjectId(): string {
    return this.route.snapshot.paramMap.get('projectId') ?? '';
  }

  private async decide(
    decision: ProjectDecision,
    status: Exclude<ValidationDecisionStatus, 'pending'>,
    comment: string
  ): Promise<void> {
    const projectId = this.getCurrentProjectId();
    if (!projectId) {
      this.submitError = 'Projet introuvable.';
      return;
    }

    this.processingDecisionId = decision.id;
    this.submitError = '';

    try {
      await this.projectService.decideValidation(projectId, decision.id, status, comment);
    } catch (error) {
      this.submitError = error instanceof Error ? error.message : 'Decision de validation impossible.';
    } finally {
      this.processingDecisionId = '';
    }
  }

  private async decideDocumentValidation(
    document: ProjectDocument,
    status: Exclude<DocumentValidationStatus, 'draft' | 'submitted'>,
    comment: string
  ): Promise<void> {
    if (document.isArchived) {
      return;
    }

    const projectId = this.getCurrentProjectId();
    if (!projectId) {
      this.submitError = 'Projet introuvable.';
      return;
    }

    this.processingDocumentDecisionId = document.id;
    this.submitError = '';

    try {
      await this.projectService.decideProjectDocumentValidation(projectId, document.id, status, comment);
    } catch (error) {
      this.submitError = error instanceof Error ? error.message : 'Decision document impossible.';
    } finally {
      this.processingDocumentDecisionId = '';
    }
  }

  private async changeDecisionActionStatus(
    action: ProjectDecisionAction,
    status: DecisionActionStatus,
    note: string
  ): Promise<void> {
    const projectId = this.getCurrentProjectId();
    if (!projectId) {
      this.submitError = 'Projet introuvable.';
      return;
    }

    this.processingDecisionActionId = action.id;
    this.submitError = '';

    try {
      await this.projectService.updateDecisionActionStatus(projectId, action.id, status, note);
    } catch (error) {
      this.submitError = error instanceof Error ? error.message : 'Mise a jour action decisionnelle impossible.';
    } finally {
      this.processingDecisionActionId = '';
    }
  }

  private parseDate(dateText: string): number {
    const timestamp = Date.parse(dateText);
    return Number.isNaN(timestamp) ? Date.now() : timestamp;
  }

  private hasAnyRole(currentRole: UserRole | null, allowed: UserRole[]): boolean {
    return currentRole ? allowed.includes(currentRole) : false;
  }
}
