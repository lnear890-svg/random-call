'use client';
import React from 'react';
import VideoChat from '../components/VideoChat';

export default function Page() {
  return (
    <div className="mx-auto w-full bg-slate-800/60 rounded-xl p-6 shadow-lg">
      <h1 className="text-2xl font-semibold mb-4">Random Call</h1>
      <p className="text-sm text-slate-300 mb-6">Click Start to find a random partner. Use Next to skip, Mute/Camera to toggle, End to stop.</p>
      <VideoChat />
      <footer className="mt-6 text-xs text-slate-400">Uses public STUN servers. For production, provision a TURN server.</footer>
    </div>
  );
}
