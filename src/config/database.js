require('dotenv').config();
const { Sequelize } = require('sequelize');
const path = require('path');

const dialect = process.env.DB_DIALECT || 'sqlite';
let sequelize;

if (dialect === 'sqlite') {
    const storage = process.env.DB_STORAGE
        ? path.resolve(process.env.DB_STORAGE)
        : path.join(__dirname, '../../data/database.sqlite');

    sequelize = new Sequelize({
        dialect: 'sqlite',
        storage: storage,
        logging: false
    });
} else {
    sequelize = new Sequelize(
        process.env.DB_NAME,
        process.env.DB_USER,
        process.env.DB_PASS,
        {
            host: process.env.DB_HOST,
            dialect: dialect,
            logging: false
        }
    );
}

module.exports = sequelize;
