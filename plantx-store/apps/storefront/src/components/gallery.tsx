"use client"

import { useState } from "react"

export function Gallery({ images, alt }: { images: string[]; alt: string }) {
  const [i, setI] = useState(0)
  if (!images.length) {
    return <div className="pdp-gallery"><div className="main" /></div>
  }
  return (
    <div className="pdp-gallery">
      <div className="main"><img src={images[i]} alt={alt} /></div>
      {images.length > 1 && (
        <div className="thumbs">
          {images.map((src, n) => (
            <button key={src} type="button" aria-pressed={n === i} onClick={() => setI(n)} aria-label={`${n + 1}`}>
              <img src={src} alt="" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
