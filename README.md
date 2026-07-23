# Random Call — WebRTC + Socket.io (Next.js + Express)

This repo contains a full-stack random-call app:
- server/: Express + Socket.io signaling & matchmaking
- client/: Next.js (App Router) frontend with WebRTC and Tailwind CSS

Requirements
- Node.js 18+ (or 16+)
- npm or yarn

Run locally

1. Start the server
   cd server
   npm install
   npm start
   (server runs on http://localhost:4000)

2. Start the client
   cd client
   npm install
   npm run dev
   (client runs on http://localhost:3000)

How it works (high level)
- Client emits `join-queue` to server when user clicks Start.
- Server keeps a queue and pairs two waiting sockets, emits `matched` to both (one as initiator).
- The initiator creates an SDP offer; both exchange offers/answers and ICE candidates via the server using `signal` messages.
- When a peer disconnects, the remaining peer is notified (`partner-left`) and can re-queue or end the call.
