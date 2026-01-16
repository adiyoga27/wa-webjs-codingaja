const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const User = sequelize.define('User', {
    username: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    },
    password: {
        type: DataTypes.STRING,
        allowNull: false
    },
    role: {
        type: DataTypes.STRING,
        defaultValue: 'admin'
    },
    apiKey: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: true
    },
    apiKeyExpiresAt: {
        type: DataTypes.DATE,
        allowNull: true
    }
}, {
    tableName: 'users'
});

module.exports = User;
