const SUPABASE_URL = 'https://xihjreochxbzpgmpppzr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_dQK0SimPFn9YpIcDIflKWA_W32818kP';
const API = `${SUPABASE_URL}/rest/v1/accounts`;
const AUTH_URL = `${SUPABASE_URL}/auth/v1`;

let currentSession = null;
let accountToDelete = null;

// ── AUTH HEADERS ─────────────────────────────────────────────────────────────

function getHeaders(session = currentSession) {
    return {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${session ? session.access_token : SUPABASE_KEY}`,
    };
}

// ── INIT ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
    await restoreSession();

    document.querySelectorAll('.time-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            document.getElementById('cooldownHour').value = btn.dataset.hour;
        });
    });

    window.addEventListener('click', e => {
        if (e.target.classList.contains('modal')) {
            closeAddModal(); closeCooldownModal(); closeDeleteModal();
        }
    });

    document.getElementById('loginForm').addEventListener('keydown', e => {
        if (e.key === 'Enter') login();
    });
});

// ── SESSION ───────────────────────────────────────────────────────────────────

async function restoreSession() {
    const stored = localStorage.getItem('sb_session');
    if (!stored) return showLogin();

    const session = JSON.parse(stored);

    // Check if token is expired
    if (Date.now() / 1000 > session.expires_at) {
        const refreshed = await refreshSession(session.refresh_token);
        if (!refreshed) return showLogin();
    } else {
        currentSession = session;
        showApp();
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
        showApp();
        return true;
    } catch {
        return false;
    }
}

// ── LOGIN / LOGOUT ────────────────────────────────────────────────────────────

async function login() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const btn = document.getElementById('loginBtn');
    const error = document.getElementById('loginError');

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
        showApp();
    } catch (err) {
        error.textContent = err.message;
    } finally {
        btn.textContent = 'Sign In';
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
    document.getElementById('appScreen').style.display = 'none';
}

function showApp() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appScreen').style.display = 'block';
    loadAccounts();
    setInterval(loadAccounts, 30000);
}

// ── DATA ──────────────────────────────────────────────────────────────────────

async function loadAccounts() {
    try {
        const res = await fetch(`${API}?select=*&order=cooldown_until.asc.nullsfirst`, { headers: getHeaders() });
        if (res.status === 401) return logout();
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        renderAccounts(data);
    } catch (err) {
        showToast('Failed to load accounts: ' + err.message, true);
    }
}

async function addAccount() {
    const email = document.getElementById('newEmail').value.trim();
    if (!email) return showToast('Email is required', true);

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
        showToast(err.message, true);
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
        showToast(err.message, true);
    }
}

async function setCooldown() {
    const id = document.getElementById('cooldownId').value;
    const date = document.getElementById('cooldownDate').value;
    const hour = document.getElementById('cooldownHour').value;

    if (!date) return showToast('Please select a date', true);
    if (hour === '') return showToast('Please select a time', true);

    const hourPadded = String(hour).padStart(2, '0');
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
        showToast(err.message, true);
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
        showToast(err.message, true);
    }
}

// ── RENDER ────────────────────────────────────────────────────────────────────

function renderAccounts(accounts) {
    const grid = document.getElementById('accountsGrid');
    const countEl = document.getElementById('accountCount');

    if (!accounts.length) {
        grid.innerHTML = `<div class="empty-state"><h3>No accounts yet</h3><p>Add an account to get started</p></div>`;
        if (countEl) countEl.textContent = '0 accounts';
        return;
    }

    const available = accounts.filter(a => getAccountStatus(a).class === 'available').length;
    if (countEl) countEl.textContent = `${available} available / ${accounts.length} total`;

    grid.innerHTML = accounts.map((account, i) => {
        const status = getAccountStatus(account);
        return `
            <div class="account-card ${status.class}" style="animation-delay:${i * 40}ms">
                <div class="card-top">
                    <div class="account-email">${escapeHtml(account.email)}</div>
                    <div class="status-dot ${status.class}"></div>
                </div>
                <div class="card-status">
                    <div class="status-label ${status.class}">${status.label}</div>
                    ${status.countdown ? `<div class="status-info">${status.countdown}</div>` : ''}
                    ${status.usageInfo ? `<div class="status-info">${status.usageInfo}</div>` : ''}
                </div>
                <div class="card-actions">
                    ${status.canUse ? `<button class="btn btn-ghost btn-sm" onclick="openCooldownModal(${account.id})">Set cooldown</button>` : ''}
                    ${status.hasCooldown ? `<button class="btn btn-warning btn-sm" onclick="clearCooldown(${account.id})">Clear</button>` : ''}
                    <button class="btn btn-danger btn-sm" onclick="openDeleteModal(${account.id})">Delete</button>
                </div>
            </div>
        `;
    }).join('');
}

function getAccountStatus(account) {
    const now = new Date();
    const cooldownUntil = account.cooldown_until ? new Date(account.cooldown_until) : null;

    if (cooldownUntil && cooldownUntil > now) {
        const diff = cooldownUntil - now;
        const hours = Math.floor(diff / 1000 / 60 / 60);
        const minutes = Math.floor((diff / 1000 / 60) % 60);
        return {
            class: 'cooldown',
            label: 'Unavailable',
            canUse: false,
            hasCooldown: true,
            countdown: `Available at ${formatDateTime(cooldownUntil)} (${hours}h ${minutes}m)`,
            usageInfo: null,
        };
    }

    return {
        class: 'available',
        label: 'Available',
        canUse: true,
        hasCooldown: false,
        countdown: null,
        usageInfo: cooldownUntil ? `Cooldown ended: ${formatDateTime(cooldownUntil)}` : 'Never used',
    };
}

// ── MODALS ────────────────────────────────────────────────────────────────────

function showAddModal() { document.getElementById('addModal').classList.add('active'); }
function closeAddModal() { document.getElementById('addModal').classList.remove('active'); }

function openCooldownModal(id) {
    document.getElementById('cooldownId').value = id;
    const today = new Date();
    document.getElementById('cooldownDate').value = today.toISOString().split('T')[0];
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
    return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
}

function escapeHtml(text) {
    return text.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
}

let toastTimer;
function showToast(msg, isError = false) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.className = 'toast show' + (isError ? ' error' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.className = 'toast', 3000);
}
