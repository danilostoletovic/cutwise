import "./globals.css";
export const metadata = {
  title: "Shorties — AI video editor",
  description:
    "A local-first video editing workspace. Make the cut, in your own words.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
