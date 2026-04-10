exports.handler = async (event) => {
    const allowedOrigin = process.env.URL || '*';

    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 204,
            headers: {
                'Access-Control-Allow-Origin': allowedOrigin,
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
            },
            body: '',
        };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { email, callerToken } = JSON.parse(event.body);

        if (!email || !callerToken) {
            return respond(400, { error: 'Missing email or token' });
        }

        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

        // Verify caller is an active admin
        const profileRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=is_admin,is_active`, {
            headers: {
                'apikey': SERVICE_KEY,
                'Authorization': `Bearer ${callerToken}`,
            },
        });

        const profiles = await profileRes.json();

        if (!profiles.length || !profiles[0].is_admin || !profiles[0].is_active) {
            return respond(403, { error: 'Forbidden: admins only' });
        }

        // Invite the user via Supabase Admin API
        const inviteRes = await fetch(`${SUPABASE_URL}/auth/v1/invite`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SERVICE_KEY,
                'Authorization': `Bearer ${SERVICE_KEY}`,
            },
            body: JSON.stringify({ email, redirect_to: 'https://claudeusage.netlify.app/accept-invite.html' }),
        });

        const inviteData = await inviteRes.json();

        if (!inviteRes.ok) {
            return respond(400, { error: inviteData.msg || inviteData.message || 'Failed to invite user' });
        }

        // Create profile for the new user
        await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SERVICE_KEY,
                'Authorization': `Bearer ${SERVICE_KEY}`,
                'Prefer': 'return=minimal',
            },
            body: JSON.stringify({
                id: inviteData.id,
                email: inviteData.email,
                is_admin: false,
                is_active: true,
            }),
        });

        return respond(200, { success: true, message: `Invite sent to ${email}` });

    } catch (err) {
        return respond(500, { error: err.message });
    }
};

function respond(statusCode, body) {
    return {
        statusCode,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify(body),
    };
}
