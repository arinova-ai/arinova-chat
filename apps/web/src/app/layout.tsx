import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Arinova Chat",
  description: "Streaming-native messaging for AI agents",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Arinova Chat",
  },
  icons: {
    icon: "/favicon.png",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <body className={`${inter.className} h-full antialiased`}>
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              const isTextInputFocused = () => {
                const el = document.activeElement;
                if (!el) return false;
                const tag = el.tagName;
                return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
              };

              const setAppHeight = () => {
                document.documentElement.style.setProperty("--app-height", window.innerHeight + "px");
              };
              setAppHeight();
              window.addEventListener("orientationchange", setAppHeight);
              window.addEventListener("pageshow", setAppHeight);
              window.addEventListener("resize", () => {
                if (isTextInputFocused()) return;
                setAppHeight();
              });

              if ("serviceWorker" in navigator) {
                window.addEventListener("load", async () => {
                  const reg = await navigator.serviceWorker.register("/sw.js");
                  reg.update();

                  if (reg.waiting) {
                    reg.waiting.postMessage({ type: "SKIP_WAITING" });
                  }

                  reg.addEventListener("updatefound", () => {
                    const worker = reg.installing;
                    if (!worker) return;
                    worker.addEventListener("statechange", () => {
                      if (worker.state === "installed" && navigator.serviceWorker.controller) {
                        worker.postMessage({ type: "SKIP_WAITING" });
                      }
                    });
                  });

                  let refreshing = false;
                  navigator.serviceWorker.addEventListener("controllerchange", () => {
                    if (refreshing) return;
                    refreshing = true;
                    window.location.reload();
                  });
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
