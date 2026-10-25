/**
 * KANHA Neural Relay — lightweight WebSocket relay (port 8081) that fuses the
 * Primary Optic (front camera, X/Y plane) and the Secondary Optic (side camera
 * at 45–90°, Z-depth) into one hand stream for the Spatial OS. Only landmark
 * JSON crosses the network — never video.
 *
 * Roles (first message: {type:'hello', role}):
 *   primary  -> {type:'landmarks', hands:[{handedness, landmarks[21], score}], aspect, t}
 *   depth    -> {type:'depth', hands:[{handedness, landmarks[21], reach}], t}
 *   consumer <- {type:'frame', hands:[{handedness, landmarks, reach?}], sensors, aspect, t}
 *            <- {type:'status', sensors, lan, clients}
 *
 * HTTP: GET /neural/status (or /status) -> relay status JSON.
 */
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.KANHA_RELAY_PORT ?? 8081);
const DEPTH_STALE_MS = 220;
const PRIMARY_STALE_MS = 500;

function lanAddresses() {
  const out = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const ni of list ?? []) {
      if (ni.family === 'IPv4' && !ni.internal) out.push(ni.address);
    }
  }
  return out;
}

const clients = new Map(); // ws -> { role, id, lastSeen }
let lastPrimary = { at: 0, hands: [], aspect: 4 / 3 };
let lastDepth = { at: 0, hands: [] };
let frames = 0;
let nextId = 1;

function sensors() {
  const now = Date.now();
  const roles = [...clients.values()].map((c) => c.role);
  return {
    primary: roles.includes('primary') && now - lastPrimary.at < PRIMARY_STALE_MS * 4,
    depth: roles.includes('depth') && now - lastDepth.at < PRIMARY_STALE_MS * 4
  };
}

function statusPayload() {
  const roles = [...clients.values()].map((c) => c.role);
  return {
    type: 'status',
    sensors: sensors(),
    lan: lanAddresses(),
    clients: {
      primary: roles.filter((r) => r === 'primary').length,
      depth: roles.filter((r) => r === 'depth').length,
      consumer: roles.filter((r) => r === 'consumer').length
    },
    frames
  };
}

function broadcast(payload, role = 'consumer') {
  const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
  for (const [ws, c] of clients) {
    if (c.role === role && ws.readyState === ws.OPEN) ws.send(data);
  }
}

function broadcastStatus() {
  const s = statusPayload();
  broadcast(s, 'consumer');
  broadcast(s, 'primary');
  broadcast(s, 'depth');
}

/**
 * Fuse Z-depth from the side optic into the primary hands. The side camera
 * sees the reach axis as its horizontal image axis, so each landmark's
 * horizontal offset from the wrist (side view) becomes that landmark's depth
 * relative to the wrist, and the calibrated wrist position becomes `reach`.
 */
function fuse(primaryHands) {
  const depthFresh = Date.now() - lastDepth.at < DEPTH_STALE_MS ? lastDepth.hands : [];
  return primaryHands.map((h, i) => {
    let d = depthFresh.find((x) => x.handedness === h.handedness);
    if (!d && depthFresh.length === 1 && primaryHands.length === 1) d = depthFresh[0];
    if (!d && depthFresh.length === primaryHands.length) d = depthFresh[i];
    if (!d) return h;
    const dl = d.landmarks;
    const sign = d.sign ?? 1;
    const landmarks = h.landmarks.map((p, k) => ({
      x: p.x,
      y: p.y,
      z: dl?.[k] && dl?.[0] ? -sign * (dl[k].x - dl[0].x) : p.z
    }));
    return { ...h, landmarks, reach: typeof d.reach === 'number' ? d.reach : undefined, fused: true };
  });
}

const server = createServer((req, res) => {
  const url = req.url ?? '/';
  if (url.startsWith('/neural/status') || url.startsWith('/status')) {
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'no-store' });
    res.end(JSON.stringify(statusPayload()));
    return;
  }
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end('KANHA // SPATIAL OS Neural Relay — connect via WebSocket.\n');
});

const wss = new WebSocketServer({ server, maxPayload: 256 * 1024 });

wss.on('connection', (ws, req) => {
  const c = { role: 'consumer', id: nextId++, lastSeen: Date.now(), addr: req.socket.remoteAddress };
  clients.set(ws, c);
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    c.lastSeen = Date.now();
    switch (msg.type) {
      case 'hello': {
        const role = ['primary', 'depth', 'consumer'].includes(msg.role) ? msg.role : 'consumer';
        c.role = role;
        console.log(`[relay] #${c.id} ${role} connected from ${c.addr}`);
        ws.send(JSON.stringify(statusPayload()));
        broadcastStatus();
        break;
      }
      case 'landmarks': {
        if (c.role !== 'primary') return;
        lastPrimary = { at: Date.now(), hands: Array.isArray(msg.hands) ? msg.hands : [], aspect: msg.aspect ?? 4 / 3 };
        frames++;
        broadcast({ type: 'frame', hands: fuse(lastPrimary.hands), aspect: lastPrimary.aspect, sensors: sensors(), t: msg.t ?? Date.now() });
        break;
      }
      case 'depth': {
        if (c.role !== 'depth') return;
        lastDepth = { at: Date.now(), hands: Array.isArray(msg.hands) ? msg.hands : [] };
        break;
      }
      default:
        break;
    }
  });

  ws.on('close', () => {
    console.log(`[relay] #${c.id} ${c.role} disconnected`);
    clients.delete(ws);
    broadcastStatus();
  });
  ws.on('error', () => ws.terminate());
});

// Heartbeat: drop dead sockets; refresh sensor status for consumers.
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
  broadcastStatus();
}, 5000);

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[relay] port ${PORT} already in use — is another KANHA relay running?`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  KANHA // SPATIAL OS — Neural Relay online on ws://0.0.0.0:${PORT}`);
  const lan = lanAddresses();
  console.log('  Primary optic (this PC):  http://localhost:5173/gesture-service/optic-primary.html');
  for (const ip of lan) console.log(`  Depth optic (phone, run "npm run start:lan"): https://${ip}:5173/gesture-service/optic-depth.html`);
  console.log('');
});
