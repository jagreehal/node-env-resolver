export const metadata = {
  title: 'Next.js Env Resolver Example',
  description: 'Example app for node-env-resolver/nextjs',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}


