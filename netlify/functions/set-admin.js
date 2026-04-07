exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 204,
            headers: {
                'Access-Control-Allow-Origin': '*',
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
        const { targetUserId, is_admin, callerToken } = JSON.parse(event.body);

        if (!targetUserId || is_admin === undefined || !callerToken) {
            return respond(400, { error: 'Missing required fields' });
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

        // Update admin status
        const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${targetUserId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SERVICE_KEY,
                'Authorization': `Bearer ${SERVICE_KEY}`,
                'Prefer': 'return=minimal',
            },
            body: JSON.stringify({ is_admin }),
        });

        if (!updateRes.ok) {
            return respond(400, { error: 'Failed to update admin status' });
        }

        return respond(200, { success: true });

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
