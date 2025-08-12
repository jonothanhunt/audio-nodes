import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import TitleBarCreds from "@/components/TitleBarCreds";

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

const lastik = localFont({
    variable: "--font-lastik",
    src: "./fonts/LastikVariable-Variable.woff2",
    display: "swap",
});

const atkinsonHyperlegible = localFont({
    variable: "--font-hyperlegible",
    src: "./fonts/AtkinsonHyperlegibleNext-VariableFont_wght.ttf",
    display: "swap",
});

export const metadata: Metadata = {
    title: "Audio Nodes",
    description: "Create and manipulate audio with nodes!",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body
                className={`${geistSans.variable} ${geistMono.variable} ${atkinsonHyperlegible.variable} ${lastik.variable} antialiased bg-gray-900 text-white`}
            >
                <div className="fixed top-4 left-4 right-4 z-[70] pointer-events-auto">
                    <TitleBarCreds />
                </div>
                {children}
            </body>
        </html>
    );
}
