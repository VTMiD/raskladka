const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = 8000;
const ROOT = __dirname;

let dxfFolderPath = null;

let pathsSettings = {
  parts:    'D:\\_Раскладка_Проект\\Детали',
  sheets:   'D:\\_Раскладка_Проект\\Листы',
  remnants: 'D:\\_Раскладка_Проект\\Остаток',
  projects: 'D:\\_Раскладка_Проект\\Проекты',
  shop:     'D:\\_Раскладка_Проект\\В цех',
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico':  'image/x-icon',
  '.dxf':  'application/dxf',
  '.tap':  'text/plain; charset=utf-8',
  '.nc':   'text/plain; charset=utf-8',
  '.gcode':'text/plain; charset=utf-8',
  '.pdf':  'application/pdf',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.txt':  'text/plain; charset=utf-8',
  '.map':  'application/json; charset=utf-8',
};

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', chunk => { buf += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(buf || '{}')); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function jsonResponse(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let urlPath = decodeURIComponent(parsedUrl.pathname);

  if (urlPath === '/api/set-paths' && req.method === 'POST') {
    try {
      const data = await readJsonBody(req);
      for (const key of Object.keys(pathsSettings)) {
        if (data[key] && typeof data[key] === 'string') {
          pathsSettings[key] = data[key];
          ensureDir(data[key]);
          
          // Автосоздание подпапок
          if (key === 'projects') {
            ensureDir(path.join(data[key], 'Q-KOD'));
            ensureDir(path.join(data[key], 'Отчеты'));
          }
          
          // Для всех кроме "В цех" (shop) создаём "Отчеты"
          if (key !== 'shop' && key !== 'projects') {
            ensureDir(path.join(data[key], 'Отчеты'));
          }
        }
      }
      if (data.parts) dxfFolderPath = data.parts;
      console.log('[paths] Обновлено:', pathsSettings);
      return jsonResponse(res, 200, { ok: true });
    } catch (e) {
      return jsonResponse(res, 400, { ok: false, error: e.message });
    }
  }

  if (urlPath === '/api/save-file' && req.method === 'POST') {
    try {
      const data = await readJsonBody(req);
      const { category, subfolder, fileName, content, isBase64 } = data;
      if (!category || !fileName) return jsonResponse(res, 400, { ok: false, error: 'category и fileName обязательны' });

      const base = pathsSettings[category];
      if (!base) return jsonResponse(res, 400, { ok: false, error: 'Неизвестная категория: ' + category });

      const dir = subfolder ? path.join(base, subfolder) : base;
      ensureDir(dir);
      const safeName = path.basename(String(fileName));
      const full = path.join(dir, safeName);

      if (isBase64) {
        fs.writeFileSync(full, Buffer.from(String(content || ''), 'base64'));
      } else {
        fs.writeFileSync(full, String(content || ''), 'utf8');
      }

      console.log(`[save-file] ✓ ${category}${subfolder ? '\\' + subfolder : ''}\\${safeName}`);
      return jsonResponse(res, 200, { ok: true, path: full, name: safeName });
    } catch (e) {
      console.error('[save-file] ✗', e);
      return jsonResponse(res, 500, { ok: false, error: e.message });
    }
  }

  if (urlPath === '/api/file-exists' && req.method === 'POST') {
    try {
      const data = await readJsonBody(req);
      const base = pathsSettings[data.category];
      if (!base) return jsonResponse(res, 400, { ok: false, error: 'bad category' });
      const dir = data.subfolder ? path.join(base, data.subfolder) : base;
      const full = path.join(dir, path.basename(String(data.fileName || '')));
      return jsonResponse(res, 200, { ok: true, exists: fs.existsSync(full) });
    } catch (e) {
      return jsonResponse(res, 500, { ok: false, error: e.message });
    }
  }

  if (urlPath === '/api/find-project' && req.method === 'GET') {
    const projectName = parsedUrl.searchParams.get('name');
    if (!projectName) return jsonResponse(res, 400, { ok: false, error: 'Не указано имя проекта' });

    const safeName = path.basename(projectName);
    const searchDirs = [pathsSettings.projects, 'D:\\_Раскладка_Проект', ROOT].filter(Boolean);
    let foundPath = null, foundData = null;

    for (const dir of searchDirs) {
      const candidate = path.join(dir, safeName);
      if (fs.existsSync(candidate)) {
        try {
          foundData = fs.readFileSync(candidate, 'utf8');
          foundPath = candidate;
          break;
        } catch (_) {}
      }
    }

    if (foundPath && foundData !== null) {
      console.log(`[find-project] ✅ ${foundPath}`);
      return jsonResponse(res, 200, { ok: true, content: foundData, path: foundPath });
    }
    return jsonResponse(res, 404, { ok: false, error: `Файл "${safeName}" не найден.` });
  }

  if (urlPath === '/api/list-projects' && req.method === 'GET') {
    try {
      const base = pathsSettings.projects;
      ensureDir(base);
      const files = fs.readdirSync(base)
        .filter(f => /\.(dxfnest\.)?json$/i.test(f))
        .map(f => {
          const st = fs.statSync(path.join(base, f));
          return { name: f, mtime: st.mtimeMs };
        })
        .sort((a, b) => b.mtime - a.mtime);
      return jsonResponse(res, 200, { ok: true, files });
    } catch (e) {
      return jsonResponse(res, 500, { ok: false, error: e.message });
    }
  }

  if (urlPath === '/api/list-parts' && req.method === 'GET') {
    try {
      const base = pathsSettings.parts;
      ensureDir(base);
      const files = fs.readdirSync(base)
        .filter(f => /\.dxf$/i.test(f))
        .map(f => {
          const st = fs.statSync(path.join(base, f));
          return { name: f, size: st.size, mtime: st.mtimeMs };
        });
      return jsonResponse(res, 200, { ok: true, folder: base, files });
    } catch (e) {
      return jsonResponse(res, 500, { ok: false, error: e.message });
    }
  }

  if (urlPath === '/api/get-parts-batch' && req.method === 'POST') {
    try {
      const data = await readJsonBody(req);
      const names = Array.isArray(data.names) ? data.names : [];
      const base = pathsSettings.parts;
      const files = [];
      for (const nm of names) {
        const safe = path.basename(String(nm));
        const full = path.join(base, safe);
        try {
          files.push({ name: safe, content: fs.readFileSync(full, 'utf8') });
        } catch (e) {
          files.push({ name: safe, error: 'не найден' });
        }
      }
      return jsonResponse(res, 200, { ok: true, files });
    } catch (e) {
      return jsonResponse(res, 500, { ok: false, error: e.message });
    }
  }

  if (urlPath === '/api/find-parts-by-list' && req.method === 'POST') {
    try {
      const data = await readJsonBody(req);
      const ids = Array.isArray(data.ids) ? data.ids.map(String) : [];
      const base = pathsSettings.parts;
      ensureDir(base);
      const all = fs.readdirSync(base).filter(f => /\.dxf$/i.test(f));
      const found = [], notFound = [];
      for (const id of ids) {
        const hit = all.find(f => f.toLowerCase().includes(id.toLowerCase()));
        if (hit) found.push({ name: hit, content: fs.readFileSync(path.join(base, hit), 'utf8') });
        else notFound.push(id);
      }
      return jsonResponse(res, 200, { ok: true, files: found, notFound });
    } catch (e) {
      return jsonResponse(res, 500, { ok: false, error: e.message });
    }
  }

  if (urlPath === '/api/set-dxf-path' && req.method === 'POST') {
    try {
      const data = await readJsonBody(req);
      if (data.path && fs.existsSync(data.path) && fs.statSync(data.path).isDirectory()) {
        dxfFolderPath = path.resolve(data.path);
        return jsonResponse(res, 200, { ok: true, path: dxfFolderPath });
      }
      return jsonResponse(res, 400, { ok: false, error: 'Папка не найдена' });
    } catch (e) {
      return jsonResponse(res, 400, { ok: false, error: 'Неверный формат запроса' });
    }
  }

  if (urlPath === '/api/get-dxf' && req.method === 'GET') {
    if (!dxfFolderPath) return jsonResponse(res, 400, { ok: false, error: 'Путь к папке DXF не задан' });
    const fileName = parsedUrl.searchParams.get('name');
    if (!fileName) return jsonResponse(res, 400, { ok: false, error: 'Не указано имя файла' });

    const safeName = path.basename(fileName);
    fs.readFile(path.join(dxfFolderPath, safeName), (err, data) => {
      if (err) return jsonResponse(res, 404, { ok: false, error: 'Файл не найден' });
      res.writeHead(200, { 'Content-Type': 'application/dxf' });
      res.end(data);
    });
    return;
  }

  if (urlPath === '/' || urlPath === '') urlPath = '/index.html';
  const filePath = path.join(ROOT, urlPath);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('403 Forbidden');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found: ' + urlPath);
    }
    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log('');
  console.log('  ✅ Локальный сервер запущен');
  console.log('  → http://localhost:' + PORT + '/');
  console.log('');
  console.log('  Пути хранения:');
  for (const [k, v] of Object.entries(pathsSettings)) {
    console.log(`    ${k.padEnd(9)} → ${v}`);
  }
  console.log('');
  console.log('  Для остановки: Ctrl+C');
  console.log('');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log('  ❌ Порт ' + PORT + ' уже занят');
  } else {
    console.log('  ❌ Ошибка сервера:', err.message);
  }
  process.exit(1);
});