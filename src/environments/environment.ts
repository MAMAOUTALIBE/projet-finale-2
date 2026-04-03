import { createEnvironment } from './runtime-config';

export const environment = createEnvironment({
  production: false,
  enableLocalDemo: true,
});
