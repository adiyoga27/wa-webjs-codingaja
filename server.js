const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const session = require('express-session');
const bodyParser = require('body-parser');

const ClientManager = require('./src/services/ClientManager');
const apiRoutes = require('./src/routes/api');
const webRoutes = require('./src/routes/web');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const swaggerUi = require('swagger-ui-express');
const swaggerSpecs = require('./src/config/swagger');

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpecs));

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Session
app.use(session({
    secret: 'whatsapp-bot-secret-key-123',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set true if using https
}));

// Initialize Client Manager
const clientManager = new ClientManager(io);
// Make manager available to routes
app.use((req, res, next) => {
    req.clientManager = clientManager;
    next();
});

// Database Setup
const sequelize = require('./src/config/database');
const User = require('./src/models/User');
const ApiKey = require('./src/models/ApiKey');
const ClientModel = require('./src/models/Client');
const Message = require('./src/models/Message'); // Add Message Model
const bcrypt = require('bcrypt'); // Add bcrypt

sequelize.sync().then(async () => {
    console.log('Database synced');
    // Create default admin if not exists
    const adminUser = await User.findOne({ where: { username: process.env.ADMIN_DEFAULT_USER || 'admin' } });
    if (!adminUser) {
        const hashedPassword = await bcrypt.hash(process.env.ADMIN_DEFAULT_PASS || 'password', 10);
        await User.create({
            username: process.env.ADMIN_DEFAULT_USER || 'admin',
            password: hashedPassword,
            role: 'admin'
        });
        console.log('Default admin user created');
    }

    // Load saved clients on startup
    console.log('Initializing clients...');
    clientManager.loadClients();
}).catch(err => console.error('Database sync error:', err));


// Socket.io connection
io.on('connection', (socket) => {
    console.log('New Socket Connection');

    socket.on('join-client', (clientId) => {
        socket.join(clientId);
    });
});

// Routes
app.use('/api', apiRoutes);
app.use('/', webRoutes);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
