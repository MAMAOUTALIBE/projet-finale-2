import http from 'node:http';
import { createReadStream, existsSync, promises as fs } from 'node:fs';
import path from 'node:path';

const distDir = path.resolve(process.cwd(), 'dist');
const indexFile = path.join(distDir, 'index.html');
const runtimeConfigFile = path.join(distDir, 'runtime-config.js');
const port = Number.parseInt(process.env.PORT ?? '8080', 10);

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.mp4': 'video/mp4',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return fallback;
}

async function writeRuntimeConfig() {
  const runtimeConfig = {
    firebase: {
      apiKey: normalizeString(process.env.FIREBASE_API_KEY),
      authDomain: normalizeString(process.env.FIREBASE_AUTH_DOMAIN),
      projectId: normalizeString(process.env.FIREBASE_PROJECT_ID),
      storageBucket: normalizeString(process.env.FIREBASE_STORAGE_BUCKET),
      messagingSenderId: normalizeString(process.env.FIREBASE_MESSAGING_SENDER_ID),
      appId: normalizeString(process.env.FIREBASE_APP_ID),
      measurementId: normalizeString(process.env.FIREBASE_MEASUREMENT_ID),
    },
    googleMapsApiKey: normalizeString(process.env.GOOGLE_MAPS_API_KEY),
    enableLocalDemo: normalizeBoolean(process.env.ENABLE_LOCAL_DEMO, false),
  };

  await fs.writeFile(
    runtimeConfigFile,
    `window.__APP_CONFIG__ = ${JSON.stringify(runtimeConfig, null, 2)};\n`,
    'utf8'
  );
}

function resolveAssetPath(requestUrl) {
  const pathname = decodeURIComponent(new URL(requestUrl, 'http://localhost').pathname);
  const relativePath = pathname.replace(/^\/+/, '');
  const resolvedPath = path.resolve(distDir, relativePath);

  if (!resolvedPath.startsWith(distDir)) {
    return null;
  }

  return resolvedPath;
}

function sendFile(response, filePath, headers = {}) {
  const extension = path.extname(filePath).toLowerCase();
  const contentType = contentTypes[extension] ?? 'application/octet-stream';

  response.writeHead(200, {
    'Content-Type': contentType,
    ...headers,
  });

  createReadStream(filePath).pipe(response);
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

await writeRuntimeConfig();

const server = http.createServer(async (request, response) => {
  try {
    const requestUrl = request.url ?? '/';

    if (requestUrl === '/health') {
      sendJson(response, 200, { ok: true });
      return;
    }

    const assetPath = resolveAssetPath(requestUrl);
    if (!assetPath) {
      sendJson(response, 400, { error: 'Invalid path.' });
      return;
    }

    if (existsSync(assetPath) && (await fs.stat(assetPath)).isFile()) {
      const extraHeaders =
        path.basename(assetPath) === 'runtime-config.js' ? { 'Cache-Control': 'no-store' } : {};
      sendFile(response, assetPath, extraHeaders);
      return;
    }

    if (path.extname(assetPath)) {
      sendJson(response, 404, { error: 'Asset not found.' });
      return;
    }

    sendFile(response, indexFile, { 'Cache-Control': 'no-cache' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown server error.';
    sendJson(response, 500, { error: message });
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Serving Angular app from ${distDir} on port ${port}`);
});
