require('dotenv').config();
const mysql = require('mysql2/promise');

async function createDb() {
    const { DB_HOST, DB_USER, DB_PASS, DB_NAME } = process.env;

    try {
        const connection = await mysql.createConnection({
            host: DB_HOST,
            user: DB_USER,
            password: DB_PASS
        });

        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\`;`);
        console.log(`Database '${DB_NAME}' created or checked.`);
        await connection.end();
    } catch (error) {
        console.error('Error creating database:', error);
        process.exit(1);
    }
}

createDb();
