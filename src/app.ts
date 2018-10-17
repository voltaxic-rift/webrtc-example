import io from "socket.io-client";

const localVideo = document.getElementById("local_video") as HTMLVideoElement;
// let remoteVideo = document.getElementById("remote_video");
let localStream: MediaStream | null = null;
// let peerConnection = null;
// let textForSendSdp = document.getElementById("text_for_send_sdp");
// let textToReceiveSdp = document.getElementById("text_for_receive_sdp");

// ---- for multi party -----
const peerConnections: RTCPeerConnection[] = [];
// let remoteStreams = [];
const remoteVideos: HTMLVideoElement[] = [];
const MAX_CONNECTION_COUNT = 5;

// --- multi video ---
const container = document.getElementById("container") as HTMLElement;

// ----- use socket.io ---
const port = 3002;
const socket = io.connect("http://localhost:" + port + "/");
const room = getRoomName();
socket.on("connect", (evt: any) => {
    console.log("socket.io connected. enter room=" + room);
    socket.emit("enter", room);
});
socket.on("message", (message: any) => {
    console.log("message:", message);
    const fromId = message.from;

    if (message.type === "offer") {
        // -- got offer ---
        console.log("Received offer ...");
        const offer = new RTCSessionDescription(message);
        setOffer(fromId, offer);
    } else if (message.type === "answer") {
        // --- got answer ---
        console.log("Received answer ...");
        const answer = new RTCSessionDescription(message);
        setAnswer(fromId, answer);
    } else if (message.type === "candidate") {
        // --- got ICE candidate ---
        console.log("Received ICE candidate ...");
        const candidate = new RTCIceCandidate(message.ice);
        console.log(candidate);
        addIceCandidate(fromId, candidate);
    } else if (message.type === "call me") {
        if (!isReadyToConnect()) {
            console.log("Not ready to connect, so ignore");
            return;
        } else if (!canConnectMore()) {
            console.warn("TOO MANY connections, so ignore");
        }

        if (isConnectedWith(fromId)) {
            // already connnected, so skip
            console.log("already connected, so ignore");
        } else {
            // connect new party
            makeOffer(fromId);
        }
    } else if (message.type === "bye") {
        if (isConnectedWith(fromId)) {
            stopConnection(fromId);
        }
    }
});
socket.on("user disconnected", (evt: any) => {
    console.log("====user disconnected==== evt:", evt);
    const id = evt.id;
    if (isConnectedWith(id)) {
        stopConnection(id);
    }
});

// --- broadcast message to all members in room
function emitRoom(msg: any) {
    socket.emit("message", msg);
}

function emitTo(id: any, msg: any) {
    msg.sendto = id;
    socket.emit("message", msg);
}

// -- room名を取得 --
function getRoomName() { // たとえば、 URLに  ?roomname  とする
    const url = window.location.href;
    const args = url.split("?");
    if (args.length > 1) {
        const roomName = args[1];
        if (roomName !== "") {
            return roomName;
        }
    }
    return "_testroom";
}

// ---- for multi party -----
function isReadyToConnect() {
    return !!localStream;
}

// --- RTCPeerConnections ---
function getConnectionCount() {
    return peerConnections.length;
}

function canConnectMore() {
    return (getConnectionCount() < MAX_CONNECTION_COUNT);
}

function isConnectedWith(id: any) {
    return !!peerConnections[id];
}

function addConnection(id: any, peer: RTCPeerConnection) {
    peerConnections[id] = peer;
}

function getConnection(id: any) {
    const peer = peerConnections[id];
    return peer;
}

function deleteConnection(id: any) {
    delete peerConnections[id];
}

function stopConnection(id: any) {
    detachVideo(id);

    if (isConnectedWith(id)) {
        const peer = getConnection(id);
        peer.close();
        deleteConnection(id);
    }
}

function stopAllConnection() {
    for (const id in peerConnections) {
        if (peerConnections.hasOwnProperty(id)) {
            stopConnection(id);
        }
    }
}

// --- video elements ---
function attachVideo(id: any, stream: MediaStream) {
    const video = addRemoteVideoElement(id);
    playVideo(video, stream);
    video.volume = 1.0;
}

function detachVideo(id: any) {
    const video = getRemoteVideoElement(id);
    pauseVideo(video);
    deleteRemoteVideoElement(id);
}

function isRemoteVideoAttached(id: any) {
    return !!remoteVideos[id];
}

function addRemoteVideoElement(id: any) {
    const video = createVideoElement("remote_video_" + id);
    remoteVideos[id] = video;
    return video;
}

function getRemoteVideoElement(id: any) {
    const video = remoteVideos[id];
    return video;
}

function deleteRemoteVideoElement(id: any) {
    removeVideoElement("remote_video_" + id);
    delete remoteVideos[id];
}

function createVideoElement(elementId: string) {
    const video = document.createElement("video");
    video.width = 240;
    video.height = 180;
    video.id = elementId;

    video.style.border = "solid black 1px";
    video.style.margin = "2px";

    container.appendChild(video);

    return video;
}

function removeVideoElement(elementId: string) {
    const video = document.getElementById(elementId) as HTMLElement;

    container.removeChild(video);
    return video;
}

// ---------------------- media handling -----------------------
// start local video
function startVideo() {
    navigator.mediaDevices
        // audio: false <-- ontrack once, audio:true --> ontrack twice!!
        .getUserMedia({ video: true, audio: true })
        .then(stream => {
            localStream = stream;
            playVideo(localVideo, stream);
        }).catch(error => { // error
            console.error("getUserMedia error:", error);
            return;
        });
}

// stop local video
function stopVideo() {
    pauseVideo(localVideo);
    stopLocalStream(localStream!);
    localStream = null;
}

function stopLocalStream(stream: MediaStream) {
    const tracks = stream.getTracks();
    if (!tracks) {
        console.warn("NO tracks");
        return;
    }

    for (const track of tracks) {
        track.stop();
    }
}

function playVideo(element: HTMLVideoElement, stream: MediaStream) {
    if ("srcObject" in element) {
        element.srcObject = stream;
    } else {
        (element as HTMLVideoElement).src = window.URL.createObjectURL(stream);
    }
    element.play();
    element.volume = 0;
}

function pauseVideo(element: HTMLVideoElement) {
    element.pause();
    if ("srcObject" in element) {
        element.srcObject = null;
    } else {
        if ((element as HTMLVideoElement).src && ((element as HTMLVideoElement).src !== "")) {
            window.URL.revokeObjectURL((element as HTMLVideoElement).src);
        }
        (element as HTMLVideoElement).src = "";
    }
}

function sendSdp(id: any, sessionDescription: RTCSessionDescriptionInit) {
    console.log("---sending sdp ---");

    /*---
    textForSendSdp.value = sessionDescription.sdp;
    textForSendSdp.focus();
    textForSendSdp.select();
    ----*/

    const message = { type: sessionDescription.type, sdp: sessionDescription.sdp };
    console.log("sending SDP=" + message);
    // ws.send(message);
    emitTo(id, message);
}

function sendIceCandidate(id: any, candidate: RTCIceCandidate) {
    console.log("---sending ICE candidate ---");
    const obj = { type: "candidate", ice: candidate };
    // let message = JSON.stringify(obj);
    // console.log("sending candidate=" + message);
    // ws.send(message);

    if (isConnectedWith(id)) {
        emitTo(id, obj);
    } else {
        console.warn("connection NOT EXIST or ALREADY CLOSED. so skip candidate");
    }
}

// ---------------------- connection handling -----------------------
function prepareNewConnection(id: any) {
    const pc_config = { iceServers: [] };
    const peer = new RTCPeerConnection(pc_config);

    // --- on get remote stream ---
    peer.ontrack = event => {
        const stream = event.streams[0];
        console.log("-- peer.ontrack() stream.id=" + stream.id);
        if (isRemoteVideoAttached(id)) {
            console.log("stream already attached, so ignore");
        } else {
            // playVideo(remoteVideo, stream);
            attachVideo(id, stream);
        }

        stream.onremovetrack = () => {
            localStream!.getTracks().forEach(track => {
                peer.removeTrack(peer.addTrack(track, localStream!));
            });
            detachVideo(id);
        };
    };

    // --- on get local ICE candidate
    peer.onicecandidate = evt => {
        if (evt.candidate) {
            console.log(evt.candidate);

            // Trickle ICE の場合は、ICE candidateを相手に送る
            sendIceCandidate(id, evt.candidate);

            // Vanilla ICE の場合には、何もしない
        } else {
            console.log("empty ice event");

            // Trickle ICE の場合は、何もしない

            // Vanilla ICE の場合には、ICE candidateを含んだSDPを相手に送る
            // sendSdp(id, peer.localDescription);
        }
    };

    // --- when need to exchange SDP ---
    peer.onnegotiationneeded = evt => {
        console.log("-- onnegotiationneeded() ---");
    };

    // --- other events ----
    peer.onicecandidateerror = evt => {
        console.error("ICE candidate ERROR:", evt);
    };

    peer.onsignalingstatechange = () => {
        console.log("== signaling status=" + peer.signalingState);
    };

    peer.oniceconnectionstatechange = () => {
        console.log("== ice connection status=" + peer.iceConnectionState);
        if (peer.iceConnectionState === "disconnected") {
            console.log("-- disconnected --");
            // hangUp();
            stopConnection(id);
        }
    };

    peer.onicegatheringstatechange = () => {
        console.log("==***== ice gathering state=" + peer.iceGatheringState);
    };

    peer.onconnectionstatechange = () => {
        console.log("==***== connection state=" + peer.connectionState);
    };

    // -- add local stream --
    if (localStream) {
        console.log("Adding local stream...");
        localStream.getTracks().forEach(track => {
            peer.addTrack(track, localStream!);
        });
    } else {
        console.warn("no local stream, but continue.");
    }

    return peer;
}

function makeOffer(id: any) {
    const peerConnection = prepareNewConnection(id);
    addConnection(id, peerConnection);

    peerConnection.createOffer()
        .then(sessionDescription => {
            console.log("createOffer() succsess in promise");
            return peerConnection.setLocalDescription(sessionDescription);
        }).then(() => {
            console.log("setLocalDescription() succsess in promise");

            // -- Trickle ICE の場合は、初期SDPを相手に送る --
            sendSdp(id, peerConnection.localDescription!);

            // -- Vanilla ICE の場合には、まだSDPは送らない --
        }).catch(err => {
            console.error(err);
        });
}

function setOffer(id: any, sessionDescription: RTCSessionDescriptionInit) {
    /*
    if (peerConnection) {
      console.error("peerConnection alreay exist!");
    }
    */
    const peerConnection = prepareNewConnection(id);
    addConnection(id, peerConnection);

    peerConnection.setRemoteDescription(sessionDescription)
        .then(() => {
            console.log("setRemoteDescription(offer) succsess in promise");
            makeAnswer(id);
        }).catch(err => {
            console.error("setRemoteDescription(offer) ERROR: ", err);
        });
}

function makeAnswer(id: any) {
    console.log("sending Answer. Creating remote session description...");
    const peerConnection = getConnection(id);
    if (!peerConnection) {
        console.error("peerConnection NOT exist!");
        return;
    }

    peerConnection.createAnswer()
        .then(sessionDescription => {
            console.log("createAnswer() succsess in promise");
            return peerConnection.setLocalDescription(sessionDescription);
        }).then(() => {
            console.log("setLocalDescription() succsess in promise");

            // -- Trickle ICE の場合は、初期SDPを相手に送る --
            sendSdp(id, peerConnection.localDescription!);

            // -- Vanilla ICE の場合には、まだSDPは送らない --
        }).catch(err => {
            console.error(err);
        });
}

function setAnswer(id: any, sessionDescription: RTCSessionDescriptionInit) {
    const peerConnection = getConnection(id);
    if (!peerConnection) {
        console.error("peerConnection NOT exist!");
        return;
    }

    peerConnection.setRemoteDescription(sessionDescription)
        .then(() => {
            console.log("setRemoteDescription(answer) succsess in promise");
        }).catch(err => {
            console.error("setRemoteDescription(answer) ERROR: ", err);
        });
}

// --- tricke ICE ---
function addIceCandidate(id: any, candidate: RTCIceCandidate) {
    if (!isConnectedWith(id)) {
        console.warn("NOT CONNEDTED or ALREADY CLOSED with id=" + id + ", so ignore candidate");
        return;
    }

    const peerConnection = getConnection(id);
    if (peerConnection) {
        peerConnection.addIceCandidate(candidate);
    } else {
        console.error("PeerConnection not exist!");
        return;
    }
}

// start PeerConnection
function connect() {
    /*
    debugger; // SHOULD NOT COME HERE

    if (! peerConnection) {
      console.log("make Offer");
      makeOffer();
    }
    else {
      console.warn("peer already exist.");
    }
    */

    if (!isReadyToConnect()) {
        console.warn("NOT READY to connect");
    } else if (!canConnectMore()) {
        console.log("TOO MANY connections");
    } else {
        callMe();
    }
}

// close PeerConnection
function hangUp() {
    /*
    if (peerConnection) {
      console.log("Hang up.");
      peerConnection.close();
      peerConnection = null;
      pauseVideo(remoteVideo);
    }
    else {
      console.warn("peer NOT exist.");
    }
    */

    emitRoom({ type: "bye" });
    stopAllConnection();
}

// ---- multi party --
function callMe() {
    emitRoom({ type: "call me" });
}

(document.getElementById("startVideo") as HTMLButtonElement).onclick = startVideo;
(document.getElementById("stopVideo") as HTMLButtonElement).onclick = stopVideo;
(document.getElementById("connect") as HTMLButtonElement).onclick = connect;
(document.getElementById("hangUp") as HTMLButtonElement).onclick = hangUp;
