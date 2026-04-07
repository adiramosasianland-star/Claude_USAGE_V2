const SUPABASE_URL = 'https://xihjreochxbzpgmpppzr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_dQK0SimPFn9YpIcDIflKWA_W32818kP';
const AUTH_URL     = `${SUPABASE_URL}/auth/v1`;

let currentSession = null;

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
    applyTheme(localStorage.getItem('theme') || 'light');

    await restoreSession();

    if (window.lucide) lucide.createIcons();

    window.addEventListener('click', e => {
        if (e.target.classList.contains('modal')) {
            closeInviteModal();
            closeEditModal();
        }
    });

    document.getElementById('inviteEmail').addEventListener('keydown', e => {
        if (e.key === 'Enter') inviteUser();
    });
});

// ── SESSION ───────────────────────────────────────────────────────────────────

async function restoreSession() {
    const stored = localStorage.getItem('sb_session');
    if (!stored) return redirect();

    const session = JSON.parse(stored);

    if (Date.now() / 1000 > session.expires_at) {
        const refreshed = await refreshSession(session.refresh_token);
        if (!refreshed) return redirect();
    } else {
        currentSession = session;
        await guardAdmin();
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
        await guardAdmin();
        return true;
    } catch {
        return false;
    }
}

async function guardAdmin() {
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=is_admin,is_active`, {
            headers: getHeaders(),
        });
        if (!res.ok) return redirect();
        const data = await res.json();
        if (!data.length || !data[0].is_admin || !data[0].is_active) return redirect();
    } catch {
        return redirect();
    }

    // Passed — show the app
    document.getElementById('appScreen').style.display = 'block';
    if (window.lucide) lucide.createIcons();
    loadUsers();
}

function redirect() {
    window.location.href = 'index.html';
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
    redirect();
}

// ── LOAD USERS ────────────────────────────────────────────────────────────────

async function loadUsers() {
    try {
        const res = await fetch(
            `${SUPABASE_URL}/rest/v1/profiles?select=*&order=created_at.asc`,
            { headers: getHeaders() }
        );
        if (res.status === 401) return redirect();
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        renderUsers(data);
    } catch (err) {
        showToast('Failed to load users: ' + err.message, 'error');
    }
}

// ── RENDER ────────────────────────────────────────────────────────────────────

function renderUsers(users) {
    const wrap    = document.getElementById('usersTableWrap');
    const countEl = document.getElementById('userCount');

    if (countEl) countEl.textContent = `${users.length} ${users.length === 1 ? 'user' : 'users'}`;

    if (!users.length) {
        wrap.innerHTML = `
            <div class="empty-state">
                <h3>No users yet</h3>
                <p>Invite someone to get started</p>
            </div>`;
        return;
    }

    wrap.innerHTML = `
        <table class="users-table">
            <thead>
                <tr>
                    <th>User</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Joined</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
                ${users.map(u => renderUserRow(u)).join('')}
            </tbody>
        </table>`;

    if (window.lucide) lucide.createIcons();
}

function renderUserRow(u) {
    const joined = u.created_at
        ? new Date(u.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : '—';

    const roleBadge = u.is_admin
        ? `<span class="badge badge-admin"><i data-lucide="shield" style="width:10px;height:10px;"></i> Admin</span>`
        : `<span style="font-size:12px;color:var(--ink-3);">User</span>`;

    const statusBadge = u.is_active
        ? `<span class="badge badge-active">Active</span>`
        : `<span class="badge badge-inactive">Inactive</span>`;

    return `
        <tr>
            <td>
                <div class="user-email">${escapeHtml(u.email)}</div>
            </td>
            <td>${roleBadge}</td>
            <td>${statusBadge}</td>
            <td><span style="font-size:12px;color:var(--ink-3);">${joined}</span></td>
            <td>
                <div class="td-actions">
                    <button class="btn btn-ghost btn-sm" onclick="openEditModal(${JSON.stringify(u).split('"').join('&quot;')})">
                        <i data-lucide="pencil"></i>
                        Edit
                    </button>
                </div>
            </td>
        </tr>`;
}

// ── INVITE ────────────────────────────────────────────────────────────────────

async function inviteUser() {
    const email = document.getElementById('inviteEmail').value.trim();
    if (!email) return showToast('Email is required', 'error');

    const btn = document.querySelector('#inviteModal .btn-primary');
    btn.textContent = 'Sending...';
    btn.disabled = true;

    try {
        const res = await fetch('/.netlify/functions/invite-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, callerToken: currentSession.access_token }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to send invite');
        closeInviteModal();
        document.getElementById('inviteEmail').value = '';
        showToast(`Invite sent to ${email}`);
        loadUsers();
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        btn.innerHTML = '<i data-lucide="send"></i> Send invite';
        btn.disabled = false;
        if (window.lucide) lucide.createIcons();
    }
}

// ── EDIT / SAVE ───────────────────────────────────────────────────────────────

function openEditModal(user) {
    document.getElementById('editUserId').value      = user.id;
    document.getElementById('editEmail').value       = user.email;
    document.getElementById('editIsAdmin').checked   = !!user.is_admin;
    document.getElementById('editIsActive').checked  = !!user.is_active;
    document.getElementById('editModal').classList.add('active');
}

function closeEditModal() {
    document.getElementById('editModal').classList.remove('active');
}

async function saveUser() {
    const id       = document.getElementById('editUserId').value;
    const email    = document.getElementById('editEmail').value.trim();
    const is_admin = document.getElementById('editIsAdmin').checked;
    const is_active = document.getElementById('editIsActive').checked;

    if (!email) return showToast('Email is required', 'error');

    const btn = document.querySelector('#editModal .btn-primary');
    btn.textContent = 'Saving...';
    btn.disabled = true;

    try {
        await Promise.all([
            patchEmail(id, email),
            patchAdminStatus(id, is_admin),
            patchActiveStatus(id, is_active),
        ]);
        closeEditModal();
        showToast('User updated');
        loadUsers();
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        btn.innerHTML = '<i data-lucide="check"></i> Save changes';
        btn.disabled = false;
        if (window.lucide) lucide.createIcons();
    }
}

async function patchEmail(id, email) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${id}`, {
        method: 'PATCH',
        headers: { ...getHeaders(), 'Prefer': 'return=minimal' },
        body: JSON.stringify({ email }),
    });
    if (!res.ok) throw new Error('Failed to update email');
}

async function patchAdminStatus(id, is_admin) {
    const res = await fetch('/.netlify/functions/set-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: id, is_admin, callerToken: currentSession.access_token }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update admin status');
}

async function patchActiveStatus(id, is_active) {
    const res = await fetch('/.netlify/functions/deactivate-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: id, is_active, callerToken: currentSession.access_token }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update active status');
}

// ── MODALS ────────────────────────────────────────────────────────────────────

function showInviteModal() {
    document.getElementById('inviteEmail').value = '';
    document.getElementById('inviteModal').classList.add('active');
    setTimeout(() => document.getElementById('inviteEmail').focus(), 100);
}

function closeInviteModal() {
    document.getElementById('inviteModal').classList.remove('active');
}

// ── UTILS ─────────────────────────────────────────────────────────────────────

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
