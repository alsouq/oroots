import Link from "next/link"
import { ContactForm } from "@/components/contact-form"
import { CheckIcon, MailIcon, PhoneIcon, WhatsappIcon } from "@/components/icons"
import { ProductCard } from "@/components/product-card"
import { ProjectTabs } from "@/components/project-tabs"
import { listProducts } from "@/lib/data"
import { getLang } from "@/lib/i18n"

export const revalidate = 60

const img = (n: string) => `/images/${n}.jpg`

export default async function Home() {
  const lang = await getLang()
  const ar = lang === "ar"
  const products = (await listProducts()).slice(0, 4)
  const L = (a: string, e: string) => (ar ? a : e)

  const services = [
    { img: "glass-greenhouses", t: L("حلول الصوب الزراعية", "Greenhouse solutions"), d: L("تصميم ودعم أنظمة صوب مبنية على احتياجات المحصول ومناخ المنطقة وأهداف الإنتاج والموارد المتاحة.", "Greenhouse systems designed around crop requirements, local climate, production targets and available resources."), tags: [L("التصميم والتخطيط", "Design & planning"), L("التحكم في المناخ", "Climate control"), L("الري والتسميد", "Irrigation & fertigation"), L("الأتمتة", "Automation")] },
    { img: "lettuce-hydro", t: L("حلول الزراعة المائية", "Hydroponic solutions"), d: L("أنظمة زراعة بدون تربة مصممة على محصولك وأهدافك، من اختيار النظام لحد إدارة التغذية والتحسين المستمر.", "Soilless systems built around your crop and goals, from system selection to nutrient management and optimization."), tags: ["NFT", L("الزراعة في بيئات", "Substrate culture"), "EC & pH", L("حل المشاكل", "Troubleshooting")] },
    { img: "cherry-tomato", t: L("إدارة المحصول", "Crop management"), d: L("إدارة الري والتغذية والمناخ والنمو الخضري علشان نمو متوازن وإنتاج ثابت.", "Irrigation, nutrition, climate and canopy managed for balanced growth and consistent production."), tags: [L("تخطيط الإنتاج", "Crop planning"), L("رصد الآفات", "Pest monitoring"), L("التربية والتقليم", "Canopy")] },
    { img: "vermicompost", t: L("التغذية النباتية", "Plant nutrition"), d: L("محاليل مغذية A&B مخصصة لكل محصول، وبرامج تغذية كاملة لكل مرحلة نمو.", "Crop-specific A&B nutrient solutions and complete feeding programs for every growth stage."), tags: [L("محاليل A&B", "A&B solutions"), L("برامج تسميد", "Feeding programs"), L("تشخيص", "Diagnosis")] },
    { img: "monitoring", t: L("الاستشارات الفنية", "Technical consultancy"), d: L("تقييم في الموقع أو عن بُعد لاكتشاف نقاط الضعف وخسائر الإنتاج، مع حلول عملية.", "On-site or remote audits that find bottlenecks and production losses, with practical fixes."), tags: [L("تقييم فني", "Technical audits"), L("أداء المزرعة", "Farm performance"), L("المناخ", "Climate")] },
  ]

  const steps = [
    [L("التقييم", "Assess"), L("بنفهم المحصول والموقع والمناخ والأهداف والموارد المتاحة.", "We understand the crop, location, climate, goals and resources.")],
    [L("التحليل", "Analyze"), L("المياه وبيئة الزراعة والبنية التحتية والأداء الحالي.", "Water, growing media, infrastructure and current performance.")],
    [L("التصميم والتوصية", "Design & recommend"), L("النظام وخطة الإنتاج المناسبين لمشروعك.", "The right system and production plan for your project.")],
    [L("التنفيذ", "Implement"), L("التركيب والتشغيل وربط الأنظمة ببعض.", "Installation, commissioning and system integration.")],
    [L("التحسين", "Optimize"), L("متابعة مستمرة بتحسّن كفاءة الإنتاج.", "Ongoing monitoring that keeps improving production.")],
  ]

  return (
    <>
      <section className="hero">
        <div className="wrap">
          <div className="hero-grid">
            <div className="hero-copy">
              <span className="eyebrow reveal">{L("بلانت إكس لحلول البستنة", "PlantX Horticulture Solutions")}</span>
              <h1 className="reveal d2">
                {L("حلول بستنة متكاملة ", "Integrated horticultural solutions ")}
                <span>{L("للزراعة الحديثة", "for modern agriculture")}</span>
              </h1>
              <p className="lead reveal d2">{L("حلول ذكية للزراعة الحديثة، من تصميم الصوب والزراعة المائية لحد التغذية النباتية وإدارة المحصول.", "Smart solutions for modern agriculture, from greenhouse design and hydroponics to plant nutrition and crop management.")}</p>
              <div className="hero-cta reveal d3">
                <Link className="btn btn-primary" href="/shop">{L("تسوّق المحاليل المغذية", "Shop nutrient solutions")} <span className="arrow">→</span></Link>
                <Link className="btn btn-line" href="/#services">{L("اكتشف حلولنا", "Explore our solutions")}</Link>
              </div>
              <div className="trust reveal d3">
                <div><b>{L("مصر والسعودية", "Egypt & KSA")}</b><span>{L("مشاريع منفذة", "Projects delivered")}</span></div>
                <div><b>{L("توصيل لكل المحافظات", "Nationwide delivery")}</b><span>{L("الدفع عند الاستلام متاح", "Cash on delivery available")}</span></div>
                <div><b>{L("تغذية لكل محصول", "Crop-specific nutrition")}</b><span>{L("ولكل مرحلة نمو", "For every growth stage")}</span></div>
              </div>
            </div>
            <div className="hero-media reveal d2">
              <figure className="ph"><img src={img("hero-tomato")} alt={L("صوبة طماطم شيري مائية", "Hydroponic cherry tomato greenhouse")} /></figure>
              <figure className="ph small"><img src={img("lettuce-roots")} alt="" /></figure>
              {products[0] && (
                <Link className="float" href="/shop">
                  {products[0].thumbnail && <img src={products[0].thumbnail} alt="" />}
                  <div><b>{L("محاليل PlantX المغذية A&B", "PlantX A&B nutrient solutions")}</b><span>{L("مركّبة لكل محصول ولكل مرحلة نمو", "Formulated per crop and growth stage")}</span></div>
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="about" id="about">
        <div className="wrap about-grid">
          <div className="collage">
            <figure className="ph"><img src={img("greenhouse-corridor")} alt="" loading="lazy" /></figure>
            <figure className="ph"><img src={img("microgreens")} alt="" loading="lazy" /></figure>
            <figure className="ph"><img src={img("irrigation-room")} alt="" loading="lazy" /></figure>
          </div>
          <div className="about-copy">
            <span className="eyebrow">{L("من نحن", "About us")}</span>
            <h2>{L("خبرة زراعية وهندسة وتكنولوجيا في فريق واحد", "Agricultural expertise, engineering and technology in one team")}</h2>
            <p className="lead">{L("بلانت إكس لحلول البستنة شركة متخصصة في حلول البستنة الحديثة. بنصمّم ونطوّر ونحسّن أنظمة الإنتاج الزراعي، مع تركيز على الصوب الزراعية والزراعة المائية والتغذية النباتية وإدارة المحاصيل.", "PlantX Horticulture Solutions specializes in modern horticultural solutions. We design, develop and optimize agricultural production systems, with a focus on greenhouses, hydroponics, plant nutrition and crop management.")}</p>
            <ul className="checks">
              {[
                [L("إنتاجية أعلى", "Higher productivity"), L("حلول عملية بترفع الإنتاج وجودة المحصول.", "Practical solutions that raise yield and crop quality.")],
                [L("استغلال أفضل للموارد", "Better use of resources"), L("مياه وعناصر غذائية وطاقة بتوصل للنبات بدقة.", "Water, nutrients and energy delivered precisely to the crop.")],
                [L("حل مخصص لكل مزرعة", "A solution for each farm"), L("مبني على المحصول ونظام الزراعة والمناخ وجودة المياه وأهداف كل مشروع.", "Based on the crop, system, climate, water quality and goals of each project.")],
              ].map(([b, s]) => (
                <li key={b}><i><CheckIcon /></i><div><b>{b}</b><span>{s}</span></div></li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section id="services">
        <div className="wrap">
          <div className="head-row">
            <div className="head">
              <span className="eyebrow">{L("خدماتنا", "Our services")}</span>
              <h2>{L("من أول تخطيط لحد آخر حصاد", "From the first plan to the last harvest")}</h2>
            </div>
            <Link className="btn btn-line" href="/#contact">{L("كلّم خبرائنا", "Talk to our experts")}</Link>
          </div>
          <div className="svc-grid">
            {services.map((s) => (
              <article className="svc" key={s.img}>
                <figure className="ph"><img src={img(s.img)} alt="" loading="lazy" /></figure>
                <div className="meta">
                  <h3>{s.t}</h3>
                  <p>{s.d}</p>
                  <ul>{s.tags.map((x) => <li key={x}>{x}</li>)}</ul>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="approach">
        <div className="wrap">
          <div className="head center">
            <span className="eyebrow">{L("منهجيتنا", "Our approach")}</span>
            <h2>{L("من الفكرة لحد الإنتاج", "From concept to production")}</h2>
          </div>
          <ol className="steps">
            {steps.map(([h, p]) => <li key={h}><h3>{h}</h3><p>{p}</p></li>)}
          </ol>
          <p className="quote">{L("إحنا مش بنطبّق ", "We don't believe in applying ")}<span>{L("نفس الحل على كل مزرعة.", "the same solution to every farm.")}</span></p>
        </div>
      </section>

      <section className="shop" id="featured">
        <div className="wrap">
          <div className="head-row">
            <div className="head">
              <span className="eyebrow">{L("مجموعات PlantX", "PlantX collections")}</span>
              <h2>{L("تغذية مصممة لمحصولك", "Nutrition made for your crop")}</h2>
            </div>
            <Link className="btn btn-line" href="/shop">{L("كل المنتجات", "All products")} <span className="arrow">→</span></Link>
          </div>
          <div className="prod-grid">
            {products.map((p) => <ProductCard key={p.id} product={p} lang={lang} />)}
          </div>
        </div>
      </section>

      <section id="projects">
        <div className="wrap">
          <div className="head">
            <span className="eyebrow">{L("مشاريعنا", "Projects")}</span>
            <h2>{L("من أرض مشاريعنا", "From our farms")}</h2>
          </div>
          <ProjectTabs
            tabs={[
              {
                key: "eg",
                label: L("مصر", "Egypt"),
                photos: [
                  { src: img("red-lettuce"), caption: L("خس أحمر", "Red lettuce") },
                  { src: img("lettuce-roots"), caption: L("خس مائي", "Hydroponic lettuce") },
                  { src: img("iceberg"), caption: L("خس آيسبرج", "Iceberg lettuce") },
                  { src: img("microgreens"), caption: L("ميكروجرينز", "Microgreens") },
                  { src: img("leafy"), caption: L("ورقيات", "Leafy greens") },
                  { src: img("greenhouse-leafy"), caption: L("ورقيات داخل الصوب", "Greenhouse leafy crops") },
                  { src: img("hydro-tables"), caption: L("طاولات زراعة مائية", "Hydroponic tables") },
                ],
              },
              {
                key: "sa",
                label: L("السعودية", "Saudi Arabia"),
                photos: [
                  { src: img("cherry-tomato"), caption: L("طماطم شيري", "Cherry tomato") },
                  { src: img("yellow-cherry"), caption: L("طماطم شيري صفراء", "Yellow cherry tomato") },
                  { src: img("pepper"), caption: L("فلفل", "Sweet pepper") },
                  { src: img("tomato-set"), caption: L("عقد ثمار الطماطم", "Tomato fruit set") },
                  { src: img("pepper-substrate"), caption: L("فلفل على بيئات", "Pepper on substrate") },
                  { src: img("greenhouse-corridor"), caption: L("صوبة تربية رأسية", "High-wire greenhouse") },
                  { src: img("vertical-canopy"), caption: L("نمو خضري رأسي", "Vertical canopy") },
                ],
              },
            ]}
          />
        </div>
      </section>

      <div className="band" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="band-in">
            <figure className="ph"><img src={img("sunset-greenhouses")} alt="" loading="lazy" /></figure>
            <div className="band-copy">
              <h2>{L("صوبتك، وخبرتنا، وزراعة أفضل.", "Your greenhouse. Our expertise. Better growing.")}</h2>
              <p>{L("بتخطط لمشروع جديد أو عايز تطوّر مشروع قائم؟ فريقنا جاهز يساعدك.", "Planning a new project or improving an existing one? Our team is ready to help.")}</p>
              <Link className="btn btn-white" href="/#contact">{L("اطلب استشارة فنية", "Request a technical consultation")} <span className="arrow">→</span></Link>
            </div>
          </div>
        </div>
      </div>

      <section id="contact">
        <div className="wrap contact-grid">
          <div className="cinfo">
            <span className="eyebrow">{L("تواصل معنا", "Contact us")}</span>
            <h2>{L("كلّم فريق PlantX", "Talk to the PlantX team")}</h2>
            <p className="lead">{L("عندك مشروع جديد؟ بتواجه مشكلة فنية؟ بتدور على برنامج التغذية المناسب لمحصولك؟", "Have a new project? Facing a technical challenge? Looking for the right nutrition program for your crop?")}</p>
            <div className="cards">
              <div className="ccard"><i><PhoneIcon /></i><div><span>{L("الهاتف / واتساب", "Phone / WhatsApp")}</span><b>+20 103 600 4753</b></div><a className="copy" href="https://wa.me/201036004753" target="_blank" rel="noopener"><WhatsappIcon /></a></div>
              <div className="ccard"><i><MailIcon /></i><div><span>{L("البريد الإلكتروني", "Email")}</span><b>help.plantx@outlook.com</b></div></div>
            </div>
          </div>
          <ContactForm lang={lang} />
        </div>
      </section>
    </>
  )
}
