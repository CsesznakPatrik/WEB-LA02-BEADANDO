const express = require('express');
const path = require('path');
const app = express();
const port = 4114;

// --- MIDDLEWARE (Előkészítés) ---

app.use(express.static(path.join(__dirname, 'public')));

app.use(express.urlencoded({ extended: true }));

//Mock adatbázis
const users = []; 
const messages = [];


app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// Bejelentkezés oldal
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

// Regisztrációs oldal
app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'register.html'));
});


// 1. Regisztráció feldolgozása
app.post('/register', (req, res) => {
    const { username, password } = req.body;

    const userExists = users.find(u => u.username === username);
    if (userExists) {
        return res.send('<h1>Hiba: A felhasználónév már foglalt! <a href="/register">Próbáld újra</a></h1>');
    }

    users.push({ username, password });
    console.log('Új regisztráció:', username);
    
    res.redirect('/login');
});

// 2. Bejelentkezés feldolgozása
app.post('/login', (req, res) => {
    const { username, password } = req.body;

    const user = users.find(u => u.username === username && u.password === password);

    if (user) {
        res.send(`<h1>Sikeres belépés! Üdvözöllek, ${username}! <a href="/">Tovább a főoldalra</a></h1>`);
    } else {
        res.send('<h1>Hiba: Rossz felhasználónév vagy jelszó! <a href="/login">Próbáld újra</a></h1>');
    }
});

// 3. űrlap feldolgozása (Kapcsolat)
app.post('/submit-contact', (req, res) => {
    const { name,email,subject,message } = req.body;

    messages.push({ 
        name, 
        email, 
        subject, 
        message, 
        date: new Date() 
    });
    console.log('Beérkezett üzenet:', { name,email ,subject ,message,  });

    res.send(`<h1>Köszönjük az üzenetet, ${name}! Feldolgoztuk. <a href="/">Vissza</a></h1>`);
});

//Szerver indítása
app.listen(port, () => {
    console.log(`A szerver fut: http://localhost:${port}`);
});