import "./globals.css";
export const metadata = {
  title: "Cutwise — Local-first video editor",
  description:
    "Cut, arrange, and export video in your browser with a timeline and an optional AI editing assistant.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
