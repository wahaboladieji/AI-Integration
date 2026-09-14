import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI Integration Slice — Document & Notes Processor',
  description: 'Asynchronous document & handwritten notes AI processing flow',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <main style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem 1rem' }}>
          {children}
        </main>
      </body>
    </html>
  );
}
