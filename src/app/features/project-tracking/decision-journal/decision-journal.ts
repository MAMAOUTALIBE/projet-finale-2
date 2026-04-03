import { AsyncPipe, DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import {
  DecisionJournalEntry,
  DecisionJournalEntryType,
  DecisionJournalStatus,
} from '../../../core/models/project-decision-journal.model';
import { ProjectTrackingService } from '../../../core/services/project-tracking.service';

type JournalStatusFilter = DecisionJournalStatus | 'all';
type JournalTypeFilter = DecisionJournalEntryType | 'all';

@Component({
  selector: 'app-decision-journal',
  imports: [AsyncPipe, DatePipe, FormsModule, RouterModule],
  templateUrl: './decision-journal.html',
  styleUrl: './decision-journal.scss',
})
export class DecisionJournal {
  private projectService = inject(ProjectTrackingService);

  readonly journal$ = this.projectService.getDecisionJournalData(150);
  selectedStatus: JournalStatusFilter = 'all';
  selectedType: JournalTypeFilter = 'all';

  filterEntries(entries: DecisionJournalEntry[]): DecisionJournalEntry[] {
    return entries.filter((entry) => {
      const statusOk = this.selectedStatus === 'all' || entry.status === this.selectedStatus;
      const typeOk = this.selectedType === 'all' || entry.type === this.selectedType;
      return statusOk && typeOk;
    });
  }

  trackByEntry(index: number, entry: DecisionJournalEntry): string {
    return entry.id || index.toString();
  }

  statusBadgeClass(status: DecisionJournalStatus): string {
    switch (status) {
      case 'approved':
        return 'bg-success-transparent text-success';
      case 'rejected':
        return 'bg-danger-transparent text-danger';
      case 'pending':
        return 'bg-warning-transparent text-warning';
      default:
        return 'bg-light text-dark';
    }
  }

  typeLabel(type: DecisionJournalEntryType): string {
    switch (type) {
      case 'validation_request':
        return 'Validation';
      case 'document_validation':
        return 'Doc';
      default:
        return 'Action';
    }
  }
}
