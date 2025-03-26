const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const app = express();
const port = 3000;

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

let flags = [];
let submissions = [];

app.post('/flag', (req, res) => {
    const { event, timestamp, severity } = req.body;
    flags.push({ event, timestamp, severity });
    console.log(`[${severity.toUpperCase()}] ${event} at ${timestamp}`);
    res.json({ success: true, message: 'Flag recorded' });
});

app.post('/submit', (req, res) => {
    const { mcq, code } = req.body;
    const score = evaluateSubmission(mcq, code);
    submissions.push({ mcq, code, score, flags: [...flags] });
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