const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const { EventEmitter } = require('events');
const path = require('path');
const fs = require('fs');
const Message = require('../models/Message');


class WhatsAppClient extends EventEmitter {
    constructor(id, io) {
        super();
        this.id = id;
        this.io = io; // Socket.io instance
        this.status = 'INITIALIZING';
        this.qr = null;
        this.info = null; // Store client info (name, number, avatar)
        this.client = new Client({
            authStrategy: new LocalAuth({ clientId: id }),
            puppeteer: {
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
            },
            webVersionCache: {
                type: 'remote',
                remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
            }
        });

        this.initializeEvents();
    }

    initializeEvents() {
        this.client.on('qr', async (qr) => {
            const qrImage = await qrcode.toDataURL(qr);
            this.qr = qrImage; // Store Base64 Image
            this.status = 'QR_READY';
            this.emit('qr', qrImage);
            this.io.emit('client-qr', { id: this.id, qr: qrImage });
            console.log(`Client ${this.id}: QR Code received`);
        });

        this.client.on('ready', async () => {
            this.status = 'READY';
            this.qr = null;

            try {
                const info = this.client.info;
                const avatar = await this.client.getProfilePicUrl(info.wid._serialized) || 'https://via.placeholder.com/150';

                this.info = {
                    name: info.pushname,
                    number: info.wid.user,
                    platform: info.platform,
                    avatar: avatar
                };

                this.emit('ready');
                this.io.emit('client-ready', { id: this.id, info: this.info });
                console.log(`Client ${this.id}: Ready - ${info.pushname} (${info.wid.user})`);
            } catch (e) {
                console.error(`Client ${this.id}: Error fetching info`, e);
                this.io.emit('client-ready', { id: this.id }); // Fallback
            }
        });

        this.client.on('authenticated', () => {
            this.status = 'AUTHENTICATED';
            this.io.emit('client-authenticated', { id: this.id });
            console.log(`Client ${this.id}: Authenticated`);
        });

        this.client.on('auth_failure', (msg) => {
            this.status = 'AUTH_FAILURE';
            this.emit('auth_failure', msg);
            this.io.emit('client-auth-failure', { id: this.id, msg });
            console.error(`Client ${this.id}: Auth failure`, msg);
        });

        this.client.on('disconnected', (reason) => {
            this.status = 'DISCONNECTED';
            this.emit('disconnected', reason);
            this.io.emit('client-disconnected', { id: this.id, reason });
            console.log(`Client ${this.id}: Disconnected`, reason);
        });

        this.client.on('message', async (msg) => {
            this.handleMessage(msg, 'received');
        });

        // Listen to messages sent by the bot (or from other devices on the account)
        this.client.on('message_create', async (msg) => {
            if (msg.fromMe) {
                this.handleMessage(msg, 'sent');
            }
        });

        // Listen for message status updates (sent, delivered, read)
        this.client.on('message_ack', async (msg, ack) => {
            // ack: 1 (SENT), 2 (RECEIVED), 3 (READ)
            const statusMap = { 1: 'SENT', 2: 'DELIVERED', 3: 'READ', 0: 'PENDING' };
            const statusStr = statusMap[ack] || 'UNKNOWN';

            this.io.emit('client-message-status', {
                id: this.id,
                messageId: msg.id.id,
                status: statusStr,
                ack
            });

            // Update DB Status
            try {
                await Message.update({ ack: ack }, { where: { messageId: msg.id.id } });
            } catch (e) { console.error('Error updating message ack', e); }

            console.log(`Client ${this.id}: Message ${msg.id.id} status: ${statusStr}`);
        });
    }

    async handleMessage(msg, type) {

        // Collect message details
        const messageData = {
            id: msg.id.id,
            from: msg.from,
            to: msg.to,
            body: msg.body,
            type: msg.type,
            timestamp: msg.timestamp,
            hasMedia: msg.hasMedia,
            direction: type // 'sent' or 'received'
        };

        // Save to DB
        try {
            await Message.create({
                clientId: this.id,
                messageId: msg.id.id,
                remoteJid: msg.to, // For sent messages, 'to' is the chat. For received, 'from' is the chat. 
                // Wait, logic correction:
                // If I send a message, 'to' is the recipient (chat).
                // If I receive a message, 'from' is the sender (chat), UNLESS it's a group, then 'from' is sender but 'author' logic applies
                // Simplified: remoteJid is always the "other party".
                remoteJid: type === 'sent' ? msg.to : msg.from,
                fromMe: type === 'sent',
                body: msg.body,
                type: msg.type,
                timestamp: msg.timestamp,
                hasMedia: msg.hasMedia,
                ack: msg.ack || 0,
                notifyName: msg._data.notifyName || ''
            });
        } catch (e) {
            // Duplicate key error might happen if re-processing, ignore
            if (e.name !== 'SequelizeUniqueConstraintError') {
                console.error('Error saving message to DB', e);
            }
        }

        // For now, emit to socket
        this.io.emit('client-message', { id: this.id, message: messageData });
        console.log(`Client ${this.id}: Message ${type}`);
    }

    async initialize() {
        try {
            await this.client.initialize();
        } catch (error) {
            console.error(`Client ${this.id}: Initialization failed`, error);
        }
    }

    async logout() {
        try {
            await this.client.logout();
        } catch (e) { console.error('Error logging out', e); }
    }

    async destroy() {
        try {
            await this.client.destroy();
        } catch (e) {
            console.error('Error destroying client', e);
        }
    }

    // API Methods
    async sendMessage(to, content, options = {}) {
        if (this.status !== 'READY') throw new Error('Client not ready');
        // 'to' should be formatted as 'number@c.us'
        if (!to.includes('@')) {
            to = `${to}@c.us`;
        }
        return await this.client.sendMessage(to, content, options);
    }
}

module.exports = WhatsAppClient;
