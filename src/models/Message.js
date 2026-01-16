const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Message = sequelize.define('Message', {
    clientId: {
        type: DataTypes.STRING,
        allowNull: false
    },
    messageId: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    },
    remoteJid: {
        type: DataTypes.STRING, // The identifier of the chat (e.g., 628123@c.us)
        allowNull: false
    },
    fromMe: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    body: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    type: {
        type: DataTypes.STRING,
        defaultValue: 'chat'
    },
    timestamp: {
        type: DataTypes.INTEGER, // UNIX timestamp from WA is cleanest
        allowNull: false
    },
    hasMedia: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    ack: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    notifyName: {
        type: DataTypes.STRING,
        allowNull: true
    }
}, {
    tableName: 'messages',
    indexes: [
        {
            fields: ['clientId', 'remoteJid']
        },
        {
            fields: ['timestamp']
        }
    ]
});

module.exports = Message;
