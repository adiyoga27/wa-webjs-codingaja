const fs = require('fs');
const path = require('path');
const WhatsAppClient = require('./WhatsAppClient');

const ClientModel = require('../models/Client');
// const CLIENTS_FILE = path.join(__dirname, '../../data/clients.json'); // Removed

class ClientManager {
    constructor(io) {
        this.io = io;
        this.clients = new Map(); // id -> WhatsAppClient
    }

    // Load clients from storage
    async loadClients() {
        try {
            const clientRecords = await ClientModel.findAll({ where: { isActive: true } });
            console.log(`Loading ${clientRecords.length} clients...`);

            for (const record of clientRecords) {
                this.createClient(record.clientId, false); // false = don't save again
            }
        } catch (error) {
            console.error('Error loading clients:', error);
        }
    }

    // saveClients is no longer needed as we save on creation/deletion
    // But specific methods will handle DB interactions


    async createClient(id, save = true) {
        if (this.clients.has(id)) {
            return this.clients.get(id);
        }

        console.log(`Creating client session: ${id}`);
        const client = new WhatsAppClient(id, this.io);
        this.clients.set(id, client);
        client.initialize();

        if (save) {
            try {
                // Upsert or create
                await ClientModel.findOrCreate({ where: { clientId: id }, defaults: { clientId: id, isActive: true } });
                // If it existed but was inactive, update it
                await ClientModel.update({ isActive: true }, { where: { clientId: id } });
            } catch (e) { console.error('Error saving client to DB', e); }
        }

        return client;
    }

    getClient(id) {
        return this.clients.get(id);
    }

    async deleteClient(id) {
        const client = this.clients.get(id);
        if (client) {
            await client.logout();
            await client.destroy();
            this.clients.delete(id);

            // Remove from DB
            try {
                await ClientModel.destroy({ where: { clientId: id } });
            } catch (e) { console.error('Error deleting client from DB', e); }

            // Optionally remove the .wwebjs_auth folder for this client
            // But LocalAuth usually handles folder structures.
            // We might need to manually clean up .wwebjs_auth/session-<id>
            const authPath = path.join(process.cwd(), '.wwebjs_auth', `session-${id}`);
            if (fs.existsSync(authPath)) {
                fs.rm(authPath, { recursive: true, force: true }, (err) => {
                    if (err) console.error(`Failed to delete session files for ${id}`, err);
                });
            }
            return true;
        }
        return false;
    }

    async logoutClient(id) {
        const client = this.clients.get(id);
        if (client) {
            await client.logout();
            // After logout, we might want to keep it running but it will be in AUTH_FAILURE or similar state until QR scan
            // Or typically wwebjs emits 'disconnected'.
            return true;
        }
        return false;
    }

    async stopClient(id) {
        const client = this.clients.get(id);
        if (client) {
            await client.destroy();
            // Don't remove from map entirely if we want to show it as "Stopped" in UI, 
            // OR remove from map and just rely on DB "isActive: false" to NOT load it on restart?
            // User likely wants to see it in the list to "Start" it again.
            // So let's keep it in map but maybe mark it as stopped in the wrapper? 
            // Wrapper doesn't have "STOPPED" state explicitly managed by wwebjs, so we set it.
            client.status = 'STOPPED';
            this.io.emit('client-disconnected', { id: id, reason: 'STOPPED_BY_USER' });

            // Update DB
            try {
                await ClientModel.update({ isActive: false }, { where: { clientId: id } });
            } catch (e) { console.error('Error updating client DB status', e); }

            return true;
        }
        return false;
    }

    async startClient(id) {
        let client = this.clients.get(id);
        if (!client) {
            // If completely removed from memory but exists in DB (or new), create it.
            return await this.createClient(id);
        }

        if (client.status === 'STOPPED' || client.status === 'DISCONNECTED') {
            console.log(`Starting client session: ${id}`);
            // Re-initialize might not work if destroyed. usually need new instance or re-init call.
            // wwebjs client.initialize() can be called again after destroy? 
            // Safest is to recreate the instance to be sure.

            // Remove old instance listeners to be safe?
            client.removeAllListeners();

            // Create new instance
            const newClient = new WhatsAppClient(id, this.io);
            this.clients.set(id, newClient);
            newClient.initialize();

            // Update DB
            try {
                await ClientModel.update({ isActive: true }, { where: { clientId: id } });
            } catch (e) { console.error('Error updating client DB status', e); }

            return true;
        }
        return false;
    }

    getAllClients() {
        return Array.from(this.clients.values()).map(c => ({
            id: c.id,
            status: c.status
        }));
    }
}

module.exports = ClientManager;
