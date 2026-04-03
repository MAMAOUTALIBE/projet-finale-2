import { AsyncPipe, DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { DecisionActionPlanItem, EscalationSlaStatus } from '../../../core/models/project-decision-action.model';
import { ProjectTrackingService } from '../../../core/services/project-tracking.service';

type EscalationLevelFilter = 'all' | '1' | '2' | '3';
type EscalationAckFilter = 'all' | 'pending' | 'acknowledged';
type EscalationSlaFilter = EscalationSlaStatus | 'all';

@Component({
  selector: 'app-escalation-control',
  imports: [AsyncPipe, DatePipe, FormsModule, RouterModule],
  templateUrl: './escalation-control.html',
  styleUrl: './escalation-control.scss',
})
export class EscalationControl {
  private projectService = inject(ProjectTrackingService);

  readonly data$ = this.projectService.getEscalationPerformanceData(260);
  selectedLevel: EscalationLevelFilter = 'all';
  selectedAck: EscalationAckFilter = 'all';
  selectedSla: EscalationSlaFilter = 'all';
  processingActionId = '';
  submitError = '';

  filterEscalations(items: DecisionActionPlanItem[]): DecisionActionPlanItem[] {
    return items.filter((item) => {
      const levelOk = this.selectedLevel === 'all' || String(item.escalationLevel) === this.selectedLevel;
      const ackOk =
        this.selectedAck === 'all' ||
        (this.selectedAck === 'pending' && !item.escalationAcknowledgedAt) ||
        (this.selectedAck === 'acknowledged' && Boolean(item.escalationAcknowledgedAt));
      const slaOk = this.selectedSla === 'all' || (item.slaStatus ?? 'pending') === this.selectedSla;

      return levelOk && ackOk && slaOk;
    });
  }

  overdueDays(item: DecisionActionPlanItem): number {
    const dueAt = this.parseDate(item.dueDate);
    if (dueAt >= Date.now()) {
      return 0;
    }

    return Math.max(1, Math.floor((Date.now() - dueAt) / 86_400_000));
  }

  async acknowledgeEscalation(item: DecisionActionPlanItem): Promise<void> {
    if (item.escalationLevel <= 0 || item.escalationAcknowledgedAt) {
      return;
    }

    this.submitError = '';
    this.processingActionId = item.id;

    try {
      await this.projectService.acknowledgeDecisionActionEscalation(
        item.projectId,
        item.id,
        'Prise en charge accusee via centre escalades.'
      );
    } catch (error) {
      this.submitError = error instanceof Error ? error.message : 'Accuse de prise en charge impossible.';
    } finally {
      this.processingActionId = '';
    }
  }

  trackByItem(index: number, item: DecisionActionPlanItem): string {
    return item.id || index.toString();
  }

  escalationBadgeClass(level: number): string {
    if (level >= 3) {
      return 'bg-danger text-white';
    }

    if (level === 2) {
      return 'bg-warning text-dark';
    }

    return 'bg-info text-white';
  }

  slaBadgeClass(status: EscalationSlaStatus): string {
    switch (status) {
      case 'within_sla':
        return 'bg-success-transparent text-success';
      case 'at_risk':
        return 'bg-warning-transparent text-warning';
      case 'breached':
        return 'bg-danger-transparent text-danger';
      default:
        return 'bg-info-transparent text-info';
    }
  }

  slaLabel(status: EscalationSlaStatus): string {
    switch (status) {
      case 'within_sla':
        return 'Dans SLA';
      case 'at_risk':
        return 'A risque';
      case 'breached':
        return 'Hors SLA';
      default:
        return 'En attente';
    }
  }

  statusBadgeClass(status: string): string {
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

  statusLabel(status: string): string {
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

  private parseDate(dateText: string): number {
    const timestamp = Date.parse(dateText);
    return Number.isNaN(timestamp) ? Date.now() : timestamp;
  }
}
