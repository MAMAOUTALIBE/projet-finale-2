import { Routes } from '@angular/router';
import { dashboardRoutingModule } from '../../components/dashboards/dashboard.routes';
import { chartsRoutingModule } from '../../components/charts/charts.routes';
import { apexchartsRoutingModule } from '../../components/charts/apexcharts/apex.routes';
import { utilitiesRoutingModule } from '../../components/utilities/utilities.routes';
import { appsRoutingModule } from '../../components/apps/apps.routes';
import { formsRoutingModule } from '../../components/forms/forms.routes';
import { mapsRoutingModule } from '../../components/maps/maps.routes';
import { iconsRoutingModule } from '../../components/icons/icons.routes';
import { uielementsRoutingModule } from '../../components/elements/uielements.routes';
import { advanceduiRoutingModule } from '../../components/advanced-ui/advancedui.routes';
import { mailRoutingModule } from '../../components/pages/mail/email.routes';
import { pagesRoutingModule } from '../../components/pages/pages.routes';
import { tablesRoutingModule } from '../../components/tables/tables.routes';
import { widgetsRoutingModule } from '../../components/widgets/widgets.routes';
import { projectTrackingRoutingModule } from '../../features/project-tracking/project-tracking.routes';

export const content: Routes = [

  {
    path: '', children: [
      ...dashboardRoutingModule,
      ...uielementsRoutingModule,
      ...advanceduiRoutingModule,
      ...pagesRoutingModule,
      ...mailRoutingModule,
      ...chartsRoutingModule,
      ...apexchartsRoutingModule,
      ...utilitiesRoutingModule,
      ...appsRoutingModule,
      ...formsRoutingModule,
      ...mapsRoutingModule,
      ...iconsRoutingModule,
      ...tablesRoutingModule,
      ...widgetsRoutingModule,
      ...projectTrackingRoutingModule
    ]
  }
];

