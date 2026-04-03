import { Injectable, OnDestroy, inject } from '@angular/core';
import { Subject, BehaviorSubject, fromEvent } from 'rxjs';
import { takeUntil, debounceTime } from 'rxjs/operators';
import { Router } from '@angular/router';

// Menu
export interface Menu {
  headTitle?: string;
  headTitle2?: string;
  path?: string;
  title?: string;
  icon?: string;
  type?: string;
  badgeValue?: string;
  badgeClass?: string;
  badgeText?: string;
  active?: boolean;
  selected?: boolean;
  bookmark?: boolean;
  children?: Menu[];
  children2?: Menu[];
  Menusub?: boolean;
  target?: boolean;
  menutype?: string;
  dirchange?: boolean;
  nochild?: any;
}

@Injectable({
  providedIn: 'root',
})
export class NavService implements OnDestroy {
  private router = inject(Router);

  private unsubscriber: Subject<any> = new Subject();
  public screenWidth: BehaviorSubject<number> = new BehaviorSubject(
    window.innerWidth
  );

  // Search Box
  public search = false;

  // Language
  public language = false;

  // Mega Menu
  public megaMenu = false;
  public levelMenu = false;
  public megaMenuColapse: boolean = window.innerWidth < 1199 ? true : false;

  // Collapse Sidebar
  public collapseSidebar: boolean = window.innerWidth < 991 ? true : false;

  // For Horizontal Layout Mobile
  public horizontal: boolean = window.innerWidth < 991 ? false : true;

  // Full screen
  public fullScreen = false;
  active: any;

  constructor() {
    this.setScreenWidth(window.innerWidth);
    fromEvent(window, 'resize')
      .pipe(debounceTime(1000), takeUntil(this.unsubscriber))
      .subscribe((evt: any) => {
        this.setScreenWidth(evt.target.innerWidth);
        if (evt.target.innerWidth < 991) {
          this.collapseSidebar = true;
          this.megaMenu = false;
          this.levelMenu = false;
        }
        if (evt.target.innerWidth < 1199) {
          this.megaMenuColapse = true;
        }
      });

    if (window.innerWidth < 991) {
      // Detect Route change sidebar close
      this.router.events.subscribe(() => {
        this.collapseSidebar = true;
        this.megaMenu = false;
        this.levelMenu = false;
      });
    }
  }

  ngOnDestroy() {
    this.unsubscriber.next;
    this.unsubscriber.complete();
  }

  private setScreenWidth(width: number): void {
    this.screenWidth.next(width);
  }

  MENUITEMS: Menu[] = [
    { headTitle: 'MAIN' },
    {
      title: 'Dashboards',
      icon: `
                                    <svg xmlns="http://www.w3.org/2000/svg"  class="side-menu__icon" width="24" height="24" viewBox="0 0 24 24"><path d="M3 13h1v7c0 1.103.897 2 2 2h12c1.103 0 2-.897 2-2v-7h1a1 1 0 0 0 .707-1.707l-9-9a.999.999 0 0 0-1.414 0l-9 9A1 1 0 0 0 3 13zm7 7v-5h4v5h-4zm2-15.586 6 6V15l.001 5H16v-5c0-1.103-.897-2-2-2h-4c-1.103 0-2 .897-2 2v5H6v-9.586l6-6z"/></svg>

      `,
      type: 'sub',
      active: false,
      dirchange: false,
      children: [
        { path: '/dashboards/dashboard-1', title: 'Dashboard-1', type: 'link', dirchange: false },
        { path: '/dashboards/dashboard-2', title: 'Dashboard-2', type: 'link', dirchange: false },
        { path: '/dashboards/dashboard-3', title: 'Dashboard-3', type: 'link', dirchange: false },
      ],
    },
    {
      title: 'Apps',
      type: 'sub',
      icon: `
                                    <svg xmlns="http://www.w3.org/2000/svg"  class="side-menu__icon" width="24" height="24" viewBox="0 0 24 24"><path d="M10 3H4a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1zM9 9H5V5h4v4zm11-6h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1zm-1 6h-4V5h4v4zm-9 4H4a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-6a1 1 0 0 0-1-1zm-1 6H5v-4h4v4zm8-6c-2.206 0-4 1.794-4 4s1.794 4 4 4 4-1.794 4-4-1.794-4-4-4zm0 6c-1.103 0-2-.897-2-2s.897-2 2-2 2 .897 2 2-.897 2-2 2z"/></svg>

      `,
      active: false,
      dirchange: false,
      children: [
        { path: '/apps/fullcalender', title: 'Full Calender', type: 'link', dirchange: false },
        { path: '/apps/contacts', title: 'Contacts', type: 'link', dirchange: false },
        { path: '/apps/gallery', title: 'Gallery', type: 'link', dirchange: false },
        { path: '/apps/sweetalerts', title: 'Sweet Alerts', type: 'link', dirchange: false },
        { path: '/apps/notification', title: 'Notification', type: 'link', dirchange: false },
        { path: '/apps/widget-notification', title: 'Widget Notification', type: 'link', dirchange: false },
        { path: '/apps/treeview', title: 'Treeview', type: 'link', dirchange: false },
        { path: '/apps/file-manager', title: 'File Manager', type: 'link', dirchange: false },
        { path: '/apps/file-manager1', title: 'File Manager 1', type: 'link', dirchange: false },
        { path: '/apps/file-details', title: 'File Details', type: 'link', dirchange: false },
      ],
    },
    {
      title: 'Elements',
      type: 'sub',
      icon: `
                                    <svg xmlns="http://www.w3.org/2000/svg"  class="side-menu__icon" width="24" height="24" viewBox="0 0 24 24"><path d="M20 17V7c0-2.168-3.663-4-8-4S4 4.832 4 7v10c0 2.168 3.663 4 8 4s8-1.832 8-4zM12 5c3.691 0 5.931 1.507 6 1.994C17.931 7.493 15.691 9 12 9S6.069 7.493 6 7.006C6.069 6.507 8.309 5 12 5zM6 9.607C7.479 10.454 9.637 11 12 11s4.521-.546 6-1.393v2.387c-.069.499-2.309 2.006-6 2.006s-5.931-1.507-6-2V9.607zM6 17v-2.393C7.479 15.454 9.637 16 12 16s4.521-.546 6-1.393v2.387c-.069.499-2.309 2.006-6 2.006s-5.931-1.507-6-2z"/></svg>

      `,
      active: false,
      dirchange: false,
      children: [
        { path: '/ui-elements/alerts', title: 'Alerts', type: 'link', dirchange: false },
        { path: '/ui-elements/breadcrumb', title: 'Breadcrumbs', type: 'link', dirchange: false },
        { path: '/ui-elements/button-group', title: 'Button Group', type: 'link', dirchange: false },
        { path: '/ui-elements/buttons', title: 'Buttons', type: 'link', dirchange: false },
        { path: '/ui-elements/badge', title: 'Badge', type: 'link', dirchange: false },
        { path: '/ui-elements/cards', title: 'Cards', type: 'link', dirchange: false },
        { path: '/ui-elements/dropdowns', title: 'Dropdowns', type: 'link', dirchange: false },
        { path: '/ui-elements/images&figures', title: 'Images & Figures', type: 'link', dirchange: false },
        { path: '/ui-elements/list-group', title: 'List Group', type: 'link', dirchange: false },
        { path: '/ui-elements/nav-tabs', title: 'Nav & Tabs', type: 'link', dirchange: false },
        { path: '/ui-elements/media-object', title: 'Media Object', type: 'link', dirchange: false },
        { path: '/ui-elements/pagination', title: 'Pagination', type: 'link', dirchange: false },
        { path: '/ui-elements/popovers', title: 'Popovers', type: 'link', dirchange: false },
        { path: '/ui-elements/progress', title: 'Progress', type: 'link', dirchange: false },
        { path: '/ui-elements/spinners', title: 'Spinners', type: 'link', dirchange: false },
        { path: '/ui-elements/tags', title: 'Tags', type: 'link', dirchange: false },
        { path: '/ui-elements/toasts', title: 'Toasts', type: 'link', dirchange: false },
        { path: '/ui-elements/tooltips', title: 'Tooltips', type: 'link', dirchange: false },
        { path: '/ui-elements/typography', title: 'Typography', type: 'link', dirchange: false },
      ],
    },
    {
      title: 'Advanced Ui',
      type: 'sub',
      icon: `
                                    <svg xmlns="http://www.w3.org/2000/svg"  class="side-menu__icon" width="24" height="24" viewBox="0 0 24 24"><path d="M11.001 10a1 1 0 0 0 1 1h6a1 1 0 0 0 0-2h-6a1 1 0 0 0-1 1zm0 4a1 1 0 0 0 1 1h8a1 1 0 0 0 0-2h-8a1 1 0 0 0-1 1zm0 4a1 1 0 0 0 1 1h4a1 1 0 0 0 0-2h-4a1 1 0 0 0-1 1zm-2-4a1 1 0 0 0 0-2H4a1 1 0 0 0 0 2h5zm0 4a1 1 0 0 0 0-2H6a1 1 0 0 0 0 2h3zm0-8a1 1 0 0 0 0-2H8a1 1 0 0 0 0 2h1zm12.707-7.293a.999.999 0 0 0-1.414 0L18.586 4H5c-1.654 0-3 1.346-3 3v10c0 1.654 1.346 3 3 3h14a1 1 0 0 0 .707-.293l2-2A1 1 0 0 0 22 17V3.414a.999.999 0 0 0-.292-.707zM20 16.586 18.586 18H5c-.551 0-1-.449-1-1V7c0-.551.449-1 1-1h13.586L20 4.586v12z"/></svg>

      `,
      active: false,
      dirchange: false,
      children: [
        { path: '/advanced-ui/accordion-collapse', title: 'Accordion & Collapse', type: 'link', dirchange: false },
        { path: '/advanced-ui/carousel', title: 'Carousel', type: 'link', dirchange: false },
        { path: '/advanced-ui/draggable-cards', title: 'Draggable Cards', type: 'link', dirchange: false },
        { path: '/advanced-ui/modals-closes', title: 'Modals & Closes', type: 'link', dirchange: false },
        { path: '/advanced-ui/placeholders', title: 'Placeholders', type: 'link', dirchange: false },
        { path: '/advanced-ui/navbar', title: 'Navbar', type: 'link', dirchange: false },
        { path: '/advanced-ui/offcanvas', title: 'Offcanvas', type: 'link', dirchange: false },
        { path: '/advanced-ui/rating', title: 'Ratings', type: 'link', dirchange: false },
        { path: '/advanced-ui/scrollspy', title: 'Scrollspy', type: 'link', dirchange: false },
        { path: '/advanced-ui/swiper-element', title: 'Swiper Element', type: 'link', dirchange: false },
        { path: '/advanced-ui/timeline', title: 'Timeline', type: 'link', dirchange: false },
        { path: '/advanced-ui/search', title: 'Search', type: 'link', dirchange: false },
        { path: '/advanced-ui/userlist', title: 'Userlist', type: 'link', dirchange: false },
        { path: '/advanced-ui/blog', title: 'Blog', type: 'link', dirchange: false },
        { path: '/advanced-ui/blog-details', title: 'Blog Details', type: 'link', dirchange: false },
        { path: '/advanced-ui/edit-post', title: 'Edit Post', type: 'link', dirchange: false },
      ],
    },
    { headTitle: 'PAGES' },
    {
      title: 'Pages',
      type: 'sub',
      icon: `
                                    <svg xmlns="http://www.w3.org/2000/svg"  class="side-menu__icon" width="24" height="24" viewBox="0 0 24 24"><path d="M16 2H8a3 3 0 0 0-3 3v14a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3V5a3 3 0 0 0-3-3zm1 17a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V7h10v12zm0-14H7V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v0z"/></svg>

      `,
      active: false,
      dirchange: false,
      children: [
        {
          title: 'Ecommerce',
          type: 'sub',
          dirchange: false,
          children: [
            { path: '/pages/ecommerce/cart', title: 'Cart', type: 'link', dirchange: false },
            { path: '/pages/ecommerce/checkout', title: 'Checkout', type: 'link', dirchange: false },
            { path: '/pages/ecommerce/product-details', title: 'Product Details', type: 'link', dirchange: false },
            { path: '/pages/ecommerce/shop', title: 'Shop', type: 'link', dirchange: false },
            { path: '/pages/ecommerce/wishlist', title: 'Wishlist', type: 'link', dirchange: false },
          ],
        },
        {
          title: 'Mail',
          type: 'sub',
          dirchange: false,
          children: [
            { path: '/pages/email/chat', title: 'Chat', type: 'link', dirchange: false },
            { path: '/pages/email/mail', title: 'Mail', type: 'link', dirchange: false },
            { path: '/pages/email/mail-compose', title: 'Mail Compose', type: 'link', dirchange: false },
            { path: '/pages/email/mail-settings', title: 'Mail Settings', type: 'link', dirchange: false },
            { path: '/pages/email/read-mail', title: 'Read Mail', type: 'link', dirchange: false },
          ],
        },
        { path: '/pages/about-us', title: 'About us', type: 'link', dirchange: false },
        { path: '/pages/profile', title: 'Profile', type: 'link', dirchange: false },
        { path: '/pages/notifications-list', title: 'Notifications List', type: 'link', dirchange: false },
        { path: '/pages/settings', title: 'Settings', type: 'link', dirchange: false },
        { path: '/pages/invoice', title: 'Invoice', type: 'link', dirchange: false },
        { path: '/pages/pricing', title: 'Pricing', type: 'link', dirchange: false },
        { path: '/pages/todo-task', title: 'Todo Task', type: 'link', dirchange: false },
        { path: '/pages/faqs', title: 'Faqs', type: 'link', dirchange: false },
        { path: '/pages/emptypage', title: 'Empty Page', type: 'link', dirchange: false },
      ],
    },
    { headTitle: 'CHARTS & FORMS' },
    {
      title: 'Charts',
      type: 'sub',
      icon: `
                                    <svg xmlns="http://www.w3.org/2000/svg"  class="side-menu__icon" width="24" height="24" viewBox="0 0 24 24"><path d="M11 4a1 1 0 0 0-1 1v14a1 1 0 0 0 2 0V5a1 1 0 0 0-1-1zm-6 7a1 1 0 0 0-1 1v7a1 1 0 0 0 2 0v-7a1 1 0 0 0-1-1zm12-4a1 1 0 0 0-1 1v11a1 1 0 0 0 2 0V8a1 1 0 0 0-1-1zm6-3a1 1 0 0 0-1 1v14a1 1 0 0 0 2 0V5a1 1 0 0 0-1-1z"/></svg>

      `,
      active: false,
      dirchange: false,
      children: [
        { path: '/charts/chartjs', title: 'Chart JS', type: 'link', dirchange: false },
        { path: '/charts/echart', title: 'ECharts', type: 'link', dirchange: false },
        {
          title: 'Apex Charts',
          type: 'sub',
          dirchange: false,
          children: [
            { path: '/charts/apex-charts/line-charts', title: 'Line Charts', type: 'link', dirchange: false },
            { path: '/charts/apex-charts/area-charts', title: 'Area Charts', type: 'link', dirchange: false },
            { path: '/charts/apex-charts/bar-charts', title: 'Bar Charts', type: 'link', dirchange: false },
            { path: '/charts/apex-charts/column-charts', title: 'Column Charts', type: 'link', dirchange: false },
            { path: '/charts/apex-charts/mixedcharts', title: 'Mixed Charts', type: 'link', dirchange: false },
            { path: '/charts/apex-charts/rangeareacharts', title: 'Range Area Charts', type: 'link', dirchange: false },
            { path: '/charts/apex-charts/timelinecharts', title: 'Timeline Charts', type: 'link', dirchange: false },
            { path: '/charts/apex-charts/candlestickcharts', title: 'Candlestick Charts', type: 'link', dirchange: false },
            { path: '/charts/apex-charts/boxplotcharts', title: 'Box Plot Charts', type: 'link', dirchange: false },
            { path: '/charts/apex-charts/bubblecharts', title: 'Bubble Charts', type: 'link', dirchange: false },
            { path: '/charts/apex-charts/scattercharts', title: 'Scatter Charts', type: 'link', dirchange: false },
            { path: '/charts/apex-charts/heatmapcharts', title: 'Heatmap Charts', type: 'link', dirchange: false },
            { path: '/charts/apex-charts/treemapcharts', title: 'Treemap Charts', type: 'link', dirchange: false },
            { path: '/charts/apex-charts/piecharts', title: 'Pie Charts', type: 'link', dirchange: false },
            { path: '/charts/apex-charts/radialbarcharts', title: 'Radial Bar Charts', type: 'link', dirchange: false },
            { path: '/charts/apex-charts/radarcharts', title: 'Radar Charts', type: 'link', dirchange: false },
            { path: '/charts/apex-charts/polarareacharts', title: 'Polar Area Charts', type: 'link', dirchange: false },
          ],
        },
      ],
    },
    {
      title: 'Utilities',
      type: 'sub',
      icon: `
                                    <svg xmlns="http://www.w3.org/2000/svg"  class="side-menu__icon" width="24" height="24" viewBox="0 0 24 24"><path d="M7 2a1 1 0 0 0-1 1v1H4a1 1 0 0 0 0 2h2v1a1 1 0 0 0 2 0V6h8v1a1 1 0 1 0 2 0V6h2a1 1 0 1 0 0-2h-2V3a1 1 0 0 0-1-1H7zm0 10a1 1 0 0 0-1 1v7a1 1 0 0 0 2 0v-7a1 1 0 0 0-1-1zm8 0a1 1 0 0 0-1 1v7a1 1 0 0 0 2 0v-7a1 1 0 0 0-1-1z"/></svg>

      `,
      active: false,
      dirchange: false,
      children: [
        { path: '/utilities/avatars', title: 'Avatars', type: 'link', dirchange: false },
        { path: '/utilities/borders', title: 'Borders', type: 'link', dirchange: false },
        { path: '/utilities/break-point', title: 'Breakpoints', type: 'link', dirchange: false },
        { path: '/utilities/colors', title: 'Colors', type: 'link', dirchange: false },
        { path: '/utilities/columns', title: 'Columns', type: 'link', dirchange: false },
        { path: '/utilities/flex', title: 'Flex', type: 'link', dirchange: false },
        { path: '/utilities/gutters', title: 'Gutters', type: 'link', dirchange: false },
        { path: '/utilities/helpers', title: 'Helpers', type: 'link', dirchange: false },
        { path: '/utilities/position', title: 'Position', type: 'link', dirchange: false },
        { path: '/utilities/additional-content', title: 'Additional Content', type: 'link', dirchange: false },
      ],
    },
    {
      title: 'Forms',
      type: 'sub',
      icon: `
                                    <svg xmlns="http://www.w3.org/2000/svg"  class="side-menu__icon" width="24" height="24" viewBox="0 0 24 24"><path d="M19 3H5c-1.103 0-2 .897-2 2v14c0 1.103.897 2 2 2h14c1.103 0 2-.897 2-2V5c0-1.103-.897-2-2-2zm0 2 .001 4H5V5h14zM5 11h8v8H5v-8zm10 8v-8h4.001l.001 8H15z"/></svg>

      `,
      active: false,
      dirchange: false,
      children: [
        { path: '/forms/form-layouts', title: 'Form Layouts', type: 'link', dirchange: false },
        { path: '/forms/floating-labels', title: 'Floating Labels', type: 'link', dirchange: false },
        {
          title: 'Form Elements',
          type: 'sub',
          dirchange: false,
          children: [
            { path: '/forms/form-elements/inputs', title: 'Inputs', type: 'link', dirchange: false },
            { path: '/forms/form-elements/checks-radios', title: 'Checks & Radios', type: 'link', dirchange: false },
            { path: '/forms/form-elements/inputgroup', title: 'Input Group', type: 'link', dirchange: false },
            { path: '/forms/form-elements/formselect', title: 'Form Select', type: 'link', dirchange: false },
            { path: '/forms/form-elements/file-uploads', title: 'File Uploads', type: 'link', dirchange: false },
            { path: '/forms/form-elements/datetimepicker', title: 'Date & Time Pickers', type: 'link', dirchange: false },
            { path: '/forms/form-elements/color-pickers', title: 'Color Pickers', type: 'link', dirchange: false },
            { path: '/forms/form-elements/range-slider', title: 'Range Slider', type: 'link', dirchange: false },
            { path: '/forms/form-elements/inputmask', title: 'Input Masks', type: 'link', dirchange: false },
          ],
        },
        {
          title: 'Form Editors',
          type: 'sub',
          dirchange: false,
          children: [
            { path: '/forms/form-editor/quill-editor', title: 'Quill Editor', type: 'link', dirchange: false },
          ],
        },
        { path: '/forms/validation', title: 'Validation', type: 'link', dirchange: false },
        { path: '/forms/select2', title: 'Select2', type: 'link', dirchange: false },
      ],
    },
    {
      title: 'Tables',
      type: 'sub',
      icon: `
                                    <svg xmlns="http://www.w3.org/2000/svg"  class="side-menu__icon" width="24" height="24" viewBox="0 0 24 24"><path d="M19 3H5c-1.103 0-2 .897-2 2v14c0 1.103.897 2 2 2h14c1.103 0 2-.897 2-2V5c0-1.103-.897-2-2-2zm0 2 .001 4H5V5h14zM5 11h8v8H5v-8zm10 8v-8h4.001l.001 8H15z"/></svg>

      `,
      active: false,
      dirchange: false,
      children: [
        { path: '/tables/tables', title: 'Tables', type: 'link', dirchange: false },
        { path: '/tables/angular-tables', title: 'Angular Material Tables', type: 'link', dirchange: false },
        { path: '/tables/grid-js-tables', title: 'Grid Js Tables', type: 'link', dirchange: false },
      ],
    },
    {
      title: 'Icons',
      type: 'sub',
      icon: `
                                    <svg xmlns="http://www.w3.org/2000/svg"  class="side-menu__icon" width="24" height="24" viewBox="0 0 24 24"><path d="M12.828 3.172a4.5 4.5 0 0 0-6.364 0L2.172 7.464a4.5 4.5 0 0 0 0 6.364l4.292 4.292a4.5 4.5 0 0 0 6.364 0l4.292-4.292a4.5 4.5 0 0 0 0-6.364l-4.292-4.292zm2.878 5.707a2.5 2.5 0 0 1 0 3.536l-4.292 4.292a2.5 2.5 0 0 1-3.536 0L3.586 12.414a2.5 2.5 0 0 1 0-3.536l4.292-4.292a2.5 2.5 0 0 1 3.536 0l4.292 4.292z"/></svg>

      `,
      active: false,
      dirchange: false,
      children: [
        { path: '/icons', title: 'Icons', type: 'link', dirchange: false },
      ],
    },
    {
      icon: `
                                    <svg xmlns="http://www.w3.org/2000/svg"  class="side-menu__icon" width="24" height="24" viewBox="0 0 24 24"><path d="M10 3H4a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1zM9 9H5V5h4v4zm11 4h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-6a1 1 0 0 0-1-1zm-1 6h-4v-4h4v4zM17 3c-2.206 0-4 1.794-4 4s1.794 4 4 4 4-1.794 4-4-1.794-4-4-4zm0 6c-1.103 0-2-.897-2-2s.897-2 2-2 2 .897 2 2-.897 2-2 2zM7 13c-2.206 0-4 1.794-4 4s1.794 4 4 4 4-1.794 4-4-1.794-4-4-4zm0 6c-1.103 0-2-.897-2-2s.897-2 2-2 2 .897 2 2-.897 2-2 2z"/></svg>

      `,
      title: 'Widgets',
      path: '/widgets',
      type: 'link',
      dirchange: false,
      nochild: true,
    },
    {
      title: 'Maps',
      type: 'sub',
      icon: `

                                    <svg xmlns="http://www.w3.org/2000/svg"  class="side-menu__icon" width="24" height="24" viewBox="0 0 24 24"><path d="M2.002 9.63c-.023.411.207.794.581.966l7.504 3.442 3.442 7.503c.164.356.52.583.909.583l.057-.002a1 1 0 0 0 .894-.686l5.595-17.032c.117-.358.023-.753-.243-1.02s-.66-.358-1.02-.243L2.688 8.736a1 1 0 0 0-.686.894zm16.464-3.971-4.182 12.73-2.534-5.522a.998.998 0 0 0-.492-.492L5.734 9.841l12.732-4.182z"/></svg>

      `,
      active: false,
      dirchange: false,
      children: [
        { path: '/maps/googlemaps', title: 'Google Maps', type: 'link', dirchange: false },
        { path: '/maps/leafletmaps', title: 'Leaflet Maps', type: 'link', dirchange: false },
      ],
    },
    { headTitle: 'PROJECT TRACKING' },
    {
      title: 'Suivi Projets',
      type: 'sub',
      icon: `
                                    <svg xmlns="http://www.w3.org/2000/svg" class="side-menu__icon" width="24" height="24" viewBox="0 0 24 24"><path d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v13a3 3 0 0 0 3 3h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 16H6a1 1 0 0 1-1-1V10h14v10zM5 8V6h14v2H5zm2 4h5v5H7v-5zm7 0h3v2h-3v-2zm0 3h3v2h-3v-2z"/></svg>

      `,
      active: false,
      dirchange: false,
      children: [
        { path: '/project-tracking/dashboard', title: 'Tableau de bord', type: 'link', dirchange: false },
        { path: '/project-tracking/workspace', title: 'Mon espace', type: 'link', dirchange: false },
        { path: '/project-tracking/projects', title: 'Liste des projets', type: 'link', dirchange: false },
        { path: '/project-tracking/projects/new', title: 'Nouveau projet', type: 'link', dirchange: false },
        { path: '/project-tracking/reports', title: 'Reporting', type: 'link', dirchange: false },
        { path: '/project-tracking/decision-support', title: 'Aide decision', type: 'link', dirchange: false },
        { path: '/project-tracking/decision-actions', title: 'Plan actions', type: 'link', dirchange: false },
        { path: '/project-tracking/escalation-control', title: 'Centre escalades', type: 'link', dirchange: false },
        { path: '/project-tracking/decision-journal', title: 'Journal decisions', type: 'link', dirchange: false },
      ],
    },
  ];

  items = new BehaviorSubject<Menu[]>(this.MENUITEMS);
}
