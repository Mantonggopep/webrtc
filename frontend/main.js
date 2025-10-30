// frontend/main.js

let ws;
let username = localStorage.getItem("username") || null;
let peer;
let localStream;
let currentCall = null;
let callStartTime = null;
let callTimer;
const ringtone = new Audio("./assets/ringtone.mp3");
ringtone.loop = true;

// ✅ Detect environment automatically
const signalingServer =
  location.hostname === "localhost"
    ? "ws://localhost:8080"
    : "wss://webrtc-backend.onrender.com"; // 🔁 replace with your Render URL

// DOM elements
const loginSection = document.getElementById("loginSection");
const appSection = document.getElementById("appSection");
const userList = document.getElementById("userList");
const loginBtn = document.getElementById("loginBtn");
const usernameInput = document.getElementById("usernameInput");
const statusText = document.getElementById("statusText");
const callInfo = document.getElementById("callInfo");
const endCallBtn = document.getElementById("endCallBtn");

// ✅ Auto-login if user exists
if (username) {
  usernameInput.value = username;
  connectWebSocket();
}

loginBtn.addEventListener("click", login);

function login() {
  const name = usernameInput.value.trim();
  if (!name) return alert("Please enter a username");
  username = name;
  localStorage.setItem("username", username);
  connectWebSocket();
}

function connectWebSocket() {
  ws = new WebSocket(signalingServer);

  ws.onopen = () => {
    console.log("✅ Connected to signaling server");
    ws.send(JSON.stringify({ type: "login", payload: { username } }));
  };

  ws.onmessage = async (event) => {
    const data = JSON.parse(event.data);

    switch (data.type) {
      case "login-success":
        console.log("🟢 Logged in as", username);
        loginSection.style.display = "none";
        appSection.style.display = "block";
        break;

      case "users":
        updateUserList(data.users);
        break;

      case "incoming-call":
        console.log("📞 Incoming call from", data.from);
        ringtone.play();
        const accept = confirm(`Incoming call from ${data.from}. Accept?`);
        ringtone.pause();
        ringtone.currentTime = 0;
        if (accept) {
          startCall(data.from, true);
          ws.send(JSON.stringify({ type: "accept", payload: { from: data.from, to: username } }));
        } else {
          ws.send(JSON.stringify({ type: "reject", payload: { from: data.from, to: username } }));
        }
        break;

      case "call-accepted":
        console.log("✅ Call accepted by", data.from);
        createOffer(data.from);
        break;

      case "offer":
        console.log("📨 Offer received from", data.from);
        await handleOffer(data.offer, data.from);
        break;

      case "answer":
        console.log("📨 Answer received from", data.from);
        await peer.setRemoteDescription(new RTCSessionDescription(data.answer));
        startTimer();
        callInfo.style.display = "block";
        statusText.textContent = `In call with ${data.from}`;
        break;

      case "candidate":
        if (peer && data.candidate) {
          await peer.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
        break;

      case "call-rejected":
        console.log("🚫 Call rejected by", data.from);
        endCall();
        break;

      case "hangup":
        console.log("🛑 Call ended by", data.from);
        endCall();
        break;

      default:
        console.log("⚙️ Unknown signal:", data);
    }
  };

  ws.onclose = () => {
    console.warn("⚠️ Connection closed. Reconnecting...");
    setTimeout(connectWebSocket, 2000);
  };

  ws.onerror = (err) => {
    console.error("❌ WebSocket error:", err);
    ws.close();
  };
}

function updateUserList(users) {
  userList.innerHTML = "";
  users
    .filter((u) => u !== username)
    .forEach((u) => {
      const li = document.createElement("li");
      li.textContent = u + " ";

      const callBtn = document.createElement("button");
      callBtn.textContent = "📞 Call";
      callBtn.className =
        "bg-green-500 hover:bg-green-600 text-white rounded px-3 py-1 ml-2 transition";
      callBtn.onclick = () => initiateCall(u);

      li.appendChild(callBtn);
      userList.appendChild(li);
    });
}

async function initiateCall(target) {
  currentCall = target;
  callStartTime = new Date();
  callInfo.style.display = "block";
  statusText.textContent = `Calling ${target}...`;

  startCall(target, false);
  ws.send(JSON.stringify({ type: "call", payload: { target, from: username } }));
}

async function startCall(target, isReceiver) {
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  peer = new RTCPeerConnection();

  localStream.getTracks().forEach((t) => peer.addTrack(t, localStream));

  peer.ontrack = (event) => {
    const audio = new Audio();
    audio.srcObject = event.streams[0];
    audio.play();
  };

  peer.onicecandidate = (event) => {
    if (event.candidate) {
      ws.send(
        JSON.stringify({
          type: "candidate",
          payload: { target, candidate: event.candidate, from: username },
        })
      );
    }
  };

  if (!isReceiver) {
    createOffer(target);
  }
}

async function createOffer(target) {
  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);
  ws.send(JSON.stringify({ type: "offer", payload: { target, offer, from: username } }));
}

async function handleOffer(offer, from) {
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  peer = new RTCPeerConnection();

  localStream.getTracks().forEach((t) => peer.addTrack(t, localStream));

  peer.ontrack = (event) => {
    const audio = new Audio();
    audio.srcObject = event.streams[0];
    audio.play();
  };

  peer.onicecandidate = (event) => {
    if (event.candidate) {
      ws.send(
        JSON.stringify({
          type: "candidate",
          payload: { target: from, candidate: event.candidate, from: username },
        })
      );
    }
  };

  await peer.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await peer.createAnswer();
  await peer.setLocalDescription(answer);
  ws.send(JSON.stringify({ type: "answer", payload: { target: from, answer, from: username } }));

  startTimer();
  callInfo.style.display = "block";
  statusText.textContent = `In call with ${from}`;
}

function endCall() {
  if (peer) peer.close();
  peer = null;
  stopTimer();
  statusText.textContent = "Call ended";
  setTimeout(() => (callInfo.style.display = "none"), 1500);
}

endCallBtn.onclick = () => {
  if (currentCall) {
    ws.send(JSON.stringify({ type: "hangup", payload: { target: currentCall, from: username } }));
  }
  endCall();
};

function startTimer() {
  const start = Date.now();
  callTimer = setInterval(() => {
    const secs = Math.floor((Date.now() - start) / 1000);
    statusText.textContent = `In call — ${secs}s`;
  }, 1000);
}

function stopTimer() {
  clearInterval(callTimer);
}
