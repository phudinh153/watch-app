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

  // const socket = socketio("https://signaling-server-pfm2.onrender.com/", {
  //   autoConnect: false,
  // });
  const socket = socketio("http://127.0.0.1:5004", {
    autoConnect: false,
  });

  let pc; // For RTCPeerConnection Object

  const sendData = (data) => {
    // eslint-disable-next-line no-restricted-globals
    console.log("Sending data: ", data);
    socket.emit("data", {
      username: localUsername,
      room: roomName,
      data: data,
    });
  };

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

  const onIceCandidate = (event) => {
    if (event.candidate) {
      console.log("Sending ICE candidate");
      sendData({
        type: "candidate",
        candidate: event.candidate,
      });
    }
  };

  const onTrack = (event) => {
    console.log("Adding remote track");
    remoteVideoRef.current.srcObject = event.streams[0];
  };

  const createPeerConnection = () => {
    try {
      pc = new RTCPeerConnection({
        iceServers: [
          {
            urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
          },
          // {
          //   urls: "turn:standard.relay.metered.ca:80",
          //   username: "ec3ee67c7a9f58188572af0a",
          //   credential: "hWXfsYZeTlDij524",
          // },
          // {
          //   urls: "turn:standard.relay.metered.ca:80?transport=tcp",
          //   username:"ec3ee67c7a9f58188572af0a",
          //   credential:"hWXfsYZeTlDij524",
          // },
          // {
          //   urls: "turn:standard.relay.metered.ca:443",
          //   username: "ec3ee67c7a9f58188572af0a",
          //   credential: "hWXfsYZeTlDij524",
          // },
          // {
          //   urls: "turns:standard.relay.metered.ca:443?transport=tcp",
          //   username: "ec3ee67c7a9f58188572af0a",
          //   credential: "hWXfsYZeTlDij524",
          // },
        ],
      });
      pc.onicecandidate = onIceCandidate;
      pc.ontrack = onTrack;
      const localStream = localVideoRef.current.srcObject;
      for (const track of localStream.getTracks()) {
        pc.addTrack(track, localStream);
      }
      console.log("PeerConnection created");
    } catch (error) {
      console.error("PeerConnection failed: ", error);
    }
  };

  const setAndSendLocalDescription = (sessionDescription) => {
    console.log("Session Description: ", sessionDescription)
    pc.setLocalDescription(sessionDescription);
    console.log("Local description set");
    sendData(sessionDescription);
  };

  const sendOffer = () => {
    console.log("Sending offer");
    pc.createOffer().then(setAndSendLocalDescription, (error) => {
      console.error("Send offer failed: ", error);
    });
  };

  const sendAnswer = () => {
    console.log("Sending answer");
    pc.createAnswer().then(setAndSendLocalDescription, (error) => {
      console.error("Send answer failed: ", error);
    });
  };

  const signalingDataHandler = (data) => {
    if (data.type === "offer") {
      createPeerConnection();
      pc.setRemoteDescription(new RTCSessionDescription(data));
      sendAnswer();
    } else if (data.type === "answer") {
      console.log("Handling answer")
      pc.setRemoteDescription(new RTCSessionDescription(data));
    } else if (data.type === "candidate") {
      pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    } else {
      console.log("Unknown Data");
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
    }).catch((e) => {
        alert(e);
    });
  }

  socket.on("ready", () => {
    console.log("Ready to Connect!");
    createPeerConnection();
    sendOffer();
  });

  socket.on("offer", (data) => {
    console.log("Offer received");
    signalingDataHandler(data);
  });

  socket.on("answer", (data) => {
    console.log("Answer received");
    signalingDataHandler(data);
  });

  socket.on("data", (data) => {
    console.log("Data received: ", data);
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

    // if (document.getElementById('use-stun').checked) {
    //     config.iceServers = [{ urls: ['stun:stun.l.google.com:19302'] }];
    // }

    pc = new RTCPeerConnection(config);

    // connect audio / video
    pc.addEventListener('track', (evt) => {
        if (evt.track.kind === 'video') {
            localVideoRef.current.srcObject = evt.streams[0];
        }
        // else {
        //     audioRef.current.srcObject = evt.streams[0];
        // }
    });

    // document.getElementById('start').style.display = 'none';
    negotiate();
    // document.getElementById('stop').style.display = 'inline-block';
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
