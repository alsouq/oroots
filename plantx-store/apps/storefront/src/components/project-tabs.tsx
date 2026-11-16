"use client"

import { useState } from "react"

type Photo = { src: string; caption: string }

export function ProjectTabs({ tabs }: { tabs: { key: string; label: string; photos: Photo[] }[] }) {
  const [active, setActive] = useState(tabs[0].key)
  return (
    <>
      <div className="tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.key} className="tab" role="tab" aria-selected={active === t.key} onClick={() => setActive(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div className="gallery" key={t.key} hidden={active !== t.key} style={{ marginTop: 28, width: "100%" }}>
          {t.photos.map((p) => (
            <figure className="ph" key={p.src}>
              <img src={p.src} alt={p.caption} loading="lazy" />
              <figcaption>{p.caption}</figcaption>
            </figure>
          ))}
        </div>
      ))}
    </>
  )
}
