// server.js
import express from "express";
import { WebSocketServer } from "ws";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const users = new Map();

wss.on("connection", (ws) => {
  console.log("New connection");

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);
      switch (data.type) {
        case "login":
          ws.username = data.username;
          users.set(data.username, ws);
          sendUserList();
          break;

        case "offer":
        case "answer":
        case "candidate":
        case "end-call":
        case "reject-call":
          const target = users.get(data.target);
          if (target && target.readyState === target.OPEN) {
            target.send(JSON.stringify(data));
          }
          break;

        default:
          break;
      }
    } catch (err) {
      console.error("Message error:", err);
    }
  });

  ws.on("close", () => {
    if (ws.username) users.delete(ws.username);
    sendUserList();
  });

  function sendUserList() {
    const onlineUsers = [...users.keys()];
    for (const [_, userWs] of users.entries()) {
      userWs.send(
        JSON.stringify({ type: "user-list", users: onlineUsers })
      );
    }
  }
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Signaling server running on port ${PORT}`);
});