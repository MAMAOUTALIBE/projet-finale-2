import { AsyncPipe, DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { map, shareReplay, tap } from 'rxjs/operators';
import {
  PortfolioBlockageCauseRow,
  PortfolioBlockageProjectRow,
  PortfolioBlockageSeverityRow,
  ProjectReportSnapshot,
  ReportDispatchRun,
  ReportManualRun,
  ProjectReportRow,
} from '../../../core/models/project-report.model';
import { ProjectTrackingService } from '../../../core/services/project-tracking.service';

interface ReportReliabilitySummary {
  windowSize: number;
  dailyRuns: number;
  successRate: number;
  completedCount: number;
  failedCount: number;
  runningCount: number;
  avgDurationMinutes: number;
  lastDailyRunStatus: ReportDispatchRun['status'] | 'none';
  lastDailyRunAt: number;
}

interface ReportResilienceSummary {
  score: number;
  incidents7d: number;
  consecutiveIncidents: number;
  escalated: boolean;
}

@Component({
  selector: 'app-project-reports',
  imports: [AsyncPipe, DatePipe, RouterModule],
  templateUrl: './project-reports.html',
  styleUrl: './project-reports.scss',
})
export class ProjectReports {
  private projectService = inject(ProjectTrackingService);

  private latestRows: ProjectReportRow[] = [];
  manualRunSubmitting = false;
  manualRunMessage = '';
  manualRunError = '';

  readonly reportRows$ = this.projectService.getPortfolioReportRows().pipe(
    tap((rows) => {
      this.latestRows = rows;
    })
  );

  readonly totals$ = this.reportRows$.pipe(
    map((rows) => ({
      projects: rows.length,
      delayedActivities: rows.reduce((sum, row) => sum + row.delayedActivities, 0),
      openBlockages: rows.reduce((sum, row) => sum + row.openBlockages, 0),
      pendingValidations: rows.reduce((sum, row) => sum + row.pendingValidations, 0),
      openDecisionActions: rows.reduce((sum, row) => sum + row.openDecisionActions, 0),
      overdueDecisionActions: rows.reduce((sum, row) => sum + row.overdueDecisionActions, 0),
      escalatedDecisionActions: rows.reduce((sum, row) => sum + row.escalatedDecisionActions, 0),
      breachedEscalations: rows.reduce((sum, row) => sum + row.breachedEscalations, 0),
    }))
  );
  readonly blockageInsights$ = this.projectService
    .getPortfolioBlockageInsights(8, 8)
    .pipe(shareReplay({ bufferSize: 1, refCount: true }));
  readonly snapshotHistory$ = this.projectService
    .getReportSnapshotHistory(12)
    .pipe(shareReplay({ bufferSize: 1, refCount: true }));
  readonly runHistoryRaw$ = this.projectService
    .getReportDispatchRunHistory(40)
    .pipe(shareReplay({ bufferSize: 1, refCount: true }));
  readonly runHistory$ = this.runHistoryRaw$.pipe(
    map((runs) => runs.slice(0, 12)),
    shareReplay({ bufferSize: 1, refCount: true })
  );
  readonly dailyReliability$ = this.runHistoryRaw$.pipe(
    map((runs) => {
      const dailyRuns = runs
        .filter((run) => run.type === 'daily_portfolio_report')
        .sort((a, b) => b.startedAt - a.startedAt)
        .slice(0, 7);
      const completedCount = dailyRuns.filter((run) => run.status === 'completed').length;
      const failedCount = dailyRuns.filter((run) => run.status === 'failed').length;
      const runningCount = dailyRuns.filter((run) => run.status === 'running').length;
      const successRate = dailyRuns.length ? Math.round((completedCount / dailyRuns.length) * 100) : 0;
      const durations = dailyRuns.map((run) => this.runDurationMinutes(run)).filter((duration) => duration > 0);
      const avgDurationMinutes = durations.length
        ? Math.round(durations.reduce((sum, duration) => sum + duration, 0) / durations.length)
        : 0;

      return {
        windowSize: 7,
        dailyRuns: dailyRuns.length,
        successRate,
        completedCount,
        failedCount,
        runningCount,
        avgDurationMinutes,
        lastDailyRunStatus: dailyRuns[0]?.status ?? 'none',
        lastDailyRunAt: Number(dailyRuns[0]?.startedAt ?? 0),
      } as ReportReliabilitySummary;
    }),
    shareReplay({ bufferSize: 1, refCount: true })
  );
  readonly dailyRunIncidents$ = this.runHistoryRaw$.pipe(
    map((runs) =>
      runs
        .filter((run) => run.type === 'daily_portfolio_report' && run.status !== 'completed')
        .sort((a, b) => b.startedAt - a.startedAt)
        .slice(0, 8)
    ),
    shareReplay({ bufferSize: 1, refCount: true })
  );
  readonly healthCheckHistory$ = this.runHistoryRaw$.pipe(
    map((runs) =>
      runs
        .filter((run) => run.type === 'daily_portfolio_report_health_check')
        .sort((a, b) => b.startedAt - a.startedAt)
        .slice(0, 10)
    ),
    shareReplay({ bufferSize: 1, refCount: true })
  );
  readonly resilienceSummary$ = this.healthCheckHistory$.pipe(
    map((checks) => {
      const latest = checks[0];
      return {
        score: Number(latest?.resilienceScore ?? 100),
        incidents7d: Number(latest?.resilienceIncidents7d ?? 0),
        consecutiveIncidents: Number(latest?.resilienceConsecutiveIncidents ?? 0),
        escalated: Boolean(latest?.resilienceEscalated ?? false),
      } as ReportResilienceSummary;
    }),
    shareReplay({ bufferSize: 1, refCount: true })
  );
  readonly manualRunHistory$ = this.projectService
    .getManualReportRunHistory(12)
    .pipe(shareReplay({ bufferSize: 1, refCount: true }));
  readonly activeManualRun$ = this.manualRunHistory$.pipe(
    map((runs) => runs.find((run) => run.status === 'requested' || run.status === 'running') ?? null),
    shareReplay({ bufferSize: 1, refCount: true })
  );
  readonly hasActiveManualRun$ = this.activeManualRun$.pipe(
    map((run) => Boolean(run)),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  async requestManualDigest(): Promise<void> {
    if (this.manualRunSubmitting) {
      return;
    }

    this.manualRunSubmitting = true;
    this.manualRunMessage = '';
    this.manualRunError = '';

    try {
      const runId = await this.projectService.requestManualPortfolioReport();
      this.manualRunMessage = `Relance manuelle demandee (run ${runId}).`;
    } catch (error) {
      this.manualRunError = error instanceof Error ? error.message : 'Relance manuelle impossible.';
    } finally {
      this.manualRunSubmitting = false;
    }
  }

  async exportCsv(): Promise<void> {
    const rows = this.latestRows.length
      ? this.latestRows
      : await firstValueFrom(this.projectService.getPortfolioReportRows());

    if (!rows.length) {
      return;
    }

    const headers = [
      'Code',
      'Projet',
      'Statut',
      'Progression',
      'Etapes',
      'Activites',
      'Activites_en_retard',
      'Blocages_ouverts',
      'Validations_en_attente',
      'Actions_decisionnelles_ouvertes',
      'Actions_decisionnelles_en_retard',
      'Actions_escaladees',
      'Escalades_hors_SLA',
      'Derniere_mise_a_jour',
    ];

    const lines = rows.map((row) => [
      row.code,
      row.name,
      row.status,
      `${row.progress}%`,
      row.stages.toString(),
      row.activities.toString(),
      row.delayedActivities.toString(),
      row.openBlockages.toString(),
      row.pendingValidations.toString(),
      row.openDecisionActions.toString(),
      row.overdueDecisionActions.toString(),
      row.escalatedDecisionActions.toString(),
      row.breachedEscalations.toString(),
      new Date(row.updatedAt).toISOString(),
    ]);

    const csvContent = [headers, ...lines]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `reporting-projets-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  trackByProjectId(index: number, row: ProjectReportRow): string {
    return row.projectId || index.toString();
  }

  trackByCause(index: number, row: PortfolioBlockageCauseRow): string {
    return row.cause || index.toString();
  }

  trackBySeverity(index: number, row: PortfolioBlockageSeverityRow): string {
    return row.severity || index.toString();
  }

  trackByPressureProject(index: number, row: PortfolioBlockageProjectRow): string {
    return row.projectId || index.toString();
  }

  trackBySnapshot(index: number, row: ProjectReportSnapshot): string {
    return row.id || index.toString();
  }

  trackByRun(index: number, row: ReportDispatchRun): string {
    return row.id || index.toString();
  }

  trackByManualRun(index: number, row: ReportManualRun): string {
    return row.id || index.toString();
  }

  severityBadgeClass(severity: string): string {
    switch (severity) {
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

  runStatusBadgeClass(status: ReportDispatchRun['status']): string {
    switch (status) {
      case 'completed':
        return 'bg-success-transparent text-success';
      case 'failed':
        return 'bg-danger-transparent text-danger';
      default:
        return 'bg-warning-transparent text-warning';
    }
  }

  runStatusLabel(status: ReportDispatchRun['status']): string {
    switch (status) {
      case 'completed':
        return 'Termine';
      case 'failed':
        return 'En echec';
      default:
        return 'En cours';
    }
  }

  runTypeLabel(type: string): string {
    if (type === 'daily_portfolio_report') {
      return 'Digest quotidien';
    }
    if (type === 'manual_portfolio_report') {
      return 'Digest manuel';
    }
    if (type === 'daily_portfolio_report_health_check') {
      return 'Controle sante digest';
    }
    if (type === 'daily_portfolio_report_health_followup') {
      return 'Suivi auto-remediation digest';
    }
    return type || '-';
  }

  runDurationMinutes(run: ReportDispatchRun): number {
    const endAt = Number(run.completedAt ?? run.failedAt ?? 0);
    if (!run.startedAt || !endAt || endAt <= run.startedAt) {
      return 0;
    }

    return Math.max(1, Math.round((endAt - run.startedAt) / 60_000));
  }

  reliabilityStatusBadgeClass(summary: ReportReliabilitySummary): string {
    if (summary.failedCount > 0) {
      return 'bg-danger-transparent text-danger';
    }
    if (summary.successRate >= 90 && summary.runningCount === 0) {
      return 'bg-success-transparent text-success';
    }
    return 'bg-warning-transparent text-warning';
  }

  reliabilityStatusLabel(summary: ReportReliabilitySummary): string {
    if (summary.failedCount > 0) {
      return 'Alerte';
    }
    if (summary.successRate >= 90 && summary.runningCount === 0) {
      return 'Stable';
    }
    return 'Sous surveillance';
  }

  resilienceStatusBadgeClass(summary: ReportResilienceSummary): string {
    if (summary.escalated || summary.score < 70) {
      return 'bg-danger-transparent text-danger';
    }
    if (summary.score >= 90 && summary.consecutiveIncidents === 0) {
      return 'bg-success-transparent text-success';
    }
    return 'bg-warning-transparent text-warning';
  }

  resilienceStatusLabel(summary: ReportResilienceSummary): string {
    if (summary.escalated || summary.score < 70) {
      return 'Critique';
    }
    if (summary.score >= 90 && summary.consecutiveIncidents === 0) {
      return 'Stable';
    }
    return 'Sous tension';
  }

  manualRunStatusBadgeClass(status: ReportManualRun['status']): string {
    switch (status) {
      case 'completed':
        return 'bg-success-transparent text-success';
      case 'failed':
        return 'bg-danger-transparent text-danger';
      case 'running':
        return 'bg-warning-transparent text-warning';
      default:
        return 'bg-info-transparent text-info';
    }
  }

  manualRunStatusLabel(status: ReportManualRun['status']): string {
    switch (status) {
      case 'completed':
        return 'Terminee';
      case 'failed':
        return 'En echec';
      case 'running':
        return 'En cours';
      default:
        return 'En attente';
    }
  }

  manualRunDurationMinutes(run: ReportManualRun): number {
    const endAt = Number(run.completedAt ?? run.failedAt ?? 0);
    const startAt = Number(run.startedAt ?? 0);
    if (!startAt || !endAt || endAt <= startAt) {
      return 0;
    }

    return Math.max(1, Math.round((endAt - startAt) / 60_000));
  }

  manualRunSourceLabel(run: ReportManualRun): string {
    if (run.source === 'auto_health_recovery') {
      return 'Auto-remediation';
    }
    if (run.source === 'ui') {
      return 'Manuelle (UI)';
    }
    return run.source || '-';
  }

  healthCheckMonitoredStatusBadgeClass(status?: string): string {
    switch (status) {
      case 'completed':
        return 'bg-success-transparent text-success';
      case 'failed':
      case 'missing':
        return 'bg-danger-transparent text-danger';
      case 'running':
        return 'bg-warning-transparent text-warning';
      default:
        return 'bg-light text-dark';
    }
  }

  healthCheckMonitoredStatusLabel(status?: string): string {
    switch (status) {
      case 'completed':
        return 'Digest OK';
      case 'failed':
        return 'Digest en echec';
      case 'missing':
        return 'Digest absent';
      case 'running':
        return 'Digest en cours';
      default:
        return status || '-';
    }
  }

  autoRecoveryOutcomeBadgeClass(outcome?: string): string {
    switch (outcome) {
      case 'completed':
      case 'not_required':
        return 'bg-success-transparent text-success';
      case 'pending':
      case 'skipped_active_manual':
        return 'bg-warning-transparent text-warning';
      case 'failed':
      case 'missing_request':
      case 'health_run_missing':
        return 'bg-danger-transparent text-danger';
      case 'not_triggered':
      case 'already_locked':
        return 'bg-light text-dark';
      default:
        return 'bg-light text-dark';
    }
  }

  autoRecoveryOutcomeLabel(outcome?: string): string {
    switch (outcome) {
      case 'completed':
        return 'Reussie';
      case 'pending':
        return 'En cours';
      case 'failed':
        return 'En echec';
      case 'missing_request':
        return 'Demande introuvable';
      case 'not_required':
        return 'Non requise';
      case 'skipped_active_manual':
        return 'Reportee (run actif)';
      case 'not_triggered':
        return 'Non declenchee';
      case 'already_locked':
        return 'Deja verrouillee';
      case 'health_run_missing':
        return 'Controle initial absent';
      default:
        return outcome || '-';
    }
  }

  autoRecoverySlaBadgeClass(status?: string): string {
    switch (status) {
      case 'within_sla':
        return 'bg-success-transparent text-success';
      case 'pending':
        return 'bg-warning-transparent text-warning';
      case 'breached':
        return 'bg-danger-transparent text-danger';
      default:
        return 'bg-light text-dark';
    }
  }

  autoRecoverySlaLabel(status?: string): string {
    switch (status) {
      case 'within_sla':
        return 'Dans SLA';
      case 'pending':
        return 'En attente';
      case 'breached':
        return 'Hors SLA';
      default:
        return 'N/A';
    }
  }
}
