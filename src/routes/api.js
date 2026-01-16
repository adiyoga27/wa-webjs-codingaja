const express = require('express');
const router = express.Router();
const { MessageMedia } = require('whatsapp-web.js');
const apiKeyMiddleware = require('../middleware/auth');
const Message = require('../models/Message');
const Sequelize = require('sequelize');

// Apply middleware to all routes
router.use(apiKeyMiddleware);

/**
 * @swagger
 * /client/create:
 *   post:
 *     summary: Create a new WhatsApp client session
 *     tags: [Clients]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - id
 *             properties:
 *               id:
 *                 type: string
 *     responses:
 *       200:
 *         description: Client creation started
 */
router.post('/client/create', async (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'Client ID is required' });

    try {
        const client = await req.clientManager.createClient(id);
        res.json({ success: true, message: 'Client creation started', status: client.status });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * @swagger
 * /client/{id}/status:
 *   get:
 *     summary: Get client status
 *     tags: [Clients]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Client status info
 */
router.get('/client/:id/status', (req, res) => {
    const client = req.clientManager.getClient(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    res.json({ id: client.id, status: client.status, qr: client.qr, info: client.info });
});

/**
 * @swagger
 * /client/{id}/action:
 *   post:
 *     summary: Perform action on client (logout, stop, start)
 *     tags: [Clients]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - action
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [logout, stop, start]
 *     responses:
 *       200:
 *         description: Action successful
 */
router.post('/client/:id/action', async (req, res) => {
    const { id } = req.params;
    const { action } = req.body;
    const clientManager = req.clientManager;

    try {
        if (action === 'logout') {
            await clientManager.logoutClient(id);
        } else if (action === 'stop') {
            await clientManager.stopClient(id);
        } else if (action === 'start') {
            await clientManager.startClient(id);
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * @swagger
 * /client/{id}/message/text:
 *   post:
 *     summary: Send a text message
 *     tags: [Messages]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - to
 *               - message
 *             properties:
 *               to:
 *                 type: string
 *                 description: Phone number (e.g. 62812345678)
 *               message:
 *                 type: string
 *     responses:
 *       200:
 *         description: Message sent
 */
router.post('/client/:id/message/text', async (req, res) => {
    const { to, message } = req.body;
    const client = req.clientManager.getClient(req.params.id);

    if (!client) return res.status(404).json({ error: 'Client not found' });
    if (client.status !== 'READY') return res.status(400).json({ error: 'Client not ready' });

    try {
        const response = await client.sendMessage(to, message);
        res.json({ success: true, response });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * @swagger
 * /client/{id}/message/media:
 *   post:
 *     summary: Send a media message (image/video)
 *     tags: [Messages]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - to
 *               - url
 *             properties:
 *               to:
 *                 type: string
 *               url:
 *                 type: string
 *               caption:
 *                 type: string
 *     responses:
 *       200:
 *         description: Media sent
 */
router.post('/client/:id/message/media', async (req, res) => {
    const { to, url, caption, isVideo } = req.body;
    const client = req.clientManager.getClient(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    if (client.status !== 'READY') return res.status(400).json({ error: 'Client not ready' });

    try {
        const media = await MessageMedia.fromUrl(url, { unsafeMime: true });
        const response = await client.sendMessage(to, media, { caption: caption || '', sendVideoAsGif: false });
        res.json({ success: true, response });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to send media. Ensure URL is accessible.', details: e.message });
    }
});

/**
 * @swagger
 * /client/{id}/chats:
 *   get:
 *     summary: Get list of chats
 *     tags: [Chats]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of chats with last message
 */
router.get('/client/:id/chats', async (req, res) => {
    const { id } = req.params;
    try {
        const chats = await Message.findAll({
            where: { clientId: id },
            attributes: [
                'remoteJid',
                [Sequelize.fn('MAX', Sequelize.col('timestamp')), 'lastTimestamp']
            ],
            group: ['remoteJid'],
            order: [[Sequelize.fn('MAX', Sequelize.col('timestamp')), 'DESC']]
        });

        const chatList = [];
        for (const chat of chats) {
            const lastMsg = await Message.findOne({
                where: { clientId: id, remoteJid: chat.remoteJid, timestamp: chat.getDataValue('lastTimestamp') }
            });
            if (lastMsg) chatList.push(lastMsg);
        }

        res.json(chatList);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * @swagger
 * /client/{id}/chat/{jid}:
 *   get:
 *     summary: Get messages for a specific chat
 *     tags: [Chats]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *       - in: path
 *         name: jid
 *         required: true
 *     responses:
 *       200:
 *         description: List of messages
 */
router.get('/client/:id/chat/:jid', async (req, res) => {
    const { id, jid } = req.params;
    try {
        const messages = await Message.findAll({
            where: { clientId: id, remoteJid: jid },
            order: [['timestamp', 'ASC']],
            limit: 50 // pagination later
        });
        res.json(messages);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
