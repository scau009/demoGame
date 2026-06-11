import express from 'express';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PORT } from './config.js';
import { init as initWs } from './ws.js';
import roundRoutes from './routes/round.js';
import adminRoutes from './routes/admin.js';

const app = express();
const server = createServer(app);

app.use(express.json());
app.use('/api/round', roundRoutes);
app.use('/api/admin', adminRoutes);

const __dirname = dirname(fileURLToPath(import.meta.url));
app.use(express.static(join(__dirname, '..', 'public')));

// SPA fallback
app.get('/admin', (_req, res) => res.sendFile(join(__dirname, '..', 'public', 'admin.html')));

initWs(server);

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
