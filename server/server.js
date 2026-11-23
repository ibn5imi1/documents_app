import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = path.join(ROOT, 'data')
const DATA_FILE = path.join(DATA_DIR, 'db.json')
const BACKUP_FILE = path.join(DATA_DIR, 'db.backup.json')
const DIST_DIR = path.join(ROOT, 'dist')

const PORT = 3000
const HOST = '127.0.0.1' // هذا الجهاز فقط، ولا يراه أي جهاز آخر في الشبكة

const KEY_PATTERN = /^docs:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
}

/* ================== قاعدة البيانات (ملف JSON) ================== */
fs.mkdirSync(DATA_DIR, { recursive: true })

let db = {}
if (fs.existsSync(DATA_FILE)) {
  try {
    db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
  } catch {
    // الملف تالف: نحتفظ بنسخة منه ونبدأ من جديد بدل أن نخسره
    const broken = path.join(DATA_DIR, `db.corrupt-${Date.now()}.json`)
    fs.renameSync(DATA_FILE, broken)
    console.error(`ملف البيانات تالف، حُفظ باسم: ${broken}`)
  }
}

// كتابة آمنة: نكتب في ملف مؤقت ثم نبدّله، ونحتفظ بالنسخة السابقة
function saveDb() {
  const tmp = `${DATA_FILE}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(db))
  if (fs.existsSync(DATA_FILE)) fs.copyFileSync(DATA_FILE, BACKUP_FILE)
  fs.renameSync(tmp, DATA_FILE)
}

/* ================== أدوات ================== */
function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-cache' })
  res.end(body)
}

function readBody(req, limit = 20 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('الطلب كبير جداً'))
        req.destroy()
      } else {
        chunks.push(chunk)
      }
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

// نرفض الطلبات القادمة من مواقع إنترنت أخرى (حماية من صفحات تحاول الكتابة في بياناتك)
function isLocalOrigin(origin) {
  try {
    const { hostname } = new URL(origin)
    return hostname === 'localhost' || hostname === '127.0.0.1'
  } catch {
    return false
  }
}

function serveStatic(pathname, res) {
  if (!fs.existsSync(DIST_DIR)) {
    return send(
      res,
      200,
      '<p dir="rtl" style="font-family:Tahoma">شغّل الأمر <b>npm run build</b> أولاً ثم أعد تشغيل الخادم.</p>',
      'text/html; charset=utf-8'
    )
  }

  const rel = decodeURIComponent(pathname) === '/' ? '/index.html' : decodeURIComponent(pathname)
  const file = path.normalize(path.join(DIST_DIR, rel))
  if (!file.startsWith(DIST_DIR)) return send(res, 403, 'forbidden', 'text/plain')
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    return send(res, 404, 'not found', 'text/plain')
  }

  const type = MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream'
  res.writeHead(200, { 'Content-Type': type })
  fs.createReadStream(file).pipe(res)
}

/* ================== الخادم ================== */
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${HOST}:${PORT}`)

    if (url.pathname.startsWith('/api/')) {
      const origin = req.headers.origin
      if (origin && !isLocalOrigin(origin)) return send(res, 403, '{"error":"forbidden"}')

      // قراءة كل البيانات
      if (req.method === 'GET' && url.pathname === '/api/data') {
        return send(res, 200, JSON.stringify(db))
      }

      // حفظ مفتاح واحد (مثل docs:payment-vouchers:pharmacy)
      const match = url.pathname.match(/^\/api\/data\/(.+)$/)
      if (req.method === 'PUT' && match) {
        const key = decodeURIComponent(match[1])
        if (!KEY_PATTERN.test(key)) return send(res, 400, '{"error":"bad key"}')
        if (!(req.headers['content-type'] ?? '').includes('application/json')) {
          return send(res, 415, '{"error":"json only"}')
        }

        let value
        try {
          value = JSON.parse(await readBody(req))
        } catch {
          return send(res, 400, '{"error":"bad json"}')
        }
        if (!Array.isArray(value)) return send(res, 400, '{"error":"array expected"}')

        db[key] = value
        saveDb()
        return send(res, 200, '{"ok":true}')
      }

      return send(res, 404, '{"error":"not found"}')
    }

    serveStatic(url.pathname, res)
  } catch (error) {
    console.error(error)
    send(res, 500, '{"error":"server error"}')
  }
})

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`المنفذ ${PORT} مستعمل. غالباً الخادم يعمل مسبقاً في نافذة أخرى.`)
  } else {
    console.error(error)
  }
  process.exit(1)
})

server.listen(PORT, HOST, () => {
  console.log(`البرنامج يعمل على: http://localhost:${PORT}`)
  console.log(`ملف البيانات: ${DATA_FILE}`)
})