import { AsyncPipe, DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import {
  DecisionActionPlanItem,
  DecisionActionPriority,
  DecisionActionStatus,
} from '../../../core/models/project-decision-action.model';
import { ProjectTrackingService } from '../../../core/services/project-tracking.service';

type DecisionActionStatusFilter = DecisionActionStatus | 'all';
type DecisionActionPriorityFilter = DecisionActionPriority | 'all';

type DecisionActionDelayFilter = 'all' | 'overdue' | 'on_track';

@Component({
  selector: 'app-decision-actions',
  imports: [AsyncPipe, DatePipe, FormsModule, RouterModule],
  templateUrl: './decision-actions.html',
  styleUrl: './decision-actions.scss',
})
export class DecisionActions {
  private projectService = inject(ProjectTrackingService);

  readonly data$ = this.projectService.getDecisionActionPlanData(220);
  selectedStatus: DecisionActionStatusFilter = 'all';
  selectedPriority: DecisionActionPriorityFilter = 'all';
  selectedDelay: DecisionActionDelayFilter = 'all';

  filterItems(items: DecisionActionPlanItem[]): DecisionActionPlanItem[] {
    return items.filter((item) => {
      const statusOk = this.selectedStatus === 'all' || item.status === this.selectedStatus;
      const priorityOk = this.selectedPriority === 'all' || item.priority === this.selectedPriority;
      const delayOk =
        this.selectedDelay === 'all' ||
        (this.selectedDelay === 'overdue' && item.overdue) ||
        (this.selectedDelay === 'on_track' && !item.overdue);

      return statusOk && priorityOk && delayOk;
    });
  }

  trackByItem(index: number, item: DecisionActionPlanItem): string {
    return item.id || index.toString();
  }

  priorityBadgeClass(priority: DecisionActionPriority): string {
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

  statusBadgeClass(status: DecisionActionStatus): string {
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

  statusLabel(status: DecisionActionStatus): string {
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
}
