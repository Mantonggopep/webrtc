// backend/server.js
// Minimal WebRTC signaling server using WebSocket (no third-party services)

const WebSocket = require("ws");
const http = require("http");

const server = http.createServer();
const wss = new WebSocket.Server({ server });

const users = new Map(); // username -> { ws, username }

function broadcastUsers() {
  const list = Array.from(users.keys());
  const payload = JSON.stringify({ type: "users", users: list });
  for (const { ws } of users.values()) {
    if (ws.readyState === WebSocket.OPEN) ws.send(payload);
  }
}

function sendTo(ws, message) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
}

wss.on("connection", (ws) => {
  let currentUser = null;

  ws.on("message", (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch {
      return;
    }

    const { type, payload } = data;

    switch (type) {
      case "login": {
        const username = payload.username.trim();
        if (!username) return;
        // If username already exists, replace old connection
        if (users.has(username)) {
          const old = users.get(username);
          if (old.ws !== ws && old.ws.readyState === WebSocket.OPEN) {
            old.ws.close(); // kick old session
          }
        }
        users.set(username, { ws, username });
        currentUser = username;
        console.log(`[LOGIN] ${username}`);
        sendTo(ws, { type: "login-success", username });
        broadcastUsers();
        break;
      }

      case "call": {
        const { target, from } = payload;
        const callee = users.get(target);
        if (callee) {
          sendTo(callee.ws, { type: "incoming-call", from });
        } else {
          sendTo(ws, { type: "error", message: "User not available" });
        }
        break;
      }

      case "accept": {
        const { from, to } = payload;
        const caller = users.get(from);
        if (caller) {
          sendTo(caller.ws, { type: "call-accepted", from: to });
        }
        break;
      }

      case "reject": {
        const { from, to } = payload;
        const caller = users.get(from);
        if (caller) {
          sendTo(caller.ws, { type: "call-rejected", from: to });
        }
        break;
      }

      case "offer": {
        const { target, offer, from } = payload;
        const callee = users.get(target);
        if (callee) sendTo(callee.ws, { type: "offer", offer, from });
        break;
      }

      case "answer": {
        const { target, answer, from } = payload;
        const caller = users.get(target);
        if (caller) sendTo(caller.ws, { type: "answer", answer, from });
        break;
      }

      case "candidate": {
        const { target, candidate, from } = payload;
        const user = users.get(target);
        if (user) sendTo(user.ws, { type: "candidate", candidate, from });
        break;
      }

      case "hangup": {
        const { target, from } = payload;
        const user = users.get(target);
        if (user) sendTo(user.ws, { type: "hangup", from });
        break;
      }

      case "heartbeat": {
        sendTo(ws, { type: "pong" });
        break;
      }

      default:
        console.log("Unknown message:", data);
    }
  });

  ws.on("close", () => {
    if (currentUser && users.has(currentUser)) {
      users.delete(currentUser);
      console.log(`[LOGOUT] ${currentUser}`);
      broadcastUsers();
    }
  });
});

const PORT = 8080;
server.listen(PORT, () => console.log(`✅ Signaling server running on ws://localhost:${PORT}`));
// WebRTC signaling server 
