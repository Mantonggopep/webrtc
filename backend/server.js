// server.js
import express from "express";
import { WebSocketServer } from "ws";
import http from "http";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// ✅ Simple status route for Render
app.get("/", (req, res) => {
  res.send("✅ WebRTC Signaling Server is running...");
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Store connected users
const users = new Map();

wss.on("connection", (ws) => {
  console.log("🟢 New connection");

  ws.on("message", (message) => {
    const data = JSON.parse(message);
    const { type, payload } = data;

    switch (type) {
      case "login": {
        const { username } = payload;
        users.set(username, ws);
        console.log(`👤 ${username} logged in`);
        ws.send(JSON.stringify({ type: "login-success" }));
        broadcastUsers();
        break;
      }

      case "call": {
        const { target, from } = payload;
        const targetSocket = users.get(target);
        if (targetSocket) {
          targetSocket.send(JSON.stringify({ type: "incoming-call", from }));
        }
        break;
      }

      case "accept": {
        const { from, to } = payload;
        const callerSocket = users.get(from);
        if (callerSocket) {
          callerSocket.send(JSON.stringify({ type: "call-accepted", from: to }));
        }
        break;
      }

      case "reject": {
        const { from, to } = payload;
        const callerSocket = users.get(from);
        if (callerSocket) {
          callerSocket.send(JSON.stringify({ type: "call-rejected", from: to }));
        }
        break;
      }

      case "offer":
      case "answer":
      case "candidate": {
        const { target } = payload;
        const targetSocket = users.get(target);
        if (targetSocket) {
          targetSocket.send(JSON.stringify({ type, ...payload }));
        }
        break;
      }

      case "hangup": {
        const { target, from } = payload;
        const targetSocket = users.get(target);
        if (targetSocket) {
          targetSocket.send(JSON.stringify({ type: "hangup", from }));
        }
        break;
      }

      default:
        console.log("⚙️ Unknown type:", type);
    }
  });

  ws.on("close", () => {
    for (const [username, socket] of users.entries()) {
      if (socket === ws) {
        users.delete(username);
        console.log(`❌ ${username} disconnected`);
        broadcastUsers();
      }
    }
  });
});

function broadcastUsers() {
  const userList = Array.from(users.keys());
  for (const socket of users.values()) {
    socket.send(JSON.stringify({ type: "users", users: userList }));
  }
}

server.listen(PORT, "0.0.0.0", () =>
  console.log(`✅ Server running on http://0.0.0.0:${PORT}`)
);