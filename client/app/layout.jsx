'use client';
import '../styles/globals.css';

export const metadata = {
  title: 'Random Call',
  description: 'Random video chat using WebRTC, Socket.io, and Next.js'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <main className="min-h-screen flex items-center justify-center p-6">
          <div className="w-full max-w-4xl">{children}</div>
        </main>
      </body>
    </html>
  );
}
