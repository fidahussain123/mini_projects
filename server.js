const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcrypt');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const session = require('express-session');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const port = 3000;

// Supabase setup
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Middleware
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // Set to true with HTTPS in production
}));
app.use(passport.initialize());
app.use(passport.session());

// Passport configuration
passport.use(new LocalStrategy(
    { usernameField: 'email' },
    async (email, password, done) => {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .single();

        if (error || !data) return done(null, false, { message: 'User not found' });

        const match = await bcrypt.compare(password, data.password);
        if (!match) return done(null, false, { message: 'Incorrect password' });

        return done(null, data);
    }
));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
    const { data, error } = await supabase.from('users').select('*').eq('id', id).single();
    done(error, data);
});

// Middleware to check authentication
const isAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) return next();
    res.redirect('/login');
};

// Routes
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.post('/register', async (req, res) => {
    const { email, password, name } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);

    const { data, error } = await supabase
        .from('users')
        .insert([{ email, password: hashedPassword, name }]);

    if (error) {
        console.error('Registration error:', error);
        return res.status(400).json({ success: false, message: 'Registration failed' });
    }

    res.redirect('/login');
});

app.post('/login', passport.authenticate('local', {
    successRedirect: '/',
    failureRedirect: '/login?error=1'
}));

app.get('/logout', (req, res) => {
    req.logout(() => res.redirect('/login'));
});

// Existing exam routes (protected)
let flags = [];
let submissions = [];

app.get('/', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/flag', isAuthenticated, (req, res) => {
    const { event, timestamp, severity } = req.body;
    flags.push({ event, timestamp, severity, userId: req.user.id });
    console.log(`[${severity.toUpperCase()}] ${event} at ${timestamp} by ${req.user.email}`);
    res.json({ success: true, message: 'Flag recorded' });
});

app.post('/submit', isAuthenticated, (req, res) => {
    const { mcq, code } = req.body;
    const score = evaluateSubmission(mcq, code);
    submissions.push({ mcq, code, score, flags: [...flags], userId: req.user.id });
    flags = [];
    res.json({ success: true, message: 'Exam submitted successfully!', score });
});

function evaluateSubmission(mcq, code) {
    let score = 0;
    if (mcq === '4') score += 25;
    if (code.toLowerCase().includes('reverse')) score += 50;
    return score;
}

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});