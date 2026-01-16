const express = require('express');
const router = express.Router();
const User = require('../models/User');
const crypto = require('crypto');


// Middleware to check authentication

// Middleware to check authentication
const isAuthenticated = (req, res, next) => {
    if (req.session.authenticated) {
        next();
    } else {
        res.redirect('/login');
    }
};

// Login
router.get('/login', (req, res) => {
    res.render('login', { error: null });
});

const bcrypt = require('bcrypt'); // Add bcrypt

router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await User.findOne({ where: { username } });
        if (user) {
            const match = await bcrypt.compare(password, user.password);
            if (match) {
                req.session.authenticated = true;
                req.session.user = user;
                return res.redirect('/');
            }
        }
        res.render('login', { error: 'Invalid credentials' });
    } catch (e) {
        console.error(e);
        res.render('login', { error: 'Login error' });
    }
});

router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// Generate API Key
router.post('/generate-api-key', isAuthenticated, async (req, res) => {
    const { days } = req.body; // Duration in days
    const userId = req.session.user.id;

    try {
        const apiKey = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + parseInt(days || 30));

        await User.update({
            apiKey: apiKey,
            apiKeyExpiresAt: expiresAt
        }, { where: { id: userId } });

        // Update session user
        const updatedUser = await User.findByPk(userId);
        req.session.user = updatedUser;

        res.json({ success: true, apiKey, expiresAt });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to generate key' });
    }
});

// Dashboard
router.get('/', isAuthenticated, (req, res) => {
    const clients = req.clientManager.getAllClients();
    res.render('dashboard', { clients });
});

// Create Client Action
router.post('/create-client', isAuthenticated, async (req, res) => {
    const { clientId } = req.body;
    if (clientId) {
        await req.clientManager.createClient(clientId);
    }
    res.redirect('/');
});

// Client Actions Web
router.post('/client/action', isAuthenticated, async (req, res) => {
    const { clientId, action } = req.body;
    if (clientId && action) {
        if (action === 'logout') await req.clientManager.logoutClient(clientId);
        if (action === 'stop') await req.clientManager.stopClient(clientId);
        if (action === 'start') await req.clientManager.startClient(clientId);
    }
    // Redirect back to detail page
    res.redirect(`/client/${clientId}`);
});

// Delete Client Action
router.post('/delete-client', isAuthenticated, async (req, res) => {
    const { clientId } = req.body;
    if (clientId) {
        await req.clientManager.deleteClient(clientId);
    }
    res.redirect('/');
});

// Client Detail
router.get('/client/:id', isAuthenticated, (req, res) => {
    const client = req.clientManager.getClient(req.params.id);
    if (!client) return res.redirect('/');

    // We don't verify if ready here, the view handles showing QR or Ready status
    res.render('client_detail', {
        clientId: client.id,
        status: client.status,
        qr: client.qr, // Might be null if not ready or already authenticated
        info: client.info,
        user: req.session.user // Pass user to view for API Key display
    });
});


module.exports = router;
