const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const DATA_DIR = 'C:/BMdata';
const FILE_PATH = path.join(DATA_DIR, 'bookmark.json');

app.use(cors());
app.use(express.json({ limit: '50mb' }));

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

app.get('/db', (req, res) => {
    if (!fs.existsSync(FILE_PATH)) return res.json({ bookmarks: [], groups: ["General"], appTitle: "MarkKeeper" });
    res.json(JSON.parse(fs.readFileSync(FILE_PATH, 'utf8')));
});

app.post('/db', (req, res) => {
    fs.writeFileSync(FILE_PATH, JSON.stringify(req.body, null, 2));
    res.sendStatus(200);
});

const PORT = process.env.PORT || 3000; 

app.listen(PORT, () => console.log(`Sync Server active via IIS on port ${PORT}`));