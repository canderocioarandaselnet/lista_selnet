import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Selnet | Lista de Precios Oficial",
  description: "Plataforma mayorista oficial de consulta de stock y listas de precios de Selnet.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
