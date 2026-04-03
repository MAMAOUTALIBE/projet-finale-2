import { AsyncPipe, DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { DecisionPriority, DecisionSupportAction } from '../../../core/models/project-decision-support.model';
import { ProjectTrackingService } from '../../../core/services/project-tracking.service';

@Component({
  selector: 'app-decision-support',
  imports: [AsyncPipe, DatePipe, RouterModule],
  templateUrl: './decision-support.html',
  styleUrl: './decision-support.scss',
})
export class DecisionSupport {
  private projectService = inject(ProjectTrackingService);

  readonly data$ = this.projectService.getDecisionSupportData(15);

  trackByAction(index: number, action: DecisionSupportAction): string {
    return action.id || index.toString();
  }

  priorityBadgeClass(priority: DecisionPriority): string {
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
}
