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
    <html lang="en" className="h-full">
      <body className={`${inter.className} h-full antialiased`}>
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              const setAppHeight = () => {
                const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
                document.documentElement.style.setProperty("--app-height", Math.round(viewportHeight) + "px");
              };
              setAppHeight();
              window.addEventListener("resize", setAppHeight);
              window.addEventListener("orientationchange", setAppHeight);
              window.addEventListener("pageshow", setAppHeight);
              if (window.visualViewport) {
                window.visualViewport.addEventListener("resize", setAppHeight);
                window.visualViewport.addEventListener("scroll", setAppHeight);
              }

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
