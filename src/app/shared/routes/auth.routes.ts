import {  Routes } from '@angular/router';

import { authenticationRoutingModule } from '../../components/pages/authentication/authentication.routes';

export const authen: Routes = [
    {
        path: '', children: [
            ...authenticationRoutingModule
        ]
    },
    {
        path: 'auth/login',
        loadComponent: () => import('../../authentication/login/login').then((m) => m.Login),
    },
]
