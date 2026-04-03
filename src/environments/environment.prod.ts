import { createEnvironment } from './runtime-config';

export const environment = createEnvironment({
  production: true,
  enableLocalDemo: false,
});
