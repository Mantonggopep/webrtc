// frontend/main.js
let ws;
let username = localStorage.getItem("username") || null;
let peer;
let localStream;
let currentCall = null;
let callStartTime = null;
let callTimer;
const ringtone = document.getElementById("ringtone");

const loginSection = document.getElementById("loginSection");
const appSection = document.getElementById("appSection");
const userList = document.getElementById("userList");
const loginBtn = document.getElementById("loginBtn");
const usernameInput = document.getElementById("usernameInput");
const statusText = document.getElementById("statusText");
const callInfo = document.getElementById("callInfo");
const endCallBtn = document.getElementById("endCallBtn");

loginBtn.addEventListener("click", login);

function login() {
  const name = usernameInput.value.trim();
  if (!name) return alert("Please enter a username");
  username = name;
  localStorage.setItem("username", username);
  connectWebSocket();
}

function connectWebSocket() {
  ws = new WebSocket("ws://localhost:8080");

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: "login", payload: { username } }));
  };

  ws.onmessage = async (event) => {
    const data = JSON.parse(event.data);
    switch (data.type) {
      case "login-success":
        loginSection.style.display = "none";
        appSection.style.display = "block";
        break;

      case "users":
        updateUserList(data.users);
        break;

      case "incoming-call":
        ringtone.play();
        const accept = confirm(`Incoming call from ${data.from}. Accept?`);
        ringtone.pause();
        if (accept) {
          startCall(data.from, true);
          ws.send(JSON.stringify({ type: "accept", payload: { from: data.from, to: username } }));
        } else {
          ws.send(JSON.stringify({ type: "reject", payload: { from: data.from, to: username } }));
        }
        break;

      case "call-accepted":
        createOffer(data.from);
        break;

      case "offer":
        await handleOffer(data.offer, data.from);
        break;

      case "answer":
        await peer.setRemoteDescription(new RTCSessionDescription(data.answer));
        break;

      case "candidate":
        if (peer) await peer.addIceCandidate(new RTCIceCandidate(data.candidate));
        break;

      case "hangup":
        endCall();
        break;
    }
  };

  ws.onclose = () => {
    console.log("Connection closed. Reconnecting...");
    setTimeout(connectWebSocket, 2000);
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
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
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

  if (isReceiver) return;

  createOffer(target);
}

async function createOffer(target) {
  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);
  ws.send(JSON.stringify({ type: "offer", payload: { target, offer, from: username } }));
}

async function handleOffer(offer, from) {
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
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
  ws.send(JSON.stringify({ type: "hangup", payload: { target: currentCall, from: username } }));
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
