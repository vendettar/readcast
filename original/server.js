// server.js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;

function parseEnvFile(contents) {
  const env = {};
  String(contents || '')
    .split(/\r?\n/g)
    .forEach((line) => {
      const raw = String(line || '').trim();
      if (!raw || raw.startsWith('#')) return;
      const idx = raw.indexOf('=');
      if (idx <= 0) return;
      const key = raw.slice(0, idx).trim();
      let value = raw.slice(idx + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (key) env[key] = value;
    });
  return env;
}

function loadRuntimeEnv() {
  const envPath = path.join(__dirname, '.env');
  let fileEnv = {};
  try {
    if (fs.existsSync(envPath)) {
      fileEnv = parseEnvFile(fs.readFileSync(envPath, 'utf8'));
    }
  } catch {
    fileEnv = {};
  }
  return { ...fileEnv, ...process.env };
}

// Serve specific static directories
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/scripts', express.static(path.join(__dirname, 'scripts')));
app.use('/styles', express.static(path.join(__dirname, 'styles')));
app.use('/sample', express.static(path.join(__dirname, 'sample')));

app.get('/env.js', (req, res) => {
  const env = loadRuntimeEnv();
  const payload = {
    READCAST_CORS_PROXY_URL: env.READCAST_CORS_PROXY_URL || '',
    READCAST_CORS_PROXY_PRIMARY: env.READCAST_CORS_PROXY_PRIMARY || '',
  };
  res.set('Cache-Control', 'no-store');
  res.type('application/javascript').send(
    `window.__READCAST_ENV__ = Object.assign(window.__READCAST_ENV__ || {}, ${JSON.stringify(
      payload
    )});`
  );
});

// Serve index.html at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
