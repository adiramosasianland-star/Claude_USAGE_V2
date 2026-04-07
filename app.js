const SUPABASE_URL = 'https://xihjreochxbzpgmpppzr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_dQK0SimPFn9YpIcDIflKWA_W32818kP';
const API = `${SUPABASE_URL}/rest/v1/accounts`;
const AUTH_URL = `${SUPABASE_URL}/auth/v1`;

let currentSession = null;
let accountToDelete = null;

// ── AUTH HEADERS ──────────────────────────────────────────────────────────────

function getHeaders(session = currentSession) {
    return {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${session ? session.access_token : SUPABASE_KEY}`,
    };
}

// ── THEME ─────────────────────────────────────────────────────────────────────

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const light = document.getElementById('themeIconLight');
    const dark  = document.getElementById('themeIconDark');
    if (light && dark) {
        light.style.display = theme === 'dark' ? 'none' : '';
        dark.style.display  = theme === 'dark' ? '' : 'none';
    }
    localStorage.setItem('theme', theme);
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    applyTheme(current === 'light' ? 'dark' : 'light');
}

// ── INIT ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
    // Restore theme
    const savedTheme = localStorage.getItem('theme') || 'light';
    applyTheme(savedTheme);

    await restoreSession();

    // Lucide icons
    if (window.lucide) lucide.createIcons();

    // Time buttons
    document.querySelectorAll('.time-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            document.getElementById('cooldownHour').value = btn.dataset.hour;
        });
    });

    // Close modals on backdrop click
    window.addEventListener('click', e => {
        if (e.target.classList.contains('modal')) {
            closeAddModal();
            closeCooldownModal();
            closeDeleteModal();
        }
    });

    // Login on Enter
    document.getElementById('loginForm').addEventListener('keydown', e => {
        if (e.key === 'Enter') login();
    });
});

// ── SESSION ───────────────────────────────────────────────────────────────────

async function restoreSession() {
    const stored = localStorage.getItem('sb_session');
    if (!stored) return showLogin();

    const session = JSON.parse(stored);

    if (Date.now() / 1000 > session.expires_at) {
        const refreshed = await refreshSession(session.refresh_token);
        if (!refreshed) return showLogin();
    } else {
        currentSession = session;
        await showApp();
    }
}

async function refreshSession(refresh_token) {
    try {
        const res = await fetch(`${AUTH_URL}/token?grant_type=refresh_token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
            body: JSON.stringify({ refresh_token }),
        });
        if (!res.ok) return false;
        const data = await res.json();
        currentSession = data;
        localStorage.setItem('sb_session', JSON.stringify(data));
        await showApp();
        return true;
    } catch {
        return false;
    }
}

// ── LOGIN / LOGOUT ────────────────────────────────────────────────────────────

async function login() {
    const email    = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const btn      = document.getElementById('loginBtn');
    const error    = document.getElementById('loginError');

    if (!email || !password) {
        error.textContent = 'Please enter your email and password.';
        return;
    }

    btn.textContent = 'Signing in...';
    btn.disabled = true;
    error.textContent = '';

    try {
        const res = await fetch(`${AUTH_URL}/token?grant_type=password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
            body: JSON.stringify({ email, password }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error_description || data.msg || 'Login failed');

        currentSession = data;
        localStorage.setItem('sb_session', JSON.stringify(data));
        await showApp();
    } catch (err) {
        error.textContent = err.message;
    } finally {
        btn.textContent = 'Sign in';
        btn.disabled = false;
    }
}

async function logout() {
    try {
        await fetch(`${AUTH_URL}/logout`, {
            method: 'POST',
            headers: getHeaders(),
        });
    } catch {}

    currentSession = null;
    localStorage.removeItem('sb_session');
    showLogin();
}

// ── UI TOGGLE ─────────────────────────────────────────────────────────────────

function showLogin() {
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('appScreen').style.display   = 'none';
}

async function showApp() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appScreen').style.display   = 'block';

    await checkAdminStatus();

    if (window.lucide) lucide.createIcons();

    loadAccounts();
    setInterval(loadAccounts, 30000);
}

// ── ADMIN CHECK ───────────────────────────────────────────────────────────────

async function checkAdminStatus() {
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=is_admin`, {
            headers: getHeaders(),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.length && data[0].is_admin) {
            const link = document.getElementById('usersNavLink');
            if (link) link.style.display = 'inline-flex';
        }
    } catch {}
}

// ── DATA ──────────────────────────────────────────────────────────────────────

async function loadAccounts() {
    try {
        const res = await fetch(`${API}?select=*&order=cooldown_until.asc.nullsfirst`, {
            headers: getHeaders(),
        });
        if (res.status === 401) return logout();
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        renderAccounts(data);
    } catch (err) {
        showToast('Failed to load accounts: ' + err.message, 'error');
    }
}

async function addAccount() {
    const email = document.getElementById('newEmail').value.trim();
    if (!email) return showToast('Email is required', 'error');

    try {
        const res = await fetch(API, {
            method: 'POST',
            headers: { ...getHeaders(), 'Prefer': 'return=minimal' },
            body: JSON.stringify({ email }),
        });
        if (res.status === 401) return logout();
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.message || 'Failed to add account');
        }
        closeAddModal();
        document.getElementById('newEmail').value = '';
        showToast('Account added');
        loadAccounts();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function confirmDelete() {
    if (!accountToDelete) return;
    try {
        const res = await fetch(`${API}?id=eq.${accountToDelete}`, {
            method: 'DELETE',
            headers: getHeaders(),
        });
        if (res.status === 401) return logout();
        if (!res.ok) throw new Error('Failed to delete');
        closeDeleteModal();
        showToast('Account deleted');
        loadAccounts();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function setCooldown() {
    const id   = document.getElementById('cooldownId').value;
    const date = document.getElementById('cooldownDate').value;
    const hour = document.getElementById('cooldownHour').value;

    if (!date) return showToast('Please select a date', 'error');
    if (hour === '') return showToast('Please select a time', 'error');

    const hourPadded    = String(hour).padStart(2, '0');
    const cooldown_until = new Date(`${date}T${hourPadded}:00:00`).toISOString();

    try {
        const res = await fetch(`${API}?id=eq.${id}`, {
            method: 'PATCH',
            headers: { ...getHeaders(), 'Prefer': 'return=minimal' },
            body: JSON.stringify({ cooldown_until }),
        });
        if (res.status === 401) return logout();
        if (!res.ok) throw new Error('Failed to set cooldown');
        closeCooldownModal();
        showToast('Cooldown set');
        loadAccounts();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function clearCooldown(id) {
    try {
        const res = await fetch(`${API}?id=eq.${id}`, {
            method: 'PATCH',
            headers: { ...getHeaders(), 'Prefer': 'return=minimal' },
            body: JSON.stringify({ cooldown_until: null }),
        });
        if (res.status === 401) return logout();
        if (!res.ok) throw new Error('Failed to clear cooldown');
        showToast('Cooldown cleared');
        loadAccounts();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ── RENDER ────────────────────────────────────────────────────────────────────

function renderAccounts(accounts) {
    const grid    = document.getElementById('accountsGrid');
    const countEl = document.getElementById('accountCount');

    if (!accounts.length) {
        grid.innerHTML = `
            <div class="empty-state">
                <h3>No accounts yet</h3>
                <p>Add an account to get started</p>
            </div>`;
        if (countEl) countEl.textContent = '0 accounts';
        return;
    }

    const available = accounts.filter(a => getAccountStatus(a).type === 'available').length;
    if (countEl) countEl.textContent = `${available} available · ${accounts.length} total`;

    grid.innerHTML = accounts.map((account, i) => {
        const status = getAccountStatus(account);
        return `
            <div class="account-card ${status.type}" style="animation-delay:${i * 35}ms">
                <div class="card-top">
                    <div class="account-email">${escapeHtml(account.email)}</div>
                    <div class="status-pip ${status.type}"></div>
                </div>
                <div class="card-status">
                    <div class="status-label ${status.type}">${status.label}</div>
                    ${status.countdown  ? `<div class="status-info">${status.countdown}</div>`  : ''}
                    ${status.usageInfo  ? `<div class="status-info">${status.usageInfo}</div>`  : ''}
                </div>
                <div class="card-actions">
                    ${status.canUse     ? `<button class="btn btn-ghost btn-sm" onclick="openCooldownModal(${account.id})"><i data-lucide="clock" style="width:12px;height:12px;"></i> Set cooldown</button>` : ''}
                    ${status.hasCooldown ? `<button class="btn btn-warning btn-sm" onclick="clearCooldown(${account.id})"><i data-lucide="x" style="width:12px;height:12px;"></i> Clear</button>` : ''}
                    <button class="btn btn-danger btn-sm" onclick="openDeleteModal(${account.id})"><i data-lucide="trash-2" style="width:12px;height:12px;"></i> Delete</button>
                </div>
            </div>`;
    }).join('');

    if (window.lucide) lucide.createIcons();
}

function getAccountStatus(account) {
    const now          = new Date();
    const cooldownUntil = account.cooldown_until ? new Date(account.cooldown_until) : null;

    if (cooldownUntil && cooldownUntil > now) {
        const diff    = cooldownUntil - now;
        const hours   = Math.floor(diff / 1000 / 60 / 60);
        const minutes = Math.floor((diff / 1000 / 60) % 60);
        return {
            type: 'cooldown',
            label: 'Unavailable',
            canUse: false,
            hasCooldown: true,
            countdown: `Available ${formatDateTime(cooldownUntil)} · ${hours}h ${minutes}m`,
            usageInfo: null,
        };
    }

    return {
        type: 'available',
        label: 'Available',
        canUse: true,
        hasCooldown: false,
        countdown: null,
        usageInfo: cooldownUntil ? `Last cooldown ended ${formatDateTime(cooldownUntil)}` : 'Never used',
    };
}

// ── MODALS ────────────────────────────────────────────────────────────────────

function showAddModal()    { document.getElementById('addModal').classList.add('active'); }
function closeAddModal()   { document.getElementById('addModal').classList.remove('active'); }

function openCooldownModal(id) {
    document.getElementById('cooldownId').value   = id;
    document.getElementById('cooldownDate').value = new Date().toISOString().split('T')[0];
    document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('selected'));
    document.getElementById('cooldownHour').value = '';
    document.getElementById('cooldownModal').classList.add('active');
}

function closeCooldownModal() { document.getElementById('cooldownModal').classList.remove('active'); }

function openDeleteModal(id) {
    accountToDelete = id;
    document.getElementById('deleteModal').classList.add('active');
}

function closeDeleteModal() {
    accountToDelete = null;
    document.getElementById('deleteModal').classList.remove('active');
}

// ── UTILS ─────────────────────────────────────────────────────────────────────

function formatDateTime(date) {
    return date.toLocaleString('en-US', {
        month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true,
    });
}

function escapeHtml(text) {
    return text.replace(/[&<>"']/g, m => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]
    ));
}

let toastTimer;
function showToast(msg, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.className   = `toast show${type === 'error' ? ' error' : ''}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.className = 'toast'; }, 3000);
}
