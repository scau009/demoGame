import express from 'express';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PORT } from './config.js';
import { init as initWs } from './ws.js';
import roundRoutes from './routes/round.js';
import adminRoutes from './routes/admin.js';
import emojiRoutes from './games/emoji/routes.js';
import { activeGame } from './active-game.js';

const app = express();
const server = createServer(app);

app.use(express.json());
app.use('/api/round', roundRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/emoji', emojiRoutes);

// Shared: which game (if any) is currently in progress.
app.get('/api/active-game', (_req, res) => res.json(activeGame()));

const __dirname = dirname(fileURLToPath(import.meta.url));
const pub = join(__dirname, '..', 'public');

// Page routes (declared before static so they take precedence)
app.get('/', (_req, res) => res.sendFile(join(pub, 'select.html')));
app.get('/poker', (_req, res) => res.sendFile(join(pub, 'poker.html')));
app.get('/emoji', (_req, res) => res.sendFile(join(pub, 'emoji.html')));
app.get('/admin', (_req, res) => res.sendFile(join(pub, 'admin-select.html')));
app.get('/admin/poker', (_req, res) => res.sendFile(join(pub, 'admin.html')));
app.get('/admin/emoji', (_req, res) => res.sendFile(join(pub, 'emoji-admin.html')));

app.use(express.static(pub));

initWs(server);

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
