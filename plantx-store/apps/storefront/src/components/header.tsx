import Link from "next/link"
import { getCart } from "@/lib/data"
import { dict, type Lang } from "@/lib/i18n"
import { CartIcon, MailIcon, PhoneIcon } from "./icons"
import { LangToggle } from "./lang-toggle"
import { NavMenu } from "./nav-menu"

export async function Header({ lang }: { lang: Lang }) {
  const t = dict[lang]
  const cart = await getCart()
  const count = (cart?.items ?? []).reduce((n, i) => n + Number(i.quantity), 0)
  return (
    <>
      <div className="topbar">
        <div className="wrap">
          <div className="info">
            <span><PhoneIcon /><b>+20 103 600 4753</b></span>
            <span><MailIcon /><b>help.plantx@outlook.com</b></span>
          </div>
          <div className="end">
            <LangToggle lang={lang} label={t.langSwitch} />
          </div>
        </div>
      </div>
      <header>
        <div className="wrap nav">
          <Link href="/" className="brand" aria-label="PlantX">
            <img src="/images/logo.png" alt="PlantX Horticulture solutions" width={121} height={46} />
          </Link>
          <NavMenu
            items={[
              { href: "/", label: t.home },
              { href: "/#about", label: t.about },
              { href: "/#services", label: t.services },
              { href: "/#projects", label: t.projects },
              { href: "/shop", label: t.shop },
              { href: "/#contact", label: t.contact },
            ]}
          />
          <div className="nav-end">
            <Link href="/cart" className="cart-link" aria-label={t.cart}>
              <CartIcon />
              {count > 0 && <span className="count">{count}</span>}
            </Link>
          </div>
        </div>
      </header>
    </>
  )
}
