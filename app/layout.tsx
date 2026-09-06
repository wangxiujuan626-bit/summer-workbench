import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Summer工作台 Lite｜把今天真正推进",
  description: "一个打开就能用、能改成自己名字、手机电脑自动同步的轻量个人工作台。",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "我的工作台",
  },
  icons: {
    icon: "/icon-192.png",
    shortcut: "/icon-192.png",
    apple: "/icon-192.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
