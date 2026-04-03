import { Component, Renderer2, inject } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { AuthService } from '../../shared/services/auth.service';
import { RoleService } from '../../core/services/role.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-login',
  imports: [RouterModule, FormsModule, ReactiveFormsModule, NgbModule],
  templateUrl: './login.html',
  styleUrls: ['./login.scss'] // Corrected to 'styleUrls'
})
export class Login {
  authservice = inject(AuthService);
  private roleService = inject(RoleService);
  private router = inject(Router);
  private activatedRoute = inject(ActivatedRoute);
  private formBuilder = inject(FormBuilder);
  private renderer = inject(Renderer2);
  private toastr = inject(ToastrService);
  readonly enableLocalDemo = environment.enableLocalDemo;
  readonly hasFirebaseConfig = environment.hasFirebaseConfig;

  disabled = '';
  active = 'Firebase';
  showLoader: boolean | undefined;
  public angularLoginForm!: FormGroup;
  public firebaseLoginForm!: FormGroup;
  errorMessage = ''; // validation error handle
  _error: { name: string; message: string } = { name: '', message: '' }; // for firebase error handle
  public loginForm!: FormGroup;
  public error: any = '';

  constructor() {
    const bodyElement = this.renderer.selectRootElement('body', true);
    this.renderer.setAttribute(bodyElement, 'class', 'error-page1 bg-primary');
  }

  ngOnInit(): void {
    this.angularLoginForm = this.formBuilder.group({
      username: ['', [Validators.required, Validators.email]],
      password: ['', Validators.required]
    });

    this.firebaseLoginForm = this.formBuilder.group({
      username: ['', [Validators.required, Validators.email]],
      password: ['', Validators.required]
    });
  }

  clearErrorMessage() {
    this.errorMessage = '';
    this._error = { name: '', message: '' };
  }
  login() {
    if (!this.hasFirebaseConfig) {
      this.toastr.error('La configuration Firebase est manquante pour cet environnement.', 'Nowa', {
        timeOut: 4000,
        positionClass: 'toast-top-right'
      });
      return;
    }

    this.clearErrorMessage();
    const email = this.firebaseLoginForm.controls['username'].value;
    const password = this.firebaseLoginForm.controls['password'].value;

    if (this.validateForm(email, password)) {
      this.authservice.loginWithEmail(email, password)
        .then(async () => {
          await this.roleService.ensureCurrentUserProfile();
          const returnUrl = this.activatedRoute.snapshot.queryParamMap.get('returnUrl');
          this.router.navigateByUrl(returnUrl || '/project-tracking/dashboard');
          this.toastr.success('Login successful', 'Nowa', {
            timeOut: 3000,
            positionClass: 'toast-top-right'
          });
        })
        .catch((_error: any) => {
          this._error = _error;
          this.router.navigate(['/']);
          this.toastr.error('Invalid details', 'Nowa', {
            timeOut: 3000,
            positionClass: 'toast-top-right'
          });
        });

    } else {
      this.toastr.error('Invalid details', 'Nowa', {
        timeOut: 3000,
        positionClass: 'toast-top-right'
      });
    }
  }


  validateForm(email: string, password: string) {
    if (email.length === 0) {
      this.errorMessage = 'Please enter email id';
      return false;
    }

    if (password.length === 0) {
      this.errorMessage = 'Please enter password';
      return false;
    }

    if (password.length < 6) {
      this.errorMessage = 'Password should be at least 6 characters';
      return false;
    }

    this.errorMessage = '';
    return true;
  }

  get form() {
    return this.loginForm.controls;
  }

  submitDemoLogin() {
    if (!this.enableLocalDemo) {
      this.toastr.error('Le mode de demonstration locale est desactive.', 'Nowa', {
        timeOut: 3000,
        positionClass: 'toast-top-right',
      });
      return;
    }

    const { username, password } = this.angularLoginForm.controls;
    if (
      username.value === 'spruko@admin.com' && password.value === 'sprukoadmin'
    ) {
      this.authservice.startLocalDemoSession(username.value);
      const returnUrl = this.activatedRoute.snapshot.queryParamMap.get('returnUrl');
      this.router.navigateByUrl(returnUrl || '/project-tracking/dashboard');
      this.toastr.success('login successful', 'Nowa', {
        timeOut: 3000,
        positionClass: 'toast-top-right',

      });
    } else {
      this.error = 'Please check email and passowrd';
      this.toastr.error('Invalid details', 'Nowa', {
        timeOut: 3000,
        positionClass: 'toast-top-right',

      });
    }

  }


  ngOnDestroy(): void {
    const bodyElement = this.renderer.selectRootElement('body', true);
    this.renderer.removeAttribute(bodyElement, 'class');
  }
  public visibilityMap: Record<string, boolean> = {
    Angular: false,
    Firebase: false
  };
  public iconMap: Record<string, string> = {
    Angular: 'fe fe-eye-off',
    Firebase: 'fe fe-eye-off'
  };
  toggleVisibility(tab: string): void {
    this.visibilityMap[tab] = !this.visibilityMap[tab];
    this.iconMap[tab] = this.visibilityMap[tab] ? 'fe fe-eye' : 'fe fe-eye-off';
  }
}


