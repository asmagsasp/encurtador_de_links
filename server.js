require('dotenv').config();
const express  = require('express');
const path     = require('path');
const cors     = require('cors');
const session  = require('express-session');
const QRCode   = require('qrcode');
const https    = require('https');
const http     = require('http');
const crypto   = require('crypto');
const db       = require('./db');

const app = express();
const PORT           = process.env.PORT || 5000;
const BASE_URL       = process.env.BASE_URL || `http://localhost:${PORT}`;
const ADMIN_USER     = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS     = process.env.ADMIN_PASS || 'admin123';
const SESSION_SECRET = process.env.SESSION_SECRET || 'linkcurto-secret';

const RESERVED_SLUGS = new Set(['api', 'auth', 'login', 'logout', 'admin', 'static', 'public', 'sw.js', 'manifest.json', 'favicon.ico']);

// ─── Planos de Acesso ─────────────────────────────────────────────────────────
const PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    badge: 'Grátis',
    price: 'R$ 0,00',
    priceValue: 0,
    period: 'para sempre',
    description: 'Para quem está começando a testar o encurtador.',
    maxLinks: 1,
    maxClicksPerLink: 100,
    customSlug: false,
    advancedOptions: false,
    exportCsv: false,
    previewPage: false,
    analyticsDetailed: false,
    features: [
      { text: 'Até 1 link ativo', included: true },
      { text: 'Até 100 cliques no link', included: true },
      { text: 'QR Code padrão', included: true },
      { text: 'Slug personalizado', included: false },
      { text: 'Expiração por data e horário', included: false },
      { text: 'Limite manual de cliques', included: false },
      { text: 'Exportação para CSV', included: false },
      { text: 'Analytics com gráficos de 30 dias', included: false },
      { text: 'Página de preview com OG cards', included: false },
    ]
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    badge: 'Mais Popular 🔥',
    price: 'R$ 9,90',
    priceValue: 9.9,
    period: '/mês',
    description: 'Ideal para profissionais, lojas e criadores de conteúdo.',
    maxLinks: 25,
    maxClicksPerLink: 5000,
    customSlug: true,
    advancedOptions: false,
    exportCsv: true,
    previewPage: false,
    analyticsDetailed: true,
    features: [
      { text: 'Até 25 links ativos', included: true },
      { text: 'Até 5.000 cliques por link', included: true },
      { text: 'Slugs personalizados liberados', included: true },
      { text: 'QR Code com download PNG em alta', included: true },
      { text: 'Exportação completa para CSV', included: true },
      { text: 'Analytics detalhado com gráfico de 30 dias', included: true },
      { text: 'Expiração programada', included: false },
      { text: 'Página de preview com OG cards', included: false },
    ]
  },
  master: {
    id: 'master',
    name: 'Master VIP',
    badge: 'Tudo Liberado 👑',
    price: 'R$ 19,90',
    priceValue: 19.9,
    period: '/mês',
    description: 'Controle total, sem nenhum limite e com todos os recursos VIP.',
    maxLinks: Infinity,
    maxClicksPerLink: Infinity,
    customSlug: true,
    advancedOptions: true,
    exportCsv: true,
    previewPage: true,
    analyticsDetailed: true,
    features: [
      { text: 'Links ILIMITADOS ♾️', included: true },
      { text: 'Cliques ILIMITADOS ♾️', included: true },
      { text: 'Slugs personalizados ilimitados', included: true },
      { text: 'Expiração por data e horário', included: true },
      { text: 'Limite customizado de cliques', included: true },
      { text: 'Página de preview rica com OG Cards', included: true },
      { text: 'QR Code Pro + Download PNG', included: true },
      { text: 'Exportação CSV sem limites', included: true },
      { text: 'Analytics completo em tempo real', included: true },
      { text: 'Selo VIP Master e suporte prioritário', included: true },
    ]
  }
};

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, originalHash] = stored.split(':');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return hash === originalHash;
}

async function getUserPlan(user) {
  if (!user) return PLANS.free;
  if (!user.id) {
    const row = await db.get('SELECT value FROM settings WHERE key = ?', ['current_plan']);
    const planId = row ? row.value : 'free';
    return PLANS[planId] || PLANS.free;
  }
  const dbUser = await db.get('SELECT plan FROM users WHERE id = ?', [user.id]);
  const planId = dbUser?.plan || user.plan || 'free';
  return PLANS[planId] || PLANS.free;
}

async function setUserPlan(user, planId) {
  if (!PLANS[planId]) throw new Error('Plano inválido.');
  if (!user.id) {
    await db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['current_plan', planId]);
  } else {
    await db.run('UPDATE users SET plan = ? WHERE id = ?', [planId, user.id]);
    user.plan = planId;
  }
  return PLANS[planId];
}

async function getCurrentPlan() {
  const row = await db.get('SELECT value FROM settings WHERE key = ?', ['current_plan']);
  const planId = row ? row.value : 'free';
  return PLANS[planId] || PLANS.free;
}

// ─── Middleware ───────────────────────────────────────────────────────────────
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());
app.use(session({
  secret: SESSION_SECRET,
  resave: true,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000,
    sameSite: 'lax',
    secure: false,
  },
}));

// Inicialização automática do schema (compatível com Serverless Vercel)
let schemaReady = false;
let schemaInitPromise = null;
async function ensureSchema() {
  if (schemaReady) return;
  if (!schemaInitPromise) {
    schemaInitPromise = db.initSchema().then(() => { schemaReady = true; });
  }
  return schemaInitPromise;
}

app.use(async (req, res, next) => {
  try {
    await ensureSchema();
    next();
  } catch (err) {
    console.error('Erro na inicialização do DB:', err);
    res.status(500).json({ error: 'Erro de conexão com o banco de dados.' });
  }
});

// ─── Auth Middleware ──────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.session?.user) return next();
  res.status(401).json({ error: 'Não autorizado. Faça login.' });
}

app.post('/auth/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Preencha usuário e senha.' });
  }

  const cleanUser = String(username).trim();
  const cleanPass = String(password).trim();

  if (cleanUser.length < 3 || cleanUser.length > 30) {
    return res.status(400).json({ error: 'O nome de usuário deve ter entre 3 e 30 caracteres.' });
  }
  if (!/^[a-zA-Z0-9_.-]+$/.test(cleanUser)) {
    return res.status(400).json({ error: 'Use apenas letras, números, ponto, hífen ou sublinhado no usuário.' });
  }
  if (cleanPass.length < 4) {
    return res.status(400).json({ error: 'A senha deve ter no mínimo 4 caracteres.' });
  }

  const envAdmin = (ADMIN_USER || 'admin').trim().toLowerCase();
  if (cleanUser.toLowerCase() === envAdmin) {
    return res.status(409).json({ error: 'Esse nome de usuário já está reservado.' });
  }

  const existing = await db.get('SELECT id FROM users WHERE LOWER(username) = ?', [cleanUser.toLowerCase()]);
  if (existing) {
    return res.status(409).json({ error: 'Esse usuário já existe. Faça login ou escolha outro nome.' });
  }

  try {
    const passwordHash = hashPassword(cleanPass);
    const info = await db.run('INSERT INTO users (username, password_hash, plan) VALUES (?, ?, ?)', [cleanUser, passwordHash, 'free']);
    const newUser = { id: info.lastInsertRowid, username: cleanUser, plan: 'free' };
    
    req.session.user = newUser;
    req.session.save(err => {
      if (err) return res.status(500).json({ error: 'Erro ao iniciar sessão.' });
      res.status(201).json({ success: true, username: cleanUser, message: 'Conta criada com sucesso!' });
    });
  } catch (err) {
    console.error('Erro ao registrar:', err);
    res.status(500).json({ error: 'Erro interno ao registrar usuário.' });
  }
});

app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Preencha usuário e senha.' });

  const cleanUser = String(username).trim();
  const cleanPass = String(password).trim();

  const envAdminUser = (ADMIN_USER || 'admin').trim();
  const envAdminPass = (ADMIN_PASS || 'admin123').trim();

  // 1. Verifica se é o admin padrão (.env) — case-insensitive no nome do usuário
  if (cleanUser.toLowerCase() === envAdminUser.toLowerCase() && cleanPass === envAdminPass) {
    req.session.user = { id: 0, username: envAdminUser, isAdmin: true, plan: 'master' };
    return req.session.save(err => {
      if (err) return res.status(500).json({ error: 'Erro ao salvar sessão.' });
      return res.json({ success: true, username: envAdminUser });
    });
  }

  // 2. Verifica se é um usuário cadastrado no banco
  const user = await db.get('SELECT * FROM users WHERE LOWER(username) = ?', [cleanUser.toLowerCase()]);
  if (!user || !verifyPassword(cleanPass, user.password_hash)) {
    return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
  }

  req.session.user = { id: user.id, username: user.username, plan: user.plan || 'free' };
  req.session.save(err => {
    if (err) return res.status(500).json({ error: 'Erro ao salvar sessão.' });
    res.json({ success: true, username: user.username });
  });
});

app.post('/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

app.get('/auth/me', (req, res) => {
  if (req.session?.user) return res.json({ user: req.session.user });
  res.status(401).json({ error: 'Não autenticado.' });
});

// ─── Plan API ─────────────────────────────────────────────────────────────────
app.get('/api/plan', requireAuth, async (req, res) => {
  const user = req.session.user;
  const currentPlan = await getUserPlan(user);
  const countRow = (user.id === 0)
    ? await db.get('SELECT COUNT(*) as count FROM links')
    : await db.get('SELECT COUNT(*) as count FROM links WHERE user_id = ?', [user.id]);
  const linkCount = countRow?.count || 0;

  res.json({
    currentPlan,
    allPlans: PLANS,
    usage: {
      linksCount: linkCount,
      maxLinks: currentPlan.maxLinks,
      remainingLinks: currentPlan.maxLinks === Infinity ? Infinity : Math.max(0, currentPlan.maxLinks - linkCount),
      canCreateMore: currentPlan.maxLinks === Infinity || linkCount < currentPlan.maxLinks,
    }
  });
});

app.post('/api/plan/upgrade', requireAuth, async (req, res) => {
  const { plan } = req.body;
  if (!plan || !PLANS[plan]) {
    return res.status(400).json({ error: 'Plano inválido. Escolha entre free, pro ou master.' });
  }
  const user = req.session.user;
  const newPlan = await setUserPlan(user, plan);
  const countRow = (user.id === 0)
    ? await db.get('SELECT COUNT(*) as count FROM links')
    : await db.get('SELECT COUNT(*) as count FROM links WHERE user_id = ?', [user.id]);
  const linkCount = countRow?.count || 0;

  res.json({
    success: true,
    message: `Plano atualizado com sucesso para ${newPlan.name}!`,
    currentPlan: newPlan,
    allPlans: PLANS,
    usage: {
      linksCount: linkCount,
      maxLinks: newPlan.maxLinks,
      canCreateMore: newPlan.maxLinks === Infinity || linkCount < newPlan.maxLinks,
    }
  });
});

// ─── Static Files ─────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  maxAge: 0,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────
function generateSlug(length = 6) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function isValidUrl(url) {
  try { const u = new URL(url); return u.protocol === 'http:' || u.protocol === 'https:'; }
  catch { return false; }
}

function isExpired(link) {
  if (link.expires_at && new Date(link.expires_at) < new Date()) return true;
  if (link.max_clicks && link.clicks >= link.max_clicks) return true;
  return false;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function fetchOGData(targetUrl) {
  return new Promise(resolve => {
    try {
      const u = new URL(targetUrl);
      const mod = u.protocol === 'https:' ? https : http;
      const timer = setTimeout(() => resolve(null), 4000);

      const req = mod.get(targetUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 LinkCurtoBot/1.0' }
      }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          clearTimeout(timer);
          try {
            const redirectUrl = new URL(res.headers.location, targetUrl).toString();
            return resolve(fetchOGData(redirectUrl));
          } catch { return resolve(null); }
        }

        const contentType = res.headers['content-type'] || '';
        if (!contentType.includes('text/html')) { clearTimeout(timer); return resolve(null); }

        let html = '';
        res.setEncoding('utf8');
        res.on('data', chunk => {
          html += chunk;
          if (html.length > 60000) res.destroy();
        });

        res.on('end', () => {
          clearTimeout(timer);
          const getMeta = prop => {
            const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["'](?:og:)?${prop}["'][^>]+content=["']([^"']+)["']`, 'i'))
                   || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:)?${prop}["']`, 'i'));
            return m ? m[1].trim() : null;
          };

          const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i);
          const title = getMeta('title') || (titleTag ? titleTag[1].trim() : u.hostname);
          const description = getMeta('description');
          let image = getMeta('image');
          if (image && !image.startsWith('http')) {
            try { image = new URL(image, targetUrl).toString(); } catch { image = null; }
          }

          resolve({ title, description, image, domain: u.hostname });
        });

        res.on('error', () => { clearTimeout(timer); resolve(null); });
      });

      req.on('error', () => { clearTimeout(timer); resolve(null); });
      req.setTimeout(4500, () => req.destroy());
    } catch { resolve(null); }
  });
}

function buildPreviewHTML(link, ogData) {
  const shortUrl  = `${BASE_URL}/${link.slug}`;
  const goUrl     = `${shortUrl}?go=1`;
  const domain    = ogData?.domain || (() => { try { return new URL(link.original_url).hostname; } catch { return link.original_url; } })();
  const title     = escapeHtml(ogData?.title || domain);
  const desc      = escapeHtml(ogData?.description || '');
  const ogImage   = escapeHtml(ogData?.image || '');
  const favicon   = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
  const linkDataJSON = JSON.stringify({ goUrl, linkId: link.id, domain });

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Redirecionando… — LinkCurto</title>
  <meta name="robots" content="noindex,nofollow"/>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    :root{--bg:#0a0a0f;--card:#16161f;--border:rgba(255,255,255,0.07);--accent:#7c3aed;--accent2:#a855f7;--text:#f1f0fa;--muted:#9190a8;--font:'Inter',sans-serif}
    body{font-family:var(--font);background:var(--bg);color:var(--text);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
    .orbs{position:fixed;inset:0;pointer-events:none;z-index:0;overflow:hidden}
    .orb{position:absolute;border-radius:50%;filter:blur(80px);opacity:.15}
    .orb-1{width:500px;height:500px;background:radial-gradient(circle,#7c3aed,transparent);top:-150px;left:-100px}
    .orb-2{width:400px;height:400px;background:radial-gradient(circle,#ec4899,transparent);bottom:-100px;right:-80px}
    .card{position:relative;z-index:1;background:var(--card);border:1px solid var(--border);border-radius:24px;padding:32px;max-width:520px;width:100%;box-shadow:0 24px 64px rgba(0,0,0,.5);animation:up .3s cubic-bezier(.34,1.56,.64,1)}
    @keyframes up{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
    .logo{display:flex;align-items:center;gap:8px;font-size:1.1rem;font-weight:800;margin-bottom:24px}
    .logo .icon{font-size:1.3rem;filter:drop-shadow(0 0 8px rgba(168,85,247,.5))}
    .logo .accent{background:linear-gradient(135deg,#7c3aed,#a855f7,#ec4899);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
    .label{font-size:.75rem;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.6px;margin-bottom:14px}
    .og-img{width:100%;border-radius:12px;max-height:160px;object-fit:cover;display:block;margin-bottom:14px}
    .site{display:flex;align-items:flex-start;gap:12px;background:rgba(255,255,255,.03);border:1px solid var(--border);border-radius:14px;padding:14px;margin-bottom:16px}
    .favicon{width:38px;height:38px;border-radius:8px;flex-shrink:0;object-fit:contain;background:#fff;padding:3px}
    .site-body{min-width:0;flex:1}
    .site-title{font-size:.97rem;font-weight:700;line-height:1.3;margin-bottom:3px;word-break:break-word}
    .site-desc{font-size:.78rem;color:var(--muted);line-height:1.5;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
    .domain-badge{display:inline-flex;align-items:center;gap:4px;margin-top:6px;font-size:.72rem;font-weight:600;color:var(--accent2);background:rgba(124,58,237,.1);border:1px solid rgba(124,58,237,.2);padding:2px 9px;border-radius:20px}
    .url-box{background:rgba(0,0,0,.3);border:1px solid var(--border);border-radius:9px;padding:9px 13px;font-size:.75rem;color:var(--muted);word-break:break-all;margin-bottom:20px;font-family:monospace}
    .prog-wrap{margin-bottom:18px}
    .prog-label{display:flex;justify-content:space-between;font-size:.78rem;color:var(--muted);margin-bottom:7px}
    .prog-bar{height:3px;background:rgba(255,255,255,.07);border-radius:99px;overflow:hidden}
    .prog-fill{height:100%;background:linear-gradient(90deg,#7c3aed,#ec4899);border-radius:99px;transition:width 1s linear}
    .actions{display:flex;gap:10px}
    .btn-go{flex:1;padding:13px;border-radius:12px;font-family:var(--font);font-size:.95rem;font-weight:700;background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff;border:none;cursor:pointer;transition:all .2s;box-shadow:0 4px 20px rgba(124,58,237,.35)}
    .btn-go:hover{transform:translateY(-2px);box-shadow:0 6px 28px rgba(124,58,237,.5)}
    .btn-back{padding:13px 18px;border-radius:12px;font-family:var(--font);font-size:.88rem;font-weight:600;background:rgba(255,255,255,.05);color:var(--muted);border:1px solid var(--border);cursor:pointer;transition:all .2s;display:flex;align-items:center}
    .btn-back:hover{background:rgba(255,255,255,.08);color:var(--text)}
    .powered{text-align:center;margin-top:18px;font-size:.72rem;color:var(--muted)}
    .powered a{color:var(--accent2);text-decoration:none}
    .powered a:hover{text-decoration:underline}
  </style>
</head>
<body>
  <div class="orbs"><div class="orb orb-1"></div><div class="orb orb-2"></div></div>
  <div class="card">
    <div class="logo">
      <span class="icon">🔗</span>Link<span class="accent">Curto</span>
    </div>
    <p class="label">Você está sendo redirecionado para</p>
    ${ogImage ? `<img class="og-img" src="${ogImage}" alt="Preview" loading="lazy" onerror="this.style.display='none'"/>` : ''}
    <div class="site">
      <img class="favicon" src="${escapeHtml(favicon)}" alt="" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Ctext y=%22.9em%22 font-size=%2290%22%3E%F0%9F%8C%90%3C/text%3E%3C/svg%3E'"/>
      <div class="site-body">
        <div class="site-title">${title}</div>
        ${desc ? `<div class="site-desc">${desc}</div>` : ''}
        <div class="domain-badge">🌐 ${escapeHtml(domain)}</div>
      </div>
    </div>
    <div class="url-box">${escapeHtml(link.original_url)}</div>
    <div class="prog-wrap">
      <div class="prog-label">
        <span>Redirecionando automaticamente…</span>
        <strong id="ct">5s</strong>
      </div>
      <div class="prog-bar"><div class="prog-fill" id="pf"></div></div>
    </div>
    <div class="actions">
      <button class="btn-go" id="btn-go">Ir agora →</button>
      <button class="btn-back" onclick="history.length>1?history.back():window.close()">← Voltar</button>
    </div>
    <p class="powered">Encurtado com <a href="${escapeHtml(BASE_URL)}" target="_blank">LinkCurto</a></p>
  </div>
  <script>
    var D = ${linkDataJSON};
    document.getElementById('btn-go').onclick = function(){ window.location.href = D.goUrl; };
    var n = 5, pf = document.getElementById('pf'), ct = document.getElementById('ct');
    var t = setInterval(function(){
      n--; ct.textContent = n + 's';
      pf.style.width = (n / 5 * 100) + '%';
      if (n <= 0){ clearInterval(t); window.location.href = D.goUrl; }
    }, 1000);
  </script>
</body>
</html>`;
}

// ─── API: Shorten ─────────────────────────────────────────────────────────────
app.post('/api/shorten', requireAuth, async (req, res) => {
  const { original_url, custom_slug, expires_at, max_clicks } = req.body;
  if (!original_url) return res.status(400).json({ error: 'URL é obrigatória.' });
  if (!isValidUrl(original_url)) return res.status(400).json({ error: 'URL inválida. Use http:// ou https://' });

  const user = req.session.user;
  const plan = await getUserPlan(user);
  const countRow = (user.id === 0)
    ? await db.get('SELECT COUNT(*) as count FROM links')
    : await db.get('SELECT COUNT(*) as count FROM links WHERE user_id = ?', [user.id]);
  const currentCount = countRow?.count || 0;

  // 1. Limite de links ativos pelo plano
  if (plan.maxLinks !== Infinity && currentCount >= plan.maxLinks) {
    return res.status(403).json({
      error: `Você atingiu o limite de ${plan.maxLinks} link ativo no Plano ${plan.name}. Faça upgrade para criar mais!`,
      upgradeRequired: true,
      currentPlan: plan.id,
      suggestedPlan: 'pro'
    });
  }

  // 2. Slug customizado (bloqueado no Free)
  if (custom_slug && !plan.customSlug) {
    return res.status(403).json({
      error: 'Slugs personalizados estão disponíveis a partir do Plano Pro (R$ 9,90).',
      upgradeRequired: true,
      currentPlan: plan.id,
      suggestedPlan: 'pro'
    });
  }

  // 3. Opções avançadas (expiração ou limite manual) exclusivas do Master
  if ((expires_at || max_clicks) && !plan.advancedOptions) {
    return res.status(403).json({
      error: 'Data de expiração e limite manual de cliques são recursos exclusivos do Plano Master (R$ 19,90).',
      upgradeRequired: true,
      currentPlan: plan.id,
      suggestedPlan: 'master'
    });
  }

  let slug = custom_slug ? custom_slug.trim() : generateSlug();
  if (custom_slug) {
    if (!/^[a-zA-Z0-9_-]+$/.test(slug)) return res.status(400).json({ error: 'Slug inválido. Use apenas letras, números, - e _' });
    if (slug.length < 3 || slug.length > 50) return res.status(400).json({ error: 'Slug deve ter entre 3 e 50 caracteres.' });
    if (RESERVED_SLUGS.has(slug.toLowerCase())) return res.status(400).json({ error: 'Esse slug é reservado pelo sistema.' });
  }

  const existingSlug = await db.get('SELECT id FROM links WHERE slug = ?', [slug]);
  if (existingSlug) return res.status(409).json({ error: 'Esse slug já está em uso. Escolha outro.' });

  // Teto de cliques conforme o plano se não especificado
  let effectiveMaxClicks = max_clicks ? parseInt(max_clicks) : null;
  if (!effectiveMaxClicks && plan.maxClicksPerLink !== Infinity) {
    effectiveMaxClicks = plan.maxClicksPerLink; // 100 cliques no Free, 5000 no Pro
  }

  try {
    const info = await db.run(
      'INSERT INTO links (original_url, slug, expires_at, max_clicks, user_id) VALUES (?, ?, ?, ?, ?)',
      [original_url, slug, expires_at || null, effectiveMaxClicks, user.id || null]
    );
    const newLink = await db.get('SELECT * FROM links WHERE id = ?', [info.lastInsertRowid]);

    // Pre-fetch OG data in background (non-blocking)
    fetchOGData(original_url).then(async og => {
      if (og) await db.run('UPDATE links SET og_data = ? WHERE id = ?', [JSON.stringify(og), info.lastInsertRowid]);
    }).catch(() => {});

    res.status(201).json({ ...newLink, short_url: `${BASE_URL}/${newLink.slug}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno ao criar o link.' });
  }
});

// ─── API: List links ──────────────────────────────────────────────────────────
app.get('/api/links', requireAuth, async (req, res) => {
  const user = req.session.user;
  const links = (user.id === 0)
    ? await db.all('SELECT * FROM links ORDER BY created_at DESC')
    : await db.all('SELECT * FROM links WHERE user_id = ? ORDER BY created_at DESC', [user.id]);
  res.json(links.map(l => ({ ...l, short_url: `${BASE_URL}/${l.slug}` })));
});

// ─── API: Export CSV ─────────────────────────────────────────────────────────
app.get('/api/links/export/csv', requireAuth, async (req, res) => {
  const user = req.session.user;
  const plan = await getUserPlan(user);
  if (!plan.exportCsv) {
    return res.status(403).json({
      error: 'A exportação para CSV está disponível a partir do Plano Pro (R$ 9,90).',
      upgradeRequired: true,
      suggestedPlan: 'pro'
    });
  }

  const links = (user.id === 0)
    ? await db.all('SELECT * FROM links ORDER BY created_at DESC')
    : await db.all('SELECT * FROM links WHERE user_id = ? ORDER BY created_at DESC', [user.id]);

  const headers = ['ID', 'Slug', 'URL Curta', 'URL Original', 'Cliques', 'Limite Cliques', 'Expira Em', 'Criado Em'];
  const rows = links.map(l => [
    l.id,
    `"${(l.slug || '').replace(/"/g, '""')}"`,
    `"${BASE_URL}/${(l.slug || '').replace(/"/g, '""')}"`,
    `"${(l.original_url || '').replace(/"/g, '""')}"`,
    l.clicks || 0,
    l.max_clicks != null ? l.max_clicks : '',
    l.expires_at || '',
    l.created_at || ''
  ]);
  const csv = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="linkcurto_links.csv"');
  res.send(csv);
});

// ─── API: Export CSV (alias) ──────────────────────────────────────────────────
app.get('/api/export/csv', requireAuth, (req, res) => res.redirect(307, '/api/links/export/csv'));

// ─── API: Delete link ─────────────────────────────────────────────────────────
app.delete('/api/links/:id', requireAuth, async (req, res) => {
  const user = req.session.user;
  const link = (user.id === 0)
    ? await db.get('SELECT id FROM links WHERE id = ?', [req.params.id])
    : await db.get('SELECT id FROM links WHERE id = ? AND user_id = ?', [req.params.id, user.id]);

  if (!link) return res.status(404).json({ error: 'Link não encontrado.' });
  await db.run('DELETE FROM links WHERE id = ?', [req.params.id]);
  res.json({ message: 'Link excluído com sucesso.' });
});

// ─── API: Analytics ───────────────────────────────────────────────────────────
app.get('/api/links/:id/analytics', requireAuth, async (req, res) => {
  const user = req.session.user;
  const link = (user.id === 0)
    ? await db.get('SELECT * FROM links WHERE id = ?', [req.params.id])
    : await db.get('SELECT * FROM links WHERE id = ? AND user_id = ?', [req.params.id, user.id]);

  if (!link) return res.status(404).json({ error: 'Link não encontrado.' });

  const rows = await db.all(`
    SELECT DATE(clicked_at) as date, COUNT(*) as clicks
    FROM clicks_log WHERE link_id = ? AND clicked_at >= DATE('now', '-29 days')
    GROUP BY DATE(clicked_at) ORDER BY date ASC
  `, [req.params.id]);

  const map = Object.fromEntries(rows.map(r => [r.date, r.clicks]));
  const daily = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (29 - i));
    const date = d.toISOString().split('T')[0];
    return { date, clicks: map[date] || 0 };
  });

  res.json({ link: { ...link, short_url: `${BASE_URL}/${link.slug}` }, daily, total: link.clicks });
});

// ─── API: QR Code ─────────────────────────────────────────────────────────────
app.get('/api/links/:id/qr', requireAuth, async (req, res) => {
  const user = req.session.user;
  const link = (user.id === 0)
    ? await db.get('SELECT * FROM links WHERE id = ?', [req.params.id])
    : await db.get('SELECT * FROM links WHERE id = ? AND user_id = ?', [req.params.id, user.id]);

  if (!link) return res.status(404).json({ error: 'Link não encontrado.' });
  try {
    const shortUrl = `${BASE_URL}/${link.slug}`;
    const qr = await QRCode.toDataURL(shortUrl, { width: 280, margin: 2, color: { dark: '#7c3aed', light: '#ffffff' } });
    res.json({ qr, short_url: shortUrl });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erro ao gerar QR Code.' }); }
});

// ─── Public: OG preview data (no auth) ───────────────────────────────────────
app.get('/api/preview/:id', async (req, res) => {
  const link = await db.get('SELECT id, original_url, og_data FROM links WHERE id = ?', [req.params.id]);
  if (!link) return res.status(404).json({ error: 'Link não encontrado.' });

  if (link.og_data) {
    try { return res.json(JSON.parse(link.og_data)); } catch {}
  }

  const og = await fetchOGData(link.original_url);
  if (og) {
    await db.run('UPDATE links SET og_data = ? WHERE id = ?', [JSON.stringify(og), link.id]);
  }
  const domain = (() => { try { return new URL(link.original_url).hostname; } catch { return link.original_url; } })();
  res.json(og || { title: domain, description: null, image: null, domain });
});

// ─── Redirect + Preview ───────────────────────────────────────────────────────
app.get('/:slug', async (req, res) => {
  const link = await db.get('SELECT * FROM links WHERE slug = ?', [req.params.slug]);
  if (!link) return res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
  if (isExpired(link)) return res.status(410).sendFile(path.join(__dirname, 'public', '404.html'));

  const plan = await getCurrentPlan();

  // Se for redirecionamento direto, ou se o plano não tiver página rica de preview (exclusiva do Master)
  if (req.query.go === '1' || !plan.previewPage) {
    await db.run('INSERT INTO clicks_log (link_id) VALUES (?)', [link.id]);
    await db.run('UPDATE links SET clicks = clicks + 1 WHERE id = ?', [link.id]);
    return res.redirect(302, link.original_url);
  }

  // No Master, serve a página de preview com dados OG
  let ogData = null;
  if (link.og_data) {
    try { ogData = JSON.parse(link.og_data); } catch {}
  }
  if (!ogData) {
    const domain = (() => { try { return new URL(link.original_url).hostname; } catch { return link.original_url; } })();
    ogData = { title: domain, description: null, image: null, domain };
    fetchOGData(link.original_url).then(async og => {
      if (og) await db.run('UPDATE links SET og_data = ? WHERE id = ?', [JSON.stringify(og), link.id]);
    }).catch(() => {});
  }

  res.send(buildPreviewHTML(link, ogData));
});

// ─── Start (se rodar standalone) ──────────────────────────────────────────────
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n🔗 LinkCurto rodando em ${BASE_URL}`);
    console.log(`👤 Login: ${ADMIN_USER} / ${ADMIN_PASS}\n`);
  });
}

module.exports = app;
