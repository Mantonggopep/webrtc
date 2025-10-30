// server.js
import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import cors from "cors";

const app = express();
app.use(cors());
app.get("/", (req, res) => res.send("✅ WebRTC Audio Backend is running."));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const users = new Map();

wss.on("connection", (ws) => {
  console.log("🔗 Client connected");

  ws.on("message", (message) => {
    const data = JSON.parse(message);

    switch (data.type) {
      case "login":
        ws.username = data.payload.username;
        users.set(ws.username, ws);
        ws.send(JSON.stringify({ type: "login-success" }));
        broadcastUsers();
        break;

      case "call":
      case "offer":
      case "answer":
      case "candidate":
      case "hangup":
      case "accept":
      case "reject":
        const target = users.get(data.payload.target);
        if (target && target.readyState === ws.OPEN) {
          target.send(JSON.stringify(data));
        }
        break;
    }
  });

  ws.on("close", () => {
    if (ws.username) users.delete(ws.username);
    broadcastUsers();
  });
});

function broadcastUsers() {
  const list = [...users.keys()];
  for (const [_, client] of users) {
    client.send(JSON.stringify({ type: "users", users: list }));
  }
}

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
