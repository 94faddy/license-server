require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 4000;

let connectedClients = {};
let blockedClients = {}; // In-memory blocklist

// 2. Middleware Configuration
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
        maxAge: 1000 * 60 * 60, // 1 hour
        httpOnly: true
    }
}));

const requireLogin = (req, res, next) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }
    next();
};

// 3. Routes
app.get('/', (req, res) => {
    if (req.session.userId) {
        res.redirect('/dashboard');
    } else {
        res.redirect('/login');
    }
});

app.get('/login', (req, res) => {
    res.render('login', { error: null });
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const isAdminUser = username === process.env.ADMIN_USER;
    const isPasswordCorrect = bcrypt.compareSync(password, process.env.ADMIN_PASSWORD_HASH);

    if (isAdminUser && isPasswordCorrect) {
        req.session.userId = username;
        res.redirect('/dashboard');
    } else {
        res.render('login', { error: 'Invalid username or password' });
    }
});

app.post('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login');
    });
});

app.get('/dashboard', requireLogin, (req, res) => {
    const clientsForView = {};
    const now = new Date();
    for (const clientId in connectedClients) {
        const client = connectedClients[clientId];
        const lastSeen = client.last_seen;
        const isActive = (now - lastSeen) / 1000 < 300; // Active if seen in the last 5 minutes
        clientsForView[clientId] = {
            ...client,
            status: isActive ? 'Active' : 'Inactive'
        };
    }
    res.render('dashboard', { clients: clientsForView, blocked: blockedClients });
});

app.post('/block', requireLogin, (req, res) => {
    const { client_id, ip } = req.body;
    if (client_id) {
        blockedClients[client_id] = { 
            ip: ip, 
            blocked_at: new Date(),
            database: connectedClients[client_id]?.database || {},
            domain: connectedClients[client_id]?.domain || 'N/A',
            docker_compose: connectedClients[client_id]?.docker_compose || null
        };
        console.log(`[ADMIN ACTION] Client blocked: ${client_id} at IP ${ip}`);
        delete connectedClients[client_id];
    }
    res.redirect('/dashboard');
});

app.post('/unblock', requireLogin, (req, res) => {
    const { client_id } = req.body;
    if (client_id) {
        delete blockedClients[client_id];
        console.log(`[ADMIN ACTION] Client unblocked: ${client_id}`);
    }
    res.redirect('/dashboard');
});

// 4. API Endpoint for License Verification
app.get('/verify', (req, res) => {
    res.status(200).json({
        status: "info",
        message: "This is the license verification endpoint.",
        usage: "Please send a POST request with your 'x-api-key' in the header to verify your license."
    });
});

app.post('/verify', (req, res) => {
    const apiKey = req.headers['x-api-key'];
    const { client_id, database, domain, url_main, docker_compose } = req.body;
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    if (blockedClients[client_id]) {
        console.error(`[BLOCKED] Rejected connection from blocked client_id: ${client_id} (IP: ${clientIp})`);
        return res.status(403).json({ status: 'error', message: 'License has been disabled by administrator.' });
    }

    if (!client_id) {
        return res.status(400).json({ status: 'error', message: 'client_id is required' });
    }

    if (apiKey && apiKey === process.env.VALID_API_KEY) {
        console.log(`[VERIFIED] License OK for: ${client_id} (IP: ${clientIp})`);
        
        // เก็บข้อมูลรวมถึง database info และ docker compose
        connectedClients[client_id] = {
            last_seen: new Date(),
            ip: clientIp,
            database: database || {},
            domain: domain || 'N/A',
            url_main: url_main || 'N/A',
            docker_compose: docker_compose || null
        };
        
        return res.status(200).json({ status: 'ok', message: 'License valid' });
    } else {
        console.error(`[FAILED] Invalid key attempt for: ${client_id} (IP: ${clientIp})`);
        return res.status(403).json({ status: 'error', message: 'Invalid or missing license key' });
    }
});

// 5. Start the Server
app.listen(PORT, () => {
    console.log(`🔑 License Server with Dashboard is running on http://localhost:${PORT}`);
    if (!process.env.ADMIN_PASSWORD_HASH) {
        console.warn('\nWARNING: ADMIN_PASSWORD_HASH is not set in .env file.');
        console.warn('Please run "node generate-hash.js" to create a secure password.\n');
    }
});