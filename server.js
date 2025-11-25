const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const path = require('path');

const app = express();
const port = 4114;

let pool;


// 1. ADATBÁZIS KAPCSOLAT ÉS POOL INICIALIZÁLÁSA

const dbOptions = {
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'user',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

// Session beállítása (MySQL-ben tárolva)
const sessionStore = new MySQLStore(dbOptions);

async function initializePool() {
    try {
       
        pool = await mysql.createPool(dbOptions);
        await pool.getConnection();
        console.log("Adatbázis (MySQL Pool) csatlakoztatva.");
    } catch (error) {
        console.error("KRITIKUS HIBA: MySQL csatlakozás sikertelen. Szerver leáll.", error);
        // Leállítjuk, ha nem érhető el az adatbázis
        process.exit(1);
    }
}


// 2. MIDDLEWARE & SESSION KOFNIGURÁCIÓ

app.use(session({
    //Éles környezetben titkosított név!
    key: 'session_cookie_name',
    secret: 'session_cookie_secret',
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 }
}));

app.use(passport.initialize());
app.use(passport.session());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set("view engine", "ejs");





// 3. PASSPORT KONFIGURÁCIÓ (ASYNC/AWAIT HASZNÁLATÁVAL)

const customFields = {
    usernameField: 'uname',
    passwordField: 'pw',
};

// --- Login Ellenőrzés ---
const verifyCallback = async (username, password, done) => {
    try {
        
        const [results] = await pool.execute('SELECT * FROM users WHERE username = ?', [username]);
        
        if (results.length === 0) return done(null, false);

        const user = results[0];
        const isValid = await bcrypt.compare(password, user.hash);

        if (isValid) {
            return done(null, user);
        } else {
            return done(null, false);
        }
    } catch (error) {
        return done(error);
    }
};

const strategy = new LocalStrategy(customFields, verifyCallback);
passport.use(strategy);

passport.serializeUser((user, done) => {
    done(null, user.id);
});


passport.deserializeUser(async function(userId, done) {
    try {
        const [results] = await pool.execute('SELECT * FROM users where id = ?', [userId]);
        done(null, results[0]);
    } catch (error) {
        done(error);
    }
});

app.use((req, res, next) => {
    console.log(`\nKérés: ${req.method} ${req.url}`);
    res.locals.currentUser = req.user; 
    next();
});




// 4. ÚTVONALAK

// Főoldal
app.get('/', (req, res) => { res.render("mainpage"); });

// Regisztráció (GET)
app.get('/register', (req, res) => { res.render('register'); });

// Regisztráció (POST)
app.post('/register', async (req, res, next) => { // <-- ASYNC
    const { uname, pw } = req.body;

    try {
        // Ellenőrizzük,hogy létezik a felhasználó?
        const [checkResults] = await pool.execute('SELECT * FROM users WHERE username = ?', [uname]);
        
        if (checkResults.length > 0) return res.redirect('/userAlreadyExists');

        // Jelszó titkosítása BCRYPT-tel!!
        const hashedPassword = await bcrypt.hash(pw, 10);

        // Mentés az adatbázisba!!
        await pool.execute('INSERT INTO users (username, hash, isAdmin) VALUES (?, ?, 0)', [uname, hashedPassword]);
        
        console.log("Sikeres regisztráció!");
        res.redirect('/login');

    } catch (err) {
        console.error("Regisztrációs hiba:", err);
        // Hiba esetén nem omlik össze a szerver, csak hibát küld
        res.status(500).send("Hiba történt a regisztráció során.");
    }
});

// Hibaoldal regisztrációnál
app.get('/userAlreadyExists', (req, res) => { res.send('<h1>Ez a név már foglalt. <a href="/register">Próbáld újra</a></h1>'); });

// Login (GET)
app.get('/login', (req, res) => { res.render('login'); });

// Login (POST)
app.post('/login', passport.authenticate('local', {
    successRedirect: '/',
    failureRedirect: '/login-failure'
}));

app.get('/login-failure', (req, res) => { res.send('<h1>Hibás felhasználónév vagy jelszó. <a href="/login">Próbáld újra</a></h1>'); });

//Hozzáférés előtti user check
function isAuth(req, res, next) {
    if (req.isAuthenticated()) next();
    else res.redirect('/notAuthorized');
}


app.get('/messages', isAuth, async (req, res) => { 
    let messages = [];
    
    // Csak akkor kérjük le az üzeneteket, ha a felhasználó be van jelentkezve (admin vagy regisztrált)
        try {
            
            const [results] = await pool.execute(
                'SELECT id, user_id, name, email, subject, message, created_at FROM messages ORDER BY id DESC LIMIT 50'
            );
            messages = results;
        } catch (err) {
            console.error("Hiba az üzenetek lekérésekor:", err);
        }
    
    //Üzenet átadása az ejs-nek!!!
    res.render("messages", {
        messages: messages 
    });
});

//Hozzáférés előtti user + admin check!!
function isAdmin(req, res, next) {
    if (req.isAuthenticated() && req.user.isAdmin == 1) next();
    else res.redirect('/notAuthorizedAdmin');
}

// Admin oldal
app.get('/admin', isAdmin, async (req, res) => {
    try {
        const [users] = await pool.execute('SELECT * FROM users');
        res.render("admin", {
            userName: req.user.username,
            users: users
        });
    } catch (err) {
        console.error("Admin oldal hiba:", err);
        res.status(500).send("Hiba történt az admin adatok lekérésekor.");
    }
});

// Kapcsolat Űrlap Feldolgozása (POST)
app.post('/submit-contact', async (req, res) => { 

    const { name, email, subject, message } = req.body; 
    
    if (!name || !email || !subject || !message) {
        return res.status(400).send("Hiányzó mezők az űrlapon. Kérlek, töltsd ki az összes mezőt.");
    }

    let userId = req.user ? req.user.id : null;
    {   
        try {
        await pool.execute(
            'INSERT INTO messages (user_id,name, email, subject, message) VALUES (?, ?, ?, ?, ?)',
            [ userId, name, email, subject, message]
        );
        console.log(`Új üzenet mentve az adatbázis-ba. Feladó: ${name}, Tárgy: ${subject}`);
        
        res.redirect('/'); 

    } catch (err) {
        console.error("Űrlap küldési hiba:", err);
        res.status(500).send("Hiba történt az üzenet mentésekor.");
    }    
}
});

//Jogosultság hibaoldalak, kijelentkezés kezelése
app.get('/notAuthorized', (req, res) => { res.send('<h1>Ehhez be kell jelentkezned! <a href="/login">Belépés</a></h1>'); });
app.get('/notAuthorizedAdmin', (req, res) => { res.send('<h1>Ez az oldal csak Adminisztrátoroknak érhető el!</h1> <a href="/">Vissza a főoldalra</a></h1>'); });
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        res.clearCookie('session_cookie_name');
        res.redirect('/');
    });
});



initializePool().then(() => {
    app.listen(port, function() {
        console.log(`A szerver fut a http://localhost:${port} címen!`);
    });
});