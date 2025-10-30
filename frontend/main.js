// frontend/main.js

let ws;
let username = localStorage.getItem("username") || null;
let peer;
let localStream;
let currentCall = null;
let callTimer;
const ringtone = new Audio("./assets/ringtone.mp3");
ringtone.loop = true;

// ✅ Use correct Render WebSocket URL
const signalingServer =
  location.hostname === "localhost"
    ? "ws://localhost:8080"
    : "wss://webrtc-1-vjn2.onrender.com";

// DOM elements
const loginSection = document.getElementById("loginSection");
const appSection = document.getElementById("appSection");
const userList = document.getElementById("userList");
const loginBtn = document.getElementById("loginBtn");
const usernameInput = document.getElementById("usernameInput");
const statusText = document.getElementById("statusText");
const callInfo = document.getElementById("callInfo");
const endCallBtn = document.getElementById("endCallBtn");

// ✅ Auto-login if username exists
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
    ws.send(JSON.stringify({ type: "login", username }));
  };

  ws.onmessage = async (event) => {
    const data = JSON.parse(event.data);

    switch (data.type) {
      case "user-list":
        updateUserList(data.users);
        break;

      case "offer":
        console.log("📨 Offer received from", data.from);
        await handleOffer(data);
        break;

      case "answer":
        console.log("📨 Answer received from", data.from);
        await peer.setRemoteDescription(new RTCSessionDescription(data.answer));
        startTimer();
        statusText.textContent = `In call with ${data.from}`;
        callInfo.style.display = "block";
        break;

      case "candidate":
        if (peer && data.candidate) {
          await peer.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
        break;

      case "end-call":
        console.log("🛑 Call ended by", data.from);
        endCall();
        break;

      case "reject-call":
        console.log("🚫 Call rejected by", data.from);
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
  };
}

// ✅ Update list of online users
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

// ✅ Start calling another user
async function initiateCall(target) {
  currentCall = target;
  statusText.textContent = `Calling ${target}...`;
  callInfo.style.display = "block";

  await startCall(target, false);
}

// ✅ Prepare audio stream and peer connection
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
          target,
          candidate: event.candidate,
          from: username,
        })
      );
    }
  };

  if (!isReceiver) {
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    ws.send(
      JSON.stringify({ type: "offer", target, offer, from: username })
    );
  }
}

// ✅ Handle incoming offer
async function handleOffer(data) {
  const { offer, from } = data;

  const accept = confirm(`Incoming call from ${from}. Accept?`);
  if (!accept) {
    ws.send(JSON.stringify({ type: "reject-call", target: from, from: username }));
    return;
  }

  ringtone.pause();
  ringtone.currentTime = 0;

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
          target: from,
          candidate: event.candidate,
          from: username,
        })
      );
    }
  };

  await peer.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await peer.createAnswer();
  await peer.setLocalDescription(answer);
  ws.send(JSON.stringify({ type: "answer", target: from, answer, from: username }));

  startTimer();
  statusText.textContent = `In call with ${from}`;
  callInfo.style.display = "block";
}

// ✅ End call manually or remotely
function endCall() {
  if (peer) peer.close();
  peer = null;
  stopTimer();
  statusText.textContent = "Call ended";
  setTimeout(() => (callInfo.style.display = "none"), 1500);
}

endCallBtn.onclick = () => {
  if (currentCall) {
    ws.send(JSON.stringify({ type: "end-call", target: currentCall, from: username }));
  }
  endCall();
};

// ✅ Timer handling
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