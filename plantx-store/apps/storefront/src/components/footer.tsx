import Link from "next/link"
import { dict, type Lang } from "@/lib/i18n"

export function Footer({ lang }: { lang: Lang }) {
  const t = dict[lang]
  const ar = lang === "ar"
  return (
    <footer>
      <div className="wrap">
        <div className="fgrid">
          <div>
            <img className="logo" src="/images/logo.png" alt="PlantX" width={127} height={48} />
            <p>{ar ? "حلول بستنة متكاملة: صوب زراعية، زراعة مائية، تغذية نباتية، وإدارة محاصيل." : "Integrated horticultural solutions: greenhouses, hydroponics, plant nutrition and crop management."}</p>
          </div>
          <div>
            <h4>{t.services}</h4>
            <ul>
              <li><Link href="/#services">{ar ? "حلول الصوب" : "Greenhouse solutions"}</Link></li>
              <li><Link href="/#services">{ar ? "الزراعة المائية" : "Hydroponic solutions"}</Link></li>
              <li><Link href="/#services">{ar ? "التغذية النباتية" : "Plant nutrition"}</Link></li>
              <li><Link href="/#services">{ar ? "الاستشارات الفنية" : "Technical consultancy"}</Link></li>
            </ul>
          </div>
          <div>
            <h4>{t.shop}</h4>
            <ul>
              <li><Link href="/shop?c=plantx-fruit">PlantX Fruit™</Link></li>
              <li><Link href="/shop?c=plantx-leafy">PlantX Leafy™</Link></li>
              <li><Link href="/shop?c=plantx-berry">PlantX Berry™</Link></li>
              <li><Link href="/shop?c=plantx-garden">PlantX Garden™</Link></li>
              <li><Link href="/shop?c=plantx-compost">PlantX Compost™</Link></li>
            </ul>
          </div>
          <div>
            <h4>{t.contact}</h4>
            <ul>
              <li className="ltr" style={{ textAlign: "start" }}>+20 103 600 4753</li>
              <li>help.plantx@outlook.com</li>
              <li>
                <a href="https://www.facebook.com/profile.php?id=61583441600375" target="_blank" rel="noopener">Facebook</a>{" · "}
                <a href="https://www.instagram.com/plantx.horticulturesolutions/" target="_blank" rel="noopener">Instagram</a>{" · "}
                <a href="https://www.linkedin.com/company/plantx-horticulture-solutions" target="_blank" rel="noopener">LinkedIn</a>
              </li>
            </ul>
          </div>
        </div>
        <div className="fbottom"><span>{t.rights}</span><span>plantx-egypt.com</span></div>
      </div>
    </footer>
  )
}
