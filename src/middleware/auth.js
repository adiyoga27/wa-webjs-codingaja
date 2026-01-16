const User = require('../models/User');
const { Op } = require('sequelize');

const apiKeyMiddleware = async (req, res, next) => {
    // Check if session authenticated (allow dashboard to use API without key)
    if (req.session && req.session.authenticated) {
        return next();
    }

    const key = req.headers['x-api-key'] || req.query.api_key;

    if (!key) {
        return res.status(401).json({ error: 'Missing API Key' });
    }

    try {
        const user = await User.findOne({ where: { apiKey: key } });

        if (!user) {
            return res.status(403).json({ error: 'Invalid API Key' });
        }

        // Check Expiry
        if (user.apiKeyExpiresAt && new Date() > new Date(user.apiKeyExpiresAt)) {
            return res.status(403).json({ error: 'API Key Expired' });
        }

        req.user = user; // attach user to request
        next();
    } catch (e) {
        console.error('API Key Error', e);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = apiKeyMiddleware;
