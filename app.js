const SUPABASE_URL = 'https://xihjreochxbzpgmpppzr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_dQK0SimPFn9YpIcDIflKWA_W32818kP';
const API = `${SUPABASE_URL}/rest/v1/accounts`;

const headers = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
};

let accountToDelete = null;

// ── INIT ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    loadAccounts();
    setInterval(loadAccounts, 30000);

    document.querySelectorAll('.time-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            document.getElementById('cooldownHour').value = btn.dataset.hour;
        });
    });

    window.addEventListener('click', e => {
        if (e.target.id === 'addModal') closeAddModal();
        if (e.target.id === 'cooldownModal') closeCooldownModal();
        if (e.target.id === 'deleteModal') closeDeleteModal();
    });
});

// ── DATA ─────────────────────────────────────────────────────────────────────

async function loadAccounts() {
    try {
        const res = await fetch(`${API}?select=*&order=cooldown_until.asc.nullsfirst`, { headers });
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
            headers: { ...headers, 'Prefer': 'return=minimal' },
            body: JSON.stringify({ email }),
        });
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
            headers,
        });
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
            headers: { ...headers, 'Prefer': 'return=minimal' },
            body: JSON.stringify({ cooldown_until }),
        });
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
            headers: { ...headers, 'Prefer': 'return=minimal' },
            body: JSON.stringify({ cooldown_until: null }),
        });
        if (!res.ok) throw new Error('Failed to clear cooldown');
        showToast('Cooldown cleared');
        loadAccounts();
    } catch (err) {
        showToast(err.message, true);
    }
}

// ── RENDER ───────────────────────────────────────────────────────────────────

function renderAccounts(accounts) {
    const grid = document.getElementById('accountsGrid');

    if (!accounts.length) {
        grid.innerHTML = `<div class="empty-state"><h3>No accounts yet</h3><p>Click "Add Account" to get started</p></div>`;
        return;
    }

    grid.innerHTML = accounts.map(account => {
        const status = getAccountStatus(account);
        return `
            <div class="account-card ${status.class}">
                <div class="account-email">${escapeHtml(account.email)}</div>
                <div class="account-status">
                    <span class="status-badge ${status.class}">${status.label}</span>
                    ${status.countdown ? `<span class="cooldown-time">${status.countdown}</span>` : ''}
                </div>
                ${status.usageInfo ? `<div class="account-last-used"><small>${status.usageInfo}</small></div>` : ''}
                <div class="account-actions">
                    ${status.canUse ? `<button class="btn btn-secondary btn-small" onclick="openCooldownModal(${account.id})">Set Cooldown</button>` : ''}
                    ${status.hasCooldown ? `<button class="btn btn-warning btn-small" onclick="clearCooldown(${account.id})">Clear Cooldown</button>` : ''}
                    <button class="btn btn-danger btn-small" onclick="openDeleteModal(${account.id})">Delete</button>
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

// ── MODALS ───────────────────────────────────────────────────────────────────

function showAddModal() { document.getElementById('addModal').style.display = 'block'; }
function closeAddModal() { document.getElementById('addModal').style.display = 'none'; }

function openCooldownModal(id) {
    document.getElementById('cooldownId').value = id;
    const today = new Date();
    document.getElementById('cooldownDate').value = today.toISOString().split('T')[0];
    document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('selected'));
    document.getElementById('cooldownHour').value = '';
    document.getElementById('cooldownModal').style.display = 'block';
}

function closeCooldownModal() { document.getElementById('cooldownModal').style.display = 'none'; }

function openDeleteModal(id) {
    accountToDelete = id;
    document.getElementById('deleteModal').style.display = 'block';
}

function closeDeleteModal() {
    accountToDelete = null;
    document.getElementById('deleteModal').style.display = 'none';
}

// ── UTILS ────────────────────────────────────────────────────────────────────

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
