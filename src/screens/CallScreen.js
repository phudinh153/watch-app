import { useParams } from "react-router-dom";
import { useRef, useEffect } from "react";
import socketio from "socket.io-client";
import "./CallScreen.css";

function CallScreen() {
  const params = useParams();
  const localUsername = params.username;
  const roomName = params.room;
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  const socket = socketio("https://signaling-server-pfm2.onrender.com/", {
    autoConnect: false,
  });

  let pc; // For RTCPeerConnection Object

  const startConnection = () => {
    try {
      socket.connect();
      socket.emit("join", { username: localUsername, room: roomName });
      start();
      console.log("Socket connection successful");
    } catch (error) {
      console.error("Socket connection failed: ", error);
    }
    // Listen for connection errors
    socket.on('connect_error', (error) => {
      console.error("Connection error: ", error);
    });

    // Listen for other errors
    socket.on('error', (error) => {
      console.error("An error occurred: ", error);
    });
  };


const signalingDataHandler = (data) => {
  if (data.type === "answer") {
    console.log("pc.signalingState: ", pc.signalingState);
    if (pc.signalingState === "have-local-offer") {
      const rtc_data = {
        type: data["type"],
        sdp: data["sdp"]
      };
      pc.setRemoteDescription(new RTCSessionDescription(rtc_data))
        .catch(error => console.error("Error setting remote description: ", error));
    } else {
      console.log("Cannot handle answer in current state: ", pc.signalingState);
    }
  } 
};

  function negotiate() {
    pc.addTransceiver('video', { direction: 'recvonly' });
    pc.addTransceiver('audio', { direction: 'recvonly' });
    return pc.createOffer().then((offer) => {
        return pc.setLocalDescription(offer);
    }).then(() => {
        // wait for ICE gathering to complete
        return new Promise((resolve) => {
            if (pc.iceGatheringState === 'complete') {
                resolve();
            } else {
                const checkState = () => {
                    if (pc.iceGatheringState === 'complete') {
                        pc.removeEventListener('icegatheringstatechange', checkState);
                        resolve();
                    }
                };
                pc.addEventListener('icegatheringstatechange', checkState);
            }
        });
    }).then(() => {
        var offer = pc.localDescription;
        // send the offer to the signaling server
        socket.emit('offer', {
          sdp: offer.sdp,
          type: offer.type,
          username: localUsername,
          room: roomName,
        });
      console.log("Offer sent");
      console.log(offer)
    }).catch((e) => {
        alert(e);
    });
  }

  socket.on("offer", (data) => {
    console.log("Offer received");
    signalingDataHandler(data);
  });

  socket.on("answer", (data) => {
    console.log("Answer received");
    console.log(data);
    signalingDataHandler(data);
  });

  useEffect(() => {
    startConnection();
    return function cleanup() {
      pc?.close();
    };
  }, []);

  
  function start() {
    var config = {
        sdpSemantics: 'unified-plan'
    };

    config.iceServers = [{
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302']
    }];

    pc = new RTCPeerConnection(config);

    // connect audio / video
    pc.addEventListener('track', (evt) => {
        if (evt.track.kind === 'video') {
            localVideoRef.current.srcObject = evt.streams[0];
        }
    });

    negotiate();
}

function stop() {
    document.getElementById('stop').style.display = 'none';

    // close peer connection
    setTimeout(() => {
        pc.close();
    }, 500);
}


  return (
    <div>
      <label>{"Username: " + localUsername}</label>
      <label>{"Room Id: " + roomName}</label>
      <video autoPlay muted playsInline ref={localVideoRef} />
      <video autoPlay muted playsInline ref={remoteVideoRef} />
      {/* <button id="start" onClick={start}>Start</button>
      <button id="stop" style={{ display: "none" }} onClick={stop}>Stop</button> */}
    </div>
  );
}

export default CallScreen;
