'use client';
import React, { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';
import { Mic, MicOff, Video, VideoOff, SkipForward, LogOut } from 'lucide-react';

const SIGNALING_SERVER_URL = process.env.NEXT_PUBLIC_SIGNALING_URL || 'http://localhost:4000';
const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    // Add TURN if available
  ]
};

export default function VideoChat() {
  const socketRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);

  const [status, setStatus] = useState('idle'); // idle | searching | in-call
  const [isMuted, setIsMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [peerId, setPeerId] = useState(null);
  const [initiator, setInitiator] = useState(false);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  useEffect(() => {
    // Connect socket once on mount
    socketRef.current = io(SIGNALING_SERVER_URL, {
      transports: ['websocket']
    });

    const socket = socketRef.current;

    socket.on('connect', () => {
      console.log('socket connected', socket.id);
    });

    socket.on('matched', async ({ peerId: pid, initiator }) => {
      console.log('matched', pid, initiator);
      setPeerId(pid);
      setInitiator(initiator);
      setStatus('in-call');
      await startLocalMediaAndCall(pid, initiator);
    });

    socket.on('signal', async ({ from, data }) => {
      // data can be offer, answer, candidate
      if (!pcRef.current) {
        // Create pc if not exists (non-initiator)
        await createPeerConnection(from);
      }
      try {
        if (data.type === 'offer') {
          // set remote, create answer
          await pcRef.current.setRemoteDescription(data);
          const answer = await pcRef.current.createAnswer();
          await pcRef.current.setLocalDescription(answer);
          socket.emit('signal', { to: from, data: pcRef.current.localDescription });
        } else if (data.type === 'answer') {
          await pcRef.current.setRemoteDescription(data);
        } else if (data.candidate) {
          await pcRef.current.addIceCandidate(data);
        }
      } catch (err) {
        console.error('Error handling signal', err);
      }
    });

    socket.on('partner-left', () => {
      // remote disconnected
      cleanupCall();
      setStatus('idle');
      setPeerId(null);
      setInitiator(false);
      alert('Partner disconnected. You can click Start to find a new match.');
    });

    return () => {
      socket.disconnect();
      cleanupCall();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startLocalMediaAndCall(peerIdParam, isInitiator) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      await createPeerConnection(peerIdParam);

      // add tracks
      stream.getTracks().forEach(track => pcRef.current.addTrack(track, stream));

      if (isInitiator) {
        const offer = await pcRef.current.createOffer();
        await pcRef.current.setLocalDescription(offer);
        socketRef.current.emit('signal', { to: peerIdParam, data: pcRef.current.localDescription });
      }
    } catch (err) {
      console.error('Could not get user media', err);
      alert('Error accessing camera/microphone. Please allow permissions.');
      setStatus('idle');
    }
  }

  async function createPeerConnection(peerSocketId) {
    const pc = new RTCPeerConnection(ICE_CONFIG);
    pcRef.current = pc;

    // remote stream
    const remoteStream = new MediaStream();
    remoteStreamRef.current = remoteStream;
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
    }

    pc.ontrack = (evt) => {
      evt.streams[0].getTracks().forEach(track => remoteStream.addTrack(track));
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current.emit('signal', { to: peerSocketId || peerId, data: event.candidate });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        cleanupCall();
        setStatus('idle');
      }
    };

    return pc;
  }

  function cleanupCall() {
    try {
      if (pcRef.current) {
        pcRef.current.getSenders().forEach(sender => {
          try { sender.track && sender.track.stop(); } catch (e) {}
        });
        pcRef.current.close();
        pcRef.current = null;
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
        localStreamRef.current = null;
      }
      if (remoteStreamRef.current) {
        remoteStreamRef.current.getTracks().forEach(t => t.stop());
        remoteStreamRef.current = null;
      }
      if (localVideoRef.current) localVideoRef.current.srcObject = null;
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    } catch (e) {
      console.error('cleanup error', e);
    }
  }

  // UI actions
  function handleStart() {
    setStatus('searching');
    socketRef.current.emit('join-queue');
  }

  function handleNext() {
    // immediate skip; server will notify partner-left and requeue
    socketRef.current.emit('next');
    // local cleanup; we'll be requeued
    cleanupCall();
    setStatus('searching');
    setPeerId(null);
    setInitiator(false);
  }

  function handleEnd() {
    socketRef.current.emit('leave-queue');
    socketRef.current.disconnect(); // fully disconnect socket
    cleanupCall();
    // Reconnect socket so user can start again without page reload
    // small delay then reconnect
    setTimeout(() => {
      socketRef.current = io(SIGNALING_SERVER_URL, { transports: ['websocket'] });
      // page reload is simplest; for demo we reload to re-init handlers
      window.location.reload();
    }, 200);
  }

  function toggleMute() {
    if (!localStreamRef.current) return;
    localStreamRef.current.getAudioTracks().forEach(t => (t.enabled = !t.enabled));
    setIsMuted(prev => !prev);
  }

  function toggleCamera() {
    if (!localStreamRef.current) return;
    localStreamRef.current.getVideoTracks().forEach(t => (t.enabled = !t.enabled));
    setCamOff(prev => !prev);
  }

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="video h-64 md:h-96 bg-black flex items-center justify-center">
          <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
          {!localStreamRef.current && <div className="text-slate-500">Local preview will appear after allowing camera</div>}
        </div>
        <div className="video h-64 md:h-96 bg-black flex items-center justify-center">
          <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
          {status !== 'in-call' && <div className="text-slate-500">Remote video</div>}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3 items-center">
        {status === 'idle' && (
          <button
            onClick={handleStart}
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-black rounded-lg font-medium"
          >
            Start
          </button>
        )}

        {(status === 'in-call' || status === 'searching') && (
          <>
            <button onClick={handleNext} className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg">
              <SkipForward size={16} /> Next
            </button>

            <button onClick={toggleMute} className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg">
              {isMuted ? <MicOff size={16} /> : <Mic size={16} />} {isMuted ? 'Unmute' : 'Mute'}
            </button>

            <button onClick={toggleCamera} className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg">
              {camOff ? <VideoOff size={16} /> : <Video size={16} />} {camOff ? 'Enable Camera' : 'Camera'}
            </button>

            <button onClick={handleEnd} className="flex items-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg">
              <LogOut size={16} /> End Call
            </button>
          </>
        )}
      </div>

      <div className="mt-3 text-sm text-slate-400">
        <div>Status: <span className="font-medium text-slate-100">{status}</span></div>
        {peerId && <div>Peer: <code className="text-xs px-1 bg-slate-700 rounded">{peerId}</code></div>}
      </div>
    </div>
  );
}
