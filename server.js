require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 4000;

// ไฟล์สำหรับเก็บข้อมูล
const DATA_FILE = path.join(__dirname, 'clients_data.json');

// ฟังก์ชันโหลดข้อมูลจากไฟล์
function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            // แปลง string date กลับเป็น Date object
            for (const clientId in data.connectedClients) {
                if (data.connectedClients[clientId].last_seen) {
                    data.connectedClients[clientId].last_seen = new Date(data.connectedClients[clientId].last_seen);
                }
            }
            for (const clientId in data.blockedClients) {
                if (data.blockedClients[clientId].blocked_at) {
                    data.blockedClients[clientId].blocked_at = new Date(data.blockedClients[clientId].blocked_at);
                }
            }
            console.log('📂 Loaded data from file');
            return data;
        }
    } catch (error) {
        console.error('❌ Error loading data:', error.message);
    }
    return { connectedClients: {}, blockedClients: {} };
}

// ฟังก์ชันบันทึกข้อมูลลงไฟล์
function saveData() {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify({
            connectedClients,
            blockedClients
        }, null, 2));
    } catch (error) {
        console.error('❌ Error saving data:', error.message);
    }
}

// โหลดข้อมูลตอนเริ่มต้น server
const savedData = loadData();
let connectedClients = savedData.connectedClients;
let blockedClients = savedData.blockedClients;

// Middleware Configuration
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
        maxAge: 1000 * 60 * 60,
        httpOnly: true
    }
}));

const requireLogin = (req, res, next) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }
    next();
};

// Routes
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
        const isActive = (now - lastSeen) / 1000 < 300;
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
        saveData(); // บันทึกข้อมูล
    }
    res.redirect('/dashboard');
});

app.post('/unblock', requireLogin, (req, res) => {
    const { client_id } = req.body;
    if (client_id) {
        delete blockedClients[client_id];
        console.log(`[ADMIN ACTION] Client unblocked: ${client_id}`);
        saveData(); // บันทึกข้อมูล
    }
    res.redirect('/dashboard');
});

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

    // Debug log
    console.log('📦 Received payload:', JSON.stringify({
        client_id: client_id,
        has_database: !!database,
        database_user: database?.user || 'N/A',
        has_docker: !!docker_compose,
        domain: domain,
        url_main: url_main
    }, null, 2));

    if (blockedClients[client_id]) {
        console.error(`[BLOCKED] Rejected connection from blocked client_id: ${client_id} (IP: ${clientIp})`);
        return res.status(403).json({ status: 'error', message: 'License has been disabled by administrator.' });
    }

    if (!client_id) {
        return res.status(400).json({ status: 'error', message: 'client_id is required' });
    }

    if (apiKey && apiKey === process.env.VALID_API_KEY) {
        console.log(`[VERIFIED] License OK for: ${client_id} (IP: ${clientIp})`);
        
        connectedClients[client_id] = {
            last_seen: new Date(),
            ip: clientIp,
            database: database || {},
            domain: domain || 'N/A',
            url_main: url_main || 'N/A',
            docker_compose: docker_compose || null
        };
        
        saveData(); // บันทึกข้อมูล
        
        return res.status(200).json({ status: 'ok', message: 'License valid' });
    } else {
        console.error(`[FAILED] Invalid key attempt for: ${client_id} (IP: ${clientIp})`);
        return res.status(403).json({ status: 'error', message: 'Invalid or missing license key' });
    }
});

// Start the Server
app.listen(PORT, () => {
    console.log(`🔑 License Server with Dashboard is running on http://localhost:${PORT}`);
    console.log(`💾 Data file: ${DATA_FILE}`);
    if (!process.env.ADMIN_PASSWORD_HASH) {
        console.warn('\nWARNING: ADMIN_PASSWORD_HASH is not set in .env file.');
        console.warn('Please run "node generate-hash.js" to create a secure password.\n');
    }
});