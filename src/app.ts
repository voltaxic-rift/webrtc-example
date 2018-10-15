import io from 'socket.io-client';

let localVideo = document.getElementById('local_video');
//let remoteVideo = document.getElementById('remote_video');
let localStream: any = null;
//let peerConnection = null;
//let textForSendSdp = document.getElementById('text_for_send_sdp');
//let textToReceiveSdp = document.getElementById('text_for_receive_sdp');

// ---- for multi party -----
let peerConnections: any = [];
//let remoteStreams = [];
let remoteVideos: any = [];
const MAX_CONNECTION_COUNT = 3;

// --- multi video ---
let container: any = document.getElementById('container');
_assert('container', container);

// --- prefix -----
navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia ||
    navigator.mozGetUserMedia || navigator.msGetUserMedia;

/*---
// -------- websocket ----
// please use node.js app
//
// or you can use chrome app (only work with Chrome)
//  https://chrome.google.com/webstore/detail/simple-message-server/bihajhgkmpfnmbmdnobjcdhagncbkmmp
//
let wsUrl = 'ws://localhost:3001/';
let ws = new WebSocket(wsUrl);
ws.onopen = function(evt) {
  console.log('ws open()');
};
ws.onerror = function(err) {
  console.error('ws onerror() ERR:', err);
};
ws.onmessage = function(evt) {
  console.log('ws onmessage() data:', evt.data);
  let message = JSON.parse(evt.data);
  if (message.type === 'offer') {
    // -- got offer ---
    console.log('Received offer ...');
    textToReceiveSdp.value = message.sdp;
    let offer = new RTCSessionDescription(message);
    setOffer(offer);
  }
  else if (message.type === 'answer') {
    // --- got answer ---
    console.log('Received answer ...');
    textToReceiveSdp.value = message.sdp;
    let answer = new RTCSessionDescription(message);
    setAnswer(answer);
  }
  else if (message.type === 'candidate') {
    // --- got ICE candidate ---
    console.log('Received ICE candidate ...');
    let candidate = new RTCIceCandidate(message.ice);
    console.log(candidate);
    addIceCandidate(candidate);
  }
};
--*/

// ----- use socket.io ---
let port = 3002;
let socket = io.connect('http://localhost:' + port + '/');
let room = getRoomName();
socket.on('connect', (evt: any) => {
    console.log('socket.io connected. enter room=' + room );
    socket.emit('enter', room);
});
socket.on('message', (message: any) => {
    console.log('message:', message);
    let fromId = message.from;

    if (message.type === 'offer') {
        // -- got offer ---
        console.log('Received offer ...');
        let offer = new RTCSessionDescription(message);
        setOffer(fromId, offer);
    }
    else if (message.type === 'answer') {
        // --- got answer ---
        console.log('Received answer ...');
        let answer = new RTCSessionDescription(message);
        setAnswer(fromId, answer);
    }
    else if (message.type === 'candidate') {
        // --- got ICE candidate ---
        console.log('Received ICE candidate ...');
        let candidate = new RTCIceCandidate(message.ice);
        console.log(candidate);
        addIceCandidate(fromId, candidate);
    }
    else if (message.type === 'call me') {
        if (! isReadyToConnect()) {
            console.log('Not ready to connect, so ignore');
            return;
        }
        else if (! canConnectMore()) {
            console.warn('TOO MANY connections, so ignore');
        }

        if (isConnectedWith(fromId)) {
            // already connnected, so skip
            console.log('already connected, so ignore');
        }
        else {
            // connect new party
            makeOffer(fromId);
        }
    }
    else if (message.type === 'bye') {
        if (isConnectedWith(fromId)) {
            stopConnection(fromId);
        }
    }
});
socket.on('user disconnected', (evt: any) => {
    console.log('====user disconnected==== evt:', evt);
    let id = evt.id;
    if (isConnectedWith(id)) {
        stopConnection(id);
    }
});

// --- broadcast message to all members in room
function emitRoom(msg: any) {
    socket.emit('message', msg);
}

function emitTo(id: any, msg: any) {
    msg.sendto = id;
    socket.emit('message', msg);
}

// -- room名を取得 --
function getRoomName() { // たとえば、 URLに  ?roomname  とする
    let url = window.location.href;
    let args = url.split('?');
    if (args.length > 1) {
        let room = args[1];
        if (room != '') {
            return room;
        }
    }
    return '_testroom';
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

function addConnection(id: any, peer: any) {
    _assert('addConnection() peer', peer);
    _assert('addConnection() peer must NOT EXIST', (! peerConnections[id]));
    peerConnections[id] = peer;
}

function getConnection(id: any) {
    let peer = peerConnections[id];
    _assert('getConnection() peer must exist', peer);
    return peer;
}

function deleteConnection(id: any) {
    _assert('deleteConnection() peer must exist', peerConnections[id]);
    delete peerConnections[id];
}

function stopConnection(id: any) {
    detachVideo(id);

    if (isConnectedWith(id)) {
        let peer = getConnection(id);
        peer.close();
        deleteConnection(id);
    }
}

function stopAllConnection() {
    for (let id in peerConnections) {
        if(peerConnections.hasOwnProperty(id)){
            stopConnection(id);
        }
    }
}

// --- video elements ---
function attachVideo(id: any, stream: any) {
    let video = addRemoteVideoElement(id);
    playVideo(video, stream);
    video.volume = 1.0;
}

function detachVideo(id: any) {
    let video = getRemoteVideoElement(id);
    pauseVideo(video);
    deleteRemoteVideoElement(id);
}

function isRemoteVideoAttached(id: any) {
    return !!remoteVideos[id];
}

function addRemoteVideoElement(id: any) {
    _assert('addRemoteVideoElement() video must NOT EXIST', (! remoteVideos[id]));
    let video = createVideoElement('remote_video_' + id);
    remoteVideos[id] = video;
    return video;
}

function getRemoteVideoElement(id: any) {
    let video = remoteVideos[id];
    _assert('getRemoteVideoElement() video must exist', video);
    return video;
}

function deleteRemoteVideoElement(id: any) {
    _assert('deleteRemoteVideoElement() stream must exist', remoteVideos[id]);
    removeVideoElement('remote_video_' + id);
    delete remoteVideos[id];
}

function createVideoElement(elementId: any) {
    let video = document.createElement('video');
    video.width = 240;
    video.height = 180;
    video.id = elementId;

    video.style.border = 'solid black 1px';
    video.style.margin = '2px';

    container.appendChild(video);

    return video;
}

function removeVideoElement(elementId: any) {
    let video = document.getElementById(elementId);
    _assert('removeVideoElement() video must exist', video);

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
        console.error('getUserMedia error:', error);
        return;
    });
}

// stop local video
function stopVideo() {
    pauseVideo(localVideo);
    stopLocalStream(localStream);
    localStream = null;
}

function stopLocalStream(stream: any) {
    let tracks = stream.getTracks();
    if (! tracks) {
        console.warn('NO tracks');
        return;
    }

    for (let track of tracks) {
        track.stop();
    }
}

function playVideo(element: any, stream: any) {
    if ('srcObject' in element) {
        element.srcObject = stream;
    }
    else {
        element.src = window.URL.createObjectURL(stream);
    }
    element.play();
    element.volume = 0;
}

function pauseVideo(element: any) {
    element.pause();
    if ('srcObject' in element) {
        element.srcObject = null;
    }
    else {
        if (element.src && (element.src !== '') ) {
            window.URL.revokeObjectURL(element.src);
        }
        element.src = '';
    }
}

/*--
// ----- hand signaling ----
function onSdpText() {
  let text = textToReceiveSdp.value;
  if (peerConnection) {
    console.log('Received answer text...');
    let answer = new RTCSessionDescription({
      type : 'answer',
      sdp : text,
    });
    setAnswer(answer);
  }
  else {
    console.log('Received offer text...');
    let offer = new RTCSessionDescription({
      type : 'offer',
      sdp : text,
    });
    setOffer(offer);
  }
  textToReceiveSdp.value ='';
}
--*/

function sendSdp(id: any, sessionDescription: any) {
    console.log('---sending sdp ---');

    /*---
    textForSendSdp.value = sessionDescription.sdp;
    textForSendSdp.focus();
    textForSendSdp.select();
    ----*/

    let message = { type: sessionDescription.type, sdp: sessionDescription.sdp };
    console.log('sending SDP=' + message);
    //ws.send(message);
    emitTo(id, message);
}

function sendIceCandidate(id: any, candidate: any) {
    console.log('---sending ICE candidate ---');
    let obj = { type: 'candidate', ice: candidate };
    //let message = JSON.stringify(obj);
    //console.log('sending candidate=' + message);
    //ws.send(message);

    if (isConnectedWith(id)) {
        emitTo(id, obj);
    }
    else {
        console.warn('connection NOT EXIST or ALREADY CLOSED. so skip candidate')
    }
}

// ---------------------- connection handling -----------------------
function prepareNewConnection(id: any) {
    let pc_config = {"iceServers":[]};
    let peer = new RTCPeerConnection(pc_config);

    // --- on get remote stream ---
    peer.ontrack = (event: any) => {
        let stream = event.streams[0];
        console.log('-- peer.ontrack() stream.id=' + stream.id);
        if (isRemoteVideoAttached(id)) {
            console.log('stream already attached, so ignore');
        }
        else {
            //playVideo(remoteVideo, stream);
            attachVideo(id, stream);
        }

        stream.onremovetrack = (event: any) => {
            localStream.getTracks().forEach((track: any) => {
                peer.removeTrack(peer.addTrack(track, localStream));
            });
            detachVideo(id);
        };
    };

    // --- on get local ICE candidate
    peer.onicecandidate = function (evt) {
        if (evt.candidate) {
            console.log(evt.candidate);

            // Trickle ICE の場合は、ICE candidateを相手に送る
            sendIceCandidate(id, evt.candidate);

            // Vanilla ICE の場合には、何もしない
        } else {
            console.log('empty ice event');

            // Trickle ICE の場合は、何もしない

            // Vanilla ICE の場合には、ICE candidateを含んだSDPを相手に送る
            //sendSdp(id, peer.localDescription);
        }
    };

    // --- when need to exchange SDP ---
    peer.onnegotiationneeded = function(evt) {
        console.log('-- onnegotiationneeded() ---');
    };

    // --- other events ----
    peer.onicecandidateerror = function (evt) {
        console.error('ICE candidate ERROR:', evt);
    };

    peer.onsignalingstatechange = function() {
        console.log('== signaling status=' + peer.signalingState);
    };

    peer.oniceconnectionstatechange = function() {
        console.log('== ice connection status=' + peer.iceConnectionState);
        if (peer.iceConnectionState === 'disconnected') {
            console.log('-- disconnected --');
            //hangUp();
            stopConnection(id);
        }
    };

    peer.onicegatheringstatechange = function() {
        console.log('==***== ice gathering state=' + peer.iceGatheringState);
    };

    peer.onconnectionstatechange = function() {
        console.log('==***== connection state=' + peer.connectionState);
    };

    // -- add local stream --
    if (localStream) {
        console.log('Adding local stream...');
        localStream.getTracks().forEach((track: any) => {
           peer.addTrack(track, localStream);
        });
    }
    else {
        console.warn('no local stream, but continue.');
    }

    return peer;
}

function makeOffer(id: any) {
    _assert('makeOffer must not connected yet', (! isConnectedWith(id)) );
    let peerConnection = prepareNewConnection(id);
    addConnection(id, peerConnection);

    peerConnection.createOffer()
        .then(function (sessionDescription: any) {
            console.log('createOffer() succsess in promise');
            return peerConnection.setLocalDescription(sessionDescription);
        }).then(function() {
        console.log('setLocalDescription() succsess in promise');

        // -- Trickle ICE の場合は、初期SDPを相手に送る --
        sendSdp(id, peerConnection.localDescription);

        // -- Vanilla ICE の場合には、まだSDPは送らない --
    }).catch(function(err: any) {
        console.error(err);
    });
}

function setOffer(id: any, sessionDescription: any) {
    /*
    if (peerConnection) {
      console.error('peerConnection alreay exist!');
    }
    */
    _assert('setOffer must not connected yet', (! isConnectedWith(id)) );
    let peerConnection = prepareNewConnection(id);
    addConnection(id, peerConnection);

    peerConnection.setRemoteDescription(sessionDescription)
        .then(function() {
            console.log('setRemoteDescription(offer) succsess in promise');
            makeAnswer(id);
        }).catch(function(err) {
        console.error('setRemoteDescription(offer) ERROR: ', err);
    });
}

function makeAnswer(id: any) {
    console.log('sending Answer. Creating remote session description...' );
    let peerConnection = getConnection(id);
    if (! peerConnection) {
        console.error('peerConnection NOT exist!');
        return;
    }

    peerConnection.createAnswer()
        .then(function (sessionDescription: any) {
            console.log('createAnswer() succsess in promise');
            return peerConnection.setLocalDescription(sessionDescription);
        }).then(function() {
        console.log('setLocalDescription() succsess in promise');

        // -- Trickle ICE の場合は、初期SDPを相手に送る --
        sendSdp(id, peerConnection.localDescription);

        // -- Vanilla ICE の場合には、まだSDPは送らない --
    }).catch(function(err: any) {
        console.error(err);
    });
}

function setAnswer(id: any, sessionDescription: any) {
    let peerConnection = getConnection(id);
    if (! peerConnection) {
        console.error('peerConnection NOT exist!');
        return;
    }

    peerConnection.setRemoteDescription(sessionDescription)
        .then(function() {
            console.log('setRemoteDescription(answer) succsess in promise');
        }).catch(function(err: any) {
        console.error('setRemoteDescription(answer) ERROR: ', err);
    });
}

// --- tricke ICE ---
function addIceCandidate(id: any, candidate: any) {
    if (! isConnectedWith(id)) {
        console.warn('NOT CONNEDTED or ALREADY CLOSED with id=' + id + ', so ignore candidate');
        return;
    }

    let peerConnection = getConnection(id);
    if (peerConnection) {
        peerConnection.addIceCandidate(candidate);
    }
    else {
        console.error('PeerConnection not exist!');
        return;
    }
}

// start PeerConnection
function connect() {
    /*
    debugger; // SHOULD NOT COME HERE

    if (! peerConnection) {
      console.log('make Offer');
      makeOffer();
    }
    else {
      console.warn('peer already exist.');
    }
    */

    if (! isReadyToConnect()) {
        console.warn('NOT READY to connect');
    }
    else if (! canConnectMore()) {
        console.log('TOO MANY connections');
    }
    else {
        callMe();
    }
}

// close PeerConnection
function hangUp() {
    /*
    if (peerConnection) {
      console.log('Hang up.');
      peerConnection.close();
      peerConnection = null;
      pauseVideo(remoteVideo);
    }
    else {
      console.warn('peer NOT exist.');
    }
    */

    emitRoom({ type: 'bye' });
    stopAllConnection();
}

// ---- multi party --
function callMe() {
    emitRoom({type: 'call me'});
}

function _assert(desc: string, v: any) {
    if (v) {
        return;
    }
    else {
        let caller = _assert.caller || 'Top level';
        console.error('ASSERT in %s, %s is :', caller, desc, v);
    }
}

// @ts-ignore
let startVideoButton = document.getElementById('startVideo').onclick = startVideo;
// @ts-ignore
let stopVideoButton = document.getElementById('stopVideo').onclick = stopVideo;
// @ts-ignore
let connectButton = document.getElementById('connect').onclick = connect;
// @ts-ignore
let hangUpButton = document.getElementById('hangUp').onclick = hangUp;