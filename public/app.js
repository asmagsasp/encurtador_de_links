/* ============================================
   APP.JS — LinkCurto Frontend Logic
   ============================================ */

const API = '';

// ============================================
//   AUTH CHECK
// ============================================

async function checkAuth() {
  try {
    const res = await fetch('/auth/me');
    if (!res.ok) { window.location.replace('/login.html'); return false; }
    const data = await res.json();
    const el = document.getElementById('header-user');
    if (el) el.textContent = `👤 ${data.user.username}`;
    return true;
  } catch {
    window.location.replace('/login.html');
    return false;
  }
}

// ============================================
//   DOM Elements
// ============================================

const originalUrlInput = document.getElementById('original-url');
const customSlugInput  = document.getElementById('custom-slug');
const slugPrefix       = document.getElementById('slug-prefix');
if (slugPrefix) slugPrefix.textContent = window.location.host + '/';
const clearUrlBtn      = document.getElementById('clear-url');
const shortenBtn       = document.getElementById('shorten-btn');
const btnText          = shortenBtn.querySelector('.btn-text');
const btnLoader        = shortenBtn.querySelector('.btn-loader');
const btnIcon          = shortenBtn.querySelector('.btn-icon');
const errorMsg         = document.getElementById('error-msg');
const errorText        = document.getElementById('error-text');
const resultBox        = document.getElementById('result-box');
const resultLink       = document.getElementById('result-link');
const resultOriginal   = document.getElementById('result-original');
const copyBtn          = document.getElementById('copy-btn');
const copyText         = copyBtn.querySelector('.copy-text');
const qrResultBtn      = document.getElementById('qr-result-btn');
const refreshBtn       = document.getElementById('refresh-btn');
const linksTableBody   = document.getElementById('links-tbody');
const tableWrapper     = document.getElementById('table-wrapper');
const emptyState       = document.getElementById('empty-state');
const loadingState     = document.getElementById('loading-state');
const statTotal        = document.getElementById('stat-total');
const statClicks       = document.getElementById('stat-clicks');
const toast            = document.getElementById('toast');
const logoutBtn        = document.getElementById('logout-btn');
const exportBtn        = document.getElementById('export-btn');
const advancedToggle   = document.getElementById('advanced-toggle');
const advancedPanel    = document.getElementById('advanced-panel');
const advancedArrow    = document.getElementById('advanced-arrow');
const expiresAtInput   = document.getElementById('expires-at');
const maxClicksInput   = document.getElementById('max-clicks');

// Delete modal
const modalOverlay = document.getElementById('modal-overlay');
const modalCancel  = document.getElementById('modal-cancel');
const modalConfirm = document.getElementById('modal-confirm');

// Analytics modal
const analyticsModal = document.getElementById('analytics-modal');
const analyticsClose = document.getElementById('analytics-close');
const analyticsMeta  = document.getElementById('analytics-meta');
const analyticsStats = document.getElementById('analytics-stats');

// QR modal
const qrModal    = document.getElementById('qr-modal');
const qrClose    = document.getElementById('qr-close');
const qrImage    = document.getElementById('qr-image');
const qrUrl      = document.getElementById('qr-url');
const qrCopyBtn  = document.getElementById('qr-copy-btn');
const qrDownload = document.getElementById('qr-download');

let pendingDeleteId = null;
let toastTimer = null;
let analyticsChart = null;
let currentResultLinkId = null;
let currentLinks = [];
let currentPlanData = null;
let currentPlanUsage = null;
let selectedCheckoutPlan = null;

// Plan & Pricing elements
const planBadgeBtn     = document.getElementById('plan-badge-btn');
const headerPlanName   = document.getElementById('header-plan-name');
const planCrown        = document.getElementById('plan-crown');
const openPlansBtn     = document.getElementById('open-plans-btn');
const quotaBanner      = document.getElementById('quota-banner');
const quotaIcon        = document.getElementById('quota-icon');
const quotaText        = document.getElementById('quota-text');
const quotaUpgradeBtn  = document.getElementById('quota-upgrade-btn');

// Pricing Modal elements
const pricingModal     = document.getElementById('pricing-modal');
const pricingClose     = document.getElementById('pricing-close');
const btnSelectFree    = document.getElementById('btn-select-free');
const btnSelectPro     = document.getElementById('btn-select-pro');
const btnSelectMaster  = document.getElementById('btn-select-master');

// Checkout Modal elements
const checkoutModal    = document.getElementById('checkout-modal');
const checkoutClose    = document.getElementById('checkout-close');
const checkoutCancel   = document.getElementById('checkout-cancel');
const checkoutPlanName = document.getElementById('checkout-plan-name');
const checkoutPlanPrice= document.getElementById('checkout-plan-price');
const checkoutPlanDesc = document.getElementById('checkout-plan-desc');
const payPixTab        = document.getElementById('pay-pix-tab');
const payCardTab       = document.getElementById('pay-card-tab');
const panelPix         = document.getElementById('panel-pix');
const panelCard        = document.getElementById('panel-card');
const btnCopyPix       = document.getElementById('btn-copy-pix');
const btnConfirmUpgrade= document.getElementById('btn-confirm-upgrade');

// ============================================
//   UTILITIES
// ============================================

function showToast(message, duration = 3000) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
}

function showError(msg) { errorText.textContent = msg; errorMsg.hidden = false; }
function hideError()    { errorMsg.hidden = true; }

function setLoading(isLoading) {
  shortenBtn.disabled = isLoading;
  btnText.hidden   = isLoading;
  btnLoader.hidden = !isLoading;
  btnIcon.hidden   = isLoading;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function truncate(str, max = 55) {
  return str.length > max ? str.slice(0, max) + '…' : str;
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const el = document.createElement('textarea');
    el.value = text;
    el.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.appendChild(el);
    el.focus(); el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  }
}

function animateNumber(el, target) {
  const start = parseInt(el.textContent) || 0;
  const diff = target - start;
  if (diff === 0) return;
  const duration = 600;
  const startTime = performance.now();
  function step(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(start + diff * ease);
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function isLinkExpired(link) {
  if (link.expires_at && new Date(link.expires_at) < new Date()) return true;
  if (link.max_clicks && link.clicks >= link.max_clicks) return true;
  return false;
}

// ============================================
//   LOGOUT
// ============================================

logoutBtn.addEventListener('click', async () => {
  await fetch('/auth/logout', { method: 'POST' });
  window.location.replace('/login.html');
});

// ============================================
//   EXPORT CSV
// ============================================

exportBtn.addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = '/api/export/csv';
  a.download = '';
  a.click();
  showToast('⬇️ Exportando CSV...');
});

// ============================================
//   ADVANCED OPTIONS TOGGLE
// ============================================

advancedToggle.addEventListener('click', () => {
  const open = advancedPanel.hidden;
  advancedPanel.hidden = !open;
  advancedArrow.textContent = open ? '▲' : '▼';
  advancedToggle.setAttribute('aria-expanded', String(open));
  advancedToggle.classList.toggle('active', open);
});

// ============================================
//   CLEAR URL BUTTON
// ============================================

originalUrlInput.addEventListener('input', () => {
  clearUrlBtn.classList.toggle('visible', originalUrlInput.value.length > 0);
  if (!errorMsg.hidden) hideError();
});

clearUrlBtn.addEventListener('click', () => {
  originalUrlInput.value = '';
  clearUrlBtn.classList.remove('visible');
  originalUrlInput.focus();
});

// ============================================
//   SHORTEN FORM
// ============================================

shortenBtn.addEventListener('click', shortenUrl);
originalUrlInput.addEventListener('keydown', e => { if (e.key === 'Enter') shortenUrl(); });

async function shortenUrl() {
  hideError();
  const originalUrl = originalUrlInput.value.trim();
  const customSlug  = customSlugInput.value.trim();
  const expiresAt   = expiresAtInput.value || null;
  const maxClicks   = maxClicksInput.value ? parseInt(maxClicksInput.value) : null;

  if (!originalUrl) { showError('Por favor, insira uma URL.'); originalUrlInput.focus(); return; }

  setLoading(true);

  try {
    const res = await fetch(`${API}/api/shorten`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        original_url: originalUrl,
        custom_slug: customSlug || undefined,
        expires_at: expiresAt,
        max_clicks: maxClicks,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      showError(data.error || 'Erro ao encurtar a URL.');
      if (data.upgradeRequired) {
        setTimeout(() => openPricingModal(data.suggestedPlan || 'pro'), 900);
      }
      return;
    }

    currentResultLinkId = data.id;
    resultLink.href = data.short_url;
    resultLink.textContent = data.short_url;
    resultOriginal.textContent = '→ ' + truncate(data.original_url, 80);
    resultBox.hidden = false;
    resultBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    copyText.textContent = 'Copiar';
    copyBtn.classList.remove('copied');

    // Limpa inputs
    originalUrlInput.value = '';
    customSlugInput.value  = '';
    expiresAtInput.value   = '';
    maxClicksInput.value   = '';
    clearUrlBtn.classList.remove('visible');

    // Fecha opções avançadas
    advancedPanel.hidden = true;
    advancedArrow.textContent = '▼';
    advancedToggle.setAttribute('aria-expanded', 'false');
    advancedToggle.classList.remove('active');

    await loadLinks();
    await loadPlan();
    showToast('✅ Link encurtado com sucesso!');
  } catch (err) {
    console.error(err);
    showError('Erro de conexão. Verifique se o servidor está rodando.');
  } finally {
    setLoading(false);
  }
}

// ============================================
//   COPY SHORT LINK
// ============================================

copyBtn.addEventListener('click', async () => {
  const ok = await copyToClipboard(resultLink.href);
  if (ok) {
    copyText.textContent = 'Copiado!';
    copyBtn.classList.add('copied');
    showToast('📋 Link copiado para a área de transferência!');
    setTimeout(() => {
      copyText.textContent = 'Copiar';
      copyBtn.classList.remove('copied');
    }, 2500);
  }
});

// ============================================
//   QR CODE (Result Box)
// ============================================

qrResultBtn.addEventListener('click', () => {
  if (currentResultLinkId) openQRModal(currentResultLinkId);
});

// ============================================
//   LOAD LINKS
// ============================================

refreshBtn.addEventListener('click', async () => {
  refreshBtn.classList.add('spinning');
  await loadLinks();
  setTimeout(() => refreshBtn.classList.remove('spinning'), 600);
  showToast('🔄 Lista atualizada!');
});

exportBtn.addEventListener('click', () => {
  if (currentPlanData && !currentPlanData.exportCsv) {
    showToast('🔒 Exportação para CSV requer Plano Pro ou Master!');
    openPricingModal('pro');
    return;
  }
  if (!currentLinks || currentLinks.length === 0) {
    showToast('⚠️ Nenhum link para exportar.');
    return;
  }
  const headers = ['ID', 'Slug', 'URL Curta', 'URL Original', 'Cliques', 'Limite Cliques', 'Expira Em', 'Criado Em'];
  const rows = currentLinks.map(l => [
    l.id,
    `"${(l.slug || '').replace(/"/g, '""')}"`,
    `"${(l.short_url || '').replace(/"/g, '""')}"`,
    `"${(l.original_url || '').replace(/"/g, '""')}"`,
    l.clicks || 0,
    l.max_clicks != null ? l.max_clicks : '',
    l.expires_at || '',
    l.created_at || ''
  ]);
  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `linkcurto_export_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('📥 CSV exportado com sucesso!');
});

async function loadLinks() {
  try {
    const res = await fetch(`${API}/api/links`);
    if (!res.ok) return;
    const links = await res.json();
    currentLinks = links;
    renderLinks(links);
    updateStats(links);
  } catch (err) {
    console.error('Erro ao carregar links:', err);
  }
}

function renderLinks(links) {
  loadingState.hidden = true;

  if (links.length === 0) {
    tableWrapper.hidden = true;
    emptyState.hidden = false;
    return;
  }

  emptyState.hidden = true;
  tableWrapper.hidden = false;

  linksTableBody.innerHTML = links.map(link => {
    const expired = isLinkExpired(link);

    let badge = '';
    if (expired) {
      badge = '<span class="badge badge-expired">Expirado</span>';
    } else if (link.expires_at || link.max_clicks) {
      badge = '<span class="badge badge-expiring">⏰</span>';
    }

    let expiryInfo = '';
    if (link.expires_at) expiryInfo += `<div class="expiry-info">📅 ${formatDate(link.expires_at)}</div>`;
    if (link.max_clicks) expiryInfo += `<div class="expiry-info">👆 máx. ${link.max_clicks} cliques</div>`;

    return `
      <tr data-id="${link.id}" class="${expired ? 'row-expired' : ''}">
        <td class="td-short">
          <a href="${link.short_url}" target="_blank" rel="noopener noreferrer">/${link.slug}</a>
          ${badge}
        </td>
        <td class="td-original" title="${link.original_url}">
          <span class="url-text">${link.original_url}</span>
          ${expiryInfo}
        </td>
        <td class="td-clicks"><span class="badge">👆 ${link.clicks}</span></td>
        <td class="td-date">${formatDate(link.created_at)}</td>
        <td>
          <div class="td-actions">
            <button class="btn-action btn-action-qr"       data-id="${link.id}" title="QR Code"  aria-label="QR Code para /${link.slug}">📷</button>
            <button class="btn-action btn-action-analytics" data-id="${link.id}" title="Analytics" aria-label="Analytics de /${link.slug}">📊</button>
            <button class="btn-action btn-action-copy"     data-url="${link.short_url}" title="Copiar" aria-label="Copiar ${link.short_url}">📋</button>
            <button class="btn-action btn-action-delete"   data-id="${link.id}" title="Excluir"  aria-label="Excluir /${link.slug}">🗑️</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // Event listeners
  linksTableBody.querySelectorAll('.btn-action-copy').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ok = await copyToClipboard(btn.dataset.url);
      if (ok) showToast('📋 Link copiado!');
    });
  });

  linksTableBody.querySelectorAll('.btn-action-delete').forEach(btn => {
    btn.addEventListener('click', () => { pendingDeleteId = btn.dataset.id; modalOverlay.hidden = false; });
  });

  linksTableBody.querySelectorAll('.btn-action-analytics').forEach(btn => {
    btn.addEventListener('click', () => openAnalyticsModal(btn.dataset.id));
  });

  linksTableBody.querySelectorAll('.btn-action-qr').forEach(btn => {
    btn.addEventListener('click', () => openQRModal(btn.dataset.id));
  });
}

function updateStats(links) {
  animateNumber(statTotal, links.length);
  animateNumber(statClicks, links.reduce((s, l) => s + l.clicks, 0));
}

// ============================================
//   DELETE MODAL
// ============================================

modalCancel.addEventListener('click', () => { modalOverlay.hidden = true; pendingDeleteId = null; });
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) { modalOverlay.hidden = true; pendingDeleteId = null; } });

modalConfirm.addEventListener('click', async () => {
  if (!pendingDeleteId) return;
  modalOverlay.hidden = true;
  try {
    const res = await fetch(`${API}/api/links/${pendingDeleteId}`, { method: 'DELETE' });
    if (res.ok) {
      await loadLinks();
      showToast('🗑️ Link excluído com sucesso.');
      if (resultBox && !resultBox.hidden) resultBox.hidden = true;
    } else {
      showToast('Erro ao excluir o link.');
    }
  } catch { showToast('Erro de conexão ao excluir.'); }
  finally { pendingDeleteId = null; }
});

// ============================================
//   ANALYTICS MODAL
// ============================================

analyticsClose.addEventListener('click', closeAnalyticsModal);
analyticsModal.addEventListener('click', e => { if (e.target === analyticsModal) closeAnalyticsModal(); });

function closeAnalyticsModal() {
  analyticsModal.hidden = true;
  if (analyticsChart) { analyticsChart.destroy(); analyticsChart = null; }
}

async function openAnalyticsModal(id) {
  analyticsMeta.innerHTML = '<div class="loading-dots"><span></span><span></span><span></span></div>';
  analyticsStats.innerHTML = '';
  analyticsModal.hidden = false;

  try {
    const res = await fetch(`${API}/api/links/${id}/analytics`);
    const data = await res.json();
    if (!res.ok) { analyticsMeta.innerHTML = `<p style="color:var(--error)">${data.error}</p>`; return; }

    const { link, daily, total } = data;
    const peak = daily.reduce((max, d) => d.clicks > max.clicks ? d : max, { clicks: 0, date: '' });
    const avg  = total > 0 ? (total / 30).toFixed(1) : '0';

    analyticsMeta.innerHTML = `
      <div class="analytics-link-info">
        <div class="analytics-slug">
          <a href="${link.short_url}" target="_blank" rel="noopener noreferrer">${link.short_url}</a>
        </div>
        <div class="analytics-original" title="${link.original_url}">→ ${truncate(link.original_url, 72)}</div>
        ${link.expires_at   ? `<div class="analytics-expiry">⏰ Expira em: ${formatDate(link.expires_at)}</div>` : ''}
        ${link.max_clicks   ? `<div class="analytics-expiry">👆 Máx. cliques: ${link.max_clicks}</div>`         : ''}
      </div>
    `;

    analyticsStats.innerHTML = `
      <div class="analytics-stat-grid">
        <div class="analytics-stat">
          <span class="analytics-stat-value">${total}</span>
          <span class="analytics-stat-label">Total de cliques</span>
        </div>
        <div class="analytics-stat">
          <span class="analytics-stat-value">${peak.clicks}</span>
          <span class="analytics-stat-label">Pico${peak.date ? ` (${peak.date})` : ''}</span>
        </div>
        <div class="analytics-stat">
          <span class="analytics-stat-value">${avg}</span>
          <span class="analytics-stat-label">Média / dia</span>
        </div>
      </div>
    `;

    if (analyticsChart) { analyticsChart.destroy(); analyticsChart = null; }

    const ctx = document.getElementById('analytics-chart').getContext('2d');
    analyticsChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: daily.map(d => {
          const [, m, day] = d.date.split('-');
          return `${day}/${m}`;
        }),
        datasets: [{
          label: 'Cliques',
          data: daily.map(d => d.clicks),
          borderColor: '#a855f7',
          backgroundColor: 'rgba(124, 58, 237, 0.12)',
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#a855f7',
          pointBorderColor: '#7c3aed',
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 7,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#16161f',
            titleColor: '#f1f0fa',
            bodyColor: '#9190a8',
            borderColor: 'rgba(124,58,237,0.4)',
            borderWidth: 1,
            padding: 10,
            callbacks: {
              title: items => daily[items[0].dataIndex].date,
              label: item  => `  ${item.raw} clique${item.raw !== 1 ? 's' : ''}`,
            },
          },
        },
        scales: {
          x: {
            grid: { color: 'rgba(255,255,255,0.04)' },
            ticks: { color: '#9190a8', maxTicksLimit: 10, font: { size: 11 } },
          },
          y: {
            grid: { color: 'rgba(255,255,255,0.04)' },
            ticks: { color: '#9190a8', font: { size: 11 }, precision: 0 },
            beginAtZero: true,
          },
        },
      },
    });
  } catch (err) {
    console.error(err);
    analyticsMeta.innerHTML = '<p style="color:var(--error)">Erro ao carregar analytics.</p>';
  }
}

// ============================================
//   QR MODAL
// ============================================

qrClose.addEventListener('click', () => { qrModal.hidden = true; });
qrModal.addEventListener('click', e => { if (e.target === qrModal) qrModal.hidden = true; });

qrCopyBtn.addEventListener('click', async () => {
  const ok = await copyToClipboard(qrUrl.textContent);
  if (ok) showToast('📋 URL copiada!');
});

async function openQRModal(id) {
  qrImage.src = '';
  qrUrl.textContent = 'Gerando QR Code…';
  qrDownload.removeAttribute('href');
  qrModal.hidden = false;

  try {
    const res  = await fetch(`${API}/api/links/${id}/qr`);
    const data = await res.json();
    if (!res.ok) { qrUrl.textContent = data.error || 'Erro ao gerar QR Code.'; return; }

    qrImage.src = data.qr;
    qrUrl.textContent = data.short_url;
    qrDownload.href = data.qr;
    qrDownload.download = `qr-${data.short_url.split('/').pop()}.png`;
  } catch (err) {
    console.error(err);
    qrUrl.textContent = 'Erro de conexão.';
  }
}

// ============================================
//   PLAN & PRICING LOGIC
// ============================================

async function loadPlan() {
  try {
    const res = await fetch(`${API}/api/plan`);
    if (!res.ok) return;
    const data = await res.json();
    currentPlanData = data.currentPlan;
    currentPlanUsage = data.usage;
    updatePlanUI(currentPlanData, currentPlanUsage);
  } catch (err) {
    console.error('Erro ao carregar plano:', err);
  }
}

function updatePlanUI(plan, usage) {
  if (!plan) return;

  // Header
  headerPlanName.textContent = `Plano ${plan.name}`;
  if (plan.id === 'master') {
    planCrown.textContent = '👑';
    planBadgeBtn.classList.add('vip');
  } else if (plan.id === 'pro') {
    planCrown.textContent = '🔥';
    planBadgeBtn.classList.remove('vip');
  } else {
    planCrown.textContent = '⚡';
    planBadgeBtn.classList.remove('vip');
  }

  // Quota banner
  if (usage) {
    const isLimit = !usage.canCreateMore;
    quotaBanner.classList.toggle('limit-reached', isLimit);

    if (plan.id === 'free') {
      quotaIcon.textContent = '⚡';
      quotaText.innerHTML = `<strong>Plano Free</strong>: ${usage.linksCount} de ${usage.maxLinks} link criado • Limite de 100 cliques`;
      quotaUpgradeBtn.textContent = isLimit ? 'Limite Atingido! Fazer Upgrade 🚀' : 'Fazer Upgrade →';
    } else if (plan.id === 'pro') {
      quotaIcon.textContent = '🔥';
      quotaText.innerHTML = `<strong>Plano Pro</strong>: ${usage.linksCount} de ${usage.maxLinks} links criados • 5.000 cliques/link`;
      quotaUpgradeBtn.textContent = 'Virar Master VIP 👑';
    } else {
      quotaIcon.textContent = '👑';
      quotaText.innerHTML = `<strong>Plano Master VIP</strong>: ${usage.linksCount} links criados • Cliques & Links Ilimitados ♾️`;
      quotaUpgradeBtn.textContent = 'Ver Recursos VIP ⭐';
    }
  }

  // Atualiza botões nos cards de pricing
  [btnSelectFree, btnSelectPro, btnSelectMaster].forEach(btn => {
    btn.classList.remove('current-plan');
  });

  if (plan.id === 'free') {
    btnSelectFree.textContent = 'Plano Atual (Ativo)';
    btnSelectFree.classList.add('current-plan');
    btnSelectPro.textContent = 'Assinar Pro — R$ 9,90';
    btnSelectMaster.textContent = 'Virar Master VIP — R$ 19,90';
  } else if (plan.id === 'pro') {
    btnSelectFree.textContent = 'Mudar para Free (R$ 0)';
    btnSelectPro.textContent = 'Plano Atual (Ativo)';
    btnSelectPro.classList.add('current-plan');
    btnSelectMaster.textContent = 'Upgrade para Master — R$ 19,90';
  } else if (plan.id === 'master') {
    btnSelectFree.textContent = 'Mudar para Free (R$ 0)';
    btnSelectPro.textContent = 'Mudar para Pro (R$ 9,90)';
    btnSelectMaster.textContent = 'Plano Atual VIP (Ativo)';
    btnSelectMaster.classList.add('current-plan');
  }
}

function openPricingModal(highlightPlan) {
  pricingModal.hidden = false;
  if (highlightPlan === 'master') {
    document.getElementById('card-master')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } else if (highlightPlan === 'pro') {
    document.getElementById('card-pro')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function closePricingModal() {
  pricingModal.hidden = true;
}

function openCheckoutModal(planId) {
  selectedCheckoutPlan = planId;
  const plansInfo = {
    free: { name: 'Plano Free', price: 'R$ 0,00', desc: 'Plano básico com 1 link e 100 cliques.' },
    pro: { name: 'Plano Pro 🔥', price: 'R$ 9,90 / mês', desc: '25 links, slugs personalizados, 5.000 cliques e CSV liberado.' },
    master: { name: 'Plano Master VIP 👑', price: 'R$ 19,90 / mês', desc: 'Tudo ilimitado, expiração, preview rico com OG cards e suporte VIP.' }
  };

  const info = plansInfo[planId] || plansInfo.pro;
  checkoutPlanName.textContent = info.name;
  checkoutPlanPrice.textContent = info.price;
  checkoutPlanDesc.textContent = info.desc;

  if (planId === 'free') {
    // Free troca instantaneamente sem tela de pagamento
    executeUpgrade('free');
    return;
  }

  pricingModal.hidden = true;
  checkoutModal.hidden = false;
}

function closeCheckoutModal() {
  checkoutModal.hidden = true;
  selectedCheckoutPlan = null;
}

async function executeUpgrade(planId) {
  try {
    const res = await fetch(`${API}/api/plan/upgrade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: planId }),
    });

    const data = await res.json();
    if (!res.ok) {
      showToast('❌ ' + (data.error || 'Erro ao atualizar plano.'));
      return;
    }

    currentPlanData = data.currentPlan;
    currentPlanUsage = data.usage;
    updatePlanUI(currentPlanData, currentPlanUsage);

    closeCheckoutModal();
    closePricingModal();

    showToast(`🎉 ${data.message || 'Plano ativado com sucesso!'}`, 4500);
    await loadLinks();
  } catch (err) {
    console.error(err);
    showToast('Erro de conexão ao ativar o plano.');
  }
}

// Pricing buttons & modal listeners
openPlansBtn.addEventListener('click', () => openPricingModal());
planBadgeBtn.addEventListener('click', () => openPricingModal());
quotaUpgradeBtn.addEventListener('click', () => openPricingModal());
pricingClose.addEventListener('click', closePricingModal);
pricingModal.addEventListener('click', e => { if (e.target === pricingModal) closePricingModal(); });

btnSelectFree.addEventListener('click', () => openCheckoutModal('free'));
btnSelectPro.addEventListener('click', () => openCheckoutModal('pro'));
btnSelectMaster.addEventListener('click', () => openCheckoutModal('master'));

// Checkout listeners
checkoutClose.addEventListener('click', closeCheckoutModal);
checkoutCancel.addEventListener('click', closeCheckoutModal);
checkoutModal.addEventListener('click', e => { if (e.target === checkoutModal) closeCheckoutModal(); });

payPixTab.addEventListener('click', () => {
  payPixTab.classList.add('active');
  payCardTab.classList.remove('active');
  panelPix.hidden = false;
  panelCard.hidden = true;
});

payCardTab.addEventListener('click', () => {
  payCardTab.classList.add('active');
  payPixTab.classList.remove('active');
  panelCard.hidden = false;
  panelPix.hidden = true;
});

btnCopyPix.addEventListener('click', async () => {
  const pixCode = document.querySelector('.pix-code-text')?.textContent;
  if (pixCode) {
    await copyToClipboard(pixCode);
    btnCopyPix.textContent = 'Copiado!';
    showToast('📋 Código Pix copiado!');
    setTimeout(() => { btnCopyPix.textContent = 'Copiar Código Pix'; }, 2000);
  }
});

btnConfirmUpgrade.addEventListener('click', () => {
  if (selectedCheckoutPlan) {
    btnConfirmUpgrade.disabled = true;
    btnConfirmUpgrade.innerHTML = '<span>⏳ Processando pagamento…</span>';
    setTimeout(async () => {
      await executeUpgrade(selectedCheckoutPlan);
      btnConfirmUpgrade.disabled = false;
      btnConfirmUpgrade.innerHTML = '<span>🚀 Confirmar Pagamento & Ativar</span>';
    }, 700);
  }
});

// ============================================
//   KEYBOARD SHORTCUTS
// ============================================

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!modalOverlay.hidden)   { modalOverlay.hidden = true; pendingDeleteId = null; }
  if (!analyticsModal.hidden) closeAnalyticsModal();
  if (!qrModal.hidden)        qrModal.hidden = true;
  if (!pricingModal.hidden)   closePricingModal();
  if (!checkoutModal.hidden)  closeCheckoutModal();
});

// ============================================
//   INIT
// ============================================

(async () => {
  const ok = await checkAuth();
  if (ok) {
    await loadPlan();
    await loadLinks();
  }
})();
