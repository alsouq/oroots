import type { Metadata } from "next"
import { Footer } from "@/components/footer"
import { Header } from "@/components/header"
import { getLang } from "@/lib/i18n"
import "./globals.css"

export const metadata: Metadata = {
  title: { default: "PlantX Egypt | Horticulture solutions", template: "%s | PlantX" },
  description:
    "PlantX Horticulture Solutions: greenhouses, hydroponics, plant nutrition and crop management in Egypt. Shop PlantX A&B nutrient solutions.",
  icons: { icon: "/images/logo.png" },
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang()
  return (
    <html lang={lang} dir={lang === "ar" ? "rtl" : "ltr"}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Alexandria:wght@400;500;600;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600&display=swap"
        />
      </head>
      <body>
        <Header lang={lang} />
        <main>{children}</main>
        <Footer lang={lang} />
      </body>
    </html>
  )
}
