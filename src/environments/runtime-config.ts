export interface FirebaseClientConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId: string;
}

export interface AppRuntimeConfig {
  firebase?: Partial<FirebaseClientConfig>;
  googleMapsApiKey?: string;
  enableLocalDemo?: boolean;
  autoDemoLogin?: boolean;
}

export interface AppEnvironment {
  production: boolean;
  enableLocalDemo: boolean;
  autoDemoLogin: boolean;
  hasFirebaseConfig: boolean;
  firebase: FirebaseClientConfig;
  googleMapsApiKey: string;
}

declare global {
  interface Window {
    __APP_CONFIG__?: AppRuntimeConfig;
  }
}

const defaultFirebaseConfig: FirebaseClientConfig = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
  measurementId: '',
};

function normalizeString(value: string | undefined): string {
  return value?.trim() ?? '';
}

function readRuntimeConfig(): Required<AppRuntimeConfig> {
  const runtimeConfig = typeof window !== 'undefined' ? window.__APP_CONFIG__ : undefined;

  return {
    firebase: {
      ...defaultFirebaseConfig,
      ...(runtimeConfig?.firebase ?? {}),
    },
    googleMapsApiKey: normalizeString(runtimeConfig?.googleMapsApiKey),
    enableLocalDemo: runtimeConfig?.enableLocalDemo ?? false,
    autoDemoLogin: runtimeConfig?.autoDemoLogin ?? false,
  };
}

function hasRequiredFirebaseConfig(config: FirebaseClientConfig): boolean {
  return [
    config.apiKey,
    config.authDomain,
    config.projectId,
    config.storageBucket,
    config.messagingSenderId,
    config.appId,
  ].every((value) => Boolean(normalizeString(value)));
}

export function createEnvironment(options: {
  production: boolean;
  enableLocalDemo: boolean;
}): AppEnvironment {
  const runtimeConfig = readRuntimeConfig();
  const firebase = {
    ...defaultFirebaseConfig,
    ...runtimeConfig.firebase,
  };

  return {
    production: options.production,
    enableLocalDemo: runtimeConfig.enableLocalDemo || (!options.production && options.enableLocalDemo),
    autoDemoLogin: runtimeConfig.autoDemoLogin,
    hasFirebaseConfig: hasRequiredFirebaseConfig(firebase),
    firebase,
    googleMapsApiKey: runtimeConfig.googleMapsApiKey,
  };
}
