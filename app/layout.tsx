import './style.css';
import Providers from './providers';

const siteUrl = 'https://pumpclip.app';

export const metadata = {
  metadataBase: new URL(siteUrl),
  title: 'pumpclips — Turn streams into momentum',
  description: 'Turn long-form video into high-signal clips with the pumpclips creator and clipper marketplace.',
  icons: {
    icon: '/icon.png',
    shortcut: '/icon.png',
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    type: 'website',
    url: siteUrl,
    siteName: 'pumpclips',
    title: 'pumpclips — Turn streams into momentum',
    description: 'AI clipping workflow for creators, streamers, and clippers.',
    images: [{url: '/pumpclips-logo.jpg', width: 1200, height: 1200, alt: 'pumpclips official logo'}],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'pumpclips — Turn streams into momentum',
    description: 'AI clipping workflow for creators, streamers, and clippers.',
    images: ['/pumpclips-logo.jpg'],
  },
};

export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="en"><body><Providers><a className="skip-link" href="#main-content">Skip to content</a><div id="main-content">{children}</div></Providers></body></html>;
}
