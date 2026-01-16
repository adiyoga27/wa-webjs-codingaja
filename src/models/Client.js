const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ClientModel = sequelize.define('Client', {
    clientId: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    },
    alias: {
        type: DataTypes.STRING,
        allowNull: true
    },
    // We can store last known status or just rely on runtime
    isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    }
}, {
    tableName: 'clients'
});

module.exports = ClientModel;
