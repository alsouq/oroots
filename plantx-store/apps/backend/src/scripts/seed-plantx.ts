/**
 * Imports the PlantX catalogue (from the previous Shopify store) with images,
 * collections, variants, prices and stock.
 *
 *   npx medusa exec ./src/scripts/seed-plantx.ts
 *
 * Safe to re-run: products whose handle already exists are skipped.
 * Base prices are the regular prices; the current discounted prices go into an
 * active "sale" price list, so the storefront shows them crossed out.
 */
import fs from "fs"
import path from "path"
import {
  createCollectionsWorkflow,
  createInventoryLevelsWorkflow,
  createPriceListsWorkflow,
  createProductOptionsWorkflow,
  createProductsWorkflow,
  uploadFilesWorkflow,
} from "@medusajs/medusa/core-flows"
import { ContainerRegistrationKeys, ProductStatus } from "@medusajs/framework/utils"
import type { ExecArgs } from "@medusajs/framework/types"

type SeedVariant = {
  options: string[]
  sku: string | null
  price: number
  compare_at: number | null
  grams?: number
}
type SeedProduct = {
  handle: string
  title: string
  title_ar: string
  collection: string
  description: string
  options: string[]
  images: string[]
  variants: SeedVariant[]
}

const COLLECTIONS: Record<string, { title: string; ar: string }> = {
  fruit: { title: "PlantX Fruit™", ar: "تركيبات احترافية لمحاصيل الثمار" },
  leafy: { title: "PlantX Leafy™", ar: "محاليل متخصصة للمحاصيل الورقية" },
  berry: { title: "PlantX Berry™", ar: "برنامج تغذية للفراولة والتوت" },
  garden: { title: "PlantX Garden™", ar: "تغذية نباتات الزينة الداخلية والمزهرة" },
  compost: { title: "PlantX Compost™", ar: "محسنات تربة ومنتجات عضوية" },
}

const DATA_DIR = path.resolve(process.cwd(), "seed-data")

export default async function seedPlantx({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const products: SeedProduct[] = JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, "products.json"), "utf8")
  )

  const { data: existing } = await query.graph({ entity: "product", fields: ["handle"] })
  const have = new Set(existing.map((p) => p.handle))
  const todo = products.filter((p) => !have.has(p.handle))
  if (!todo.length) {
    logger.info("All PlantX products already exist.")
    return
  }

  const [{ data: channels }, { data: profiles }, { data: locations }] = await Promise.all([
    query.graph({ entity: "sales_channel", fields: ["id"] }),
    query.graph({ entity: "shipping_profile", fields: ["id"] }),
    query.graph({ entity: "stock_location", fields: ["id"] }),
  ])

  // Collections
  const { data: existingCollections } = await query.graph({
    entity: "product_collection",
    fields: ["id", "handle"],
  })
  const collectionId: Record<string, string> = {}
  for (const c of existingCollections) {
    collectionId[String(c.handle).replace(/^plantx-/, "")] = c.id
  }
  const missingCollections = Object.entries(COLLECTIONS).filter(([k]) => !collectionId[k])
  if (missingCollections.length) {
    const { result } = await createCollectionsWorkflow(container).run({
      input: {
        collections: missingCollections.map(([key, c]) => ({
          title: c.title,
          handle: `plantx-${key}`,
          metadata: { title_ar: c.ar },
        })),
      },
    })
    for (const c of result) {
      collectionId[c.handle.replace(/^plantx-/, "")] = c.id
    }
  }

  // Shared options
  const optionValues: Record<string, Set<string>> = {}
  for (const p of todo) {
    p.options.forEach((name, i) => {
      optionValues[name] ??= new Set()
      p.variants.forEach((v) => optionValues[name].add(v.options[i]))
    })
  }
  const { data: existingOptions } = await query.graph({
    entity: "product_option",
    fields: ["id", "title"],
  })
  const optionId: Record<string, string> = {}
  for (const o of existingOptions) {
    optionId[o.title] = o.id
  }
  const newOptions = Object.keys(optionValues).filter((t) => !optionId[t])
  if (newOptions.length) {
    const { result } = await createProductOptionsWorkflow(container).run({
      input: {
        product_options: newOptions.map((title) => ({
          title,
          values: [...optionValues[title]],
        })),
      },
    })
    for (const o of result) {
      optionId[o.title] = o.id
    }
  }

  const salePrices: { sku: string; amount: number }[] = []

  for (const p of todo) {
    const { result: files } = await uploadFilesWorkflow(container).run({
      input: {
        files: p.images.map((name) => ({
          filename: name,
          mimeType: "image/jpeg",
          content: fs.readFileSync(path.join(DATA_DIR, "images", name)).toString("base64"),
          access: "public" as const,
        })),
      },
    })

    await createProductsWorkflow(container).run({
      input: {
        products: [
          {
            title: p.title,
            handle: p.handle,
            description: p.description,
            status: ProductStatus.PUBLISHED,
            collection_id: collectionId[p.collection],
            shipping_profile_id: profiles[0].id,
            thumbnail: files[0]?.url,
            images: files.map((f) => ({ url: f.url })),
            metadata: { title_ar: p.title_ar },
            options: p.options.map((name) => ({ id: optionId[name] })),
            variants: p.variants.map((v, i) => {
              const sku = v.sku || `${p.handle}-${i + 1}`
              if (v.compare_at && v.compare_at > v.price) {
                salePrices.push({ sku, amount: v.price })
              }
              return {
                title: v.options.join(" / "),
                sku,
                weight: v.grams,
                manage_inventory: true,
                options: Object.fromEntries(p.options.map((name, j) => [name, v.options[j]])),
                prices: [{ currency_code: "egp", amount: v.compare_at ?? v.price }],
              }
            }),
            sales_channels: channels.map((c) => ({ id: c.id })),
          },
        ],
      },
    })
    logger.info(`Created ${p.title}`)
  }

  // Sale price list for discounted variants
  if (salePrices.length) {
    const { data: variants } = await query.graph({
      entity: "product_variant",
      fields: ["id", "sku"],
      filters: { sku: salePrices.map((s) => s.sku) },
    })
    const bySku = new Map(variants.map((v) => [v.sku, v.id]))
    await createPriceListsWorkflow(container).run({
      input: {
        price_lists_data: [
          {
            title: "PlantX offer",
            description: "Current discounted prices",
            status: "active",
            prices: salePrices
              .filter((s) => bySku.has(s.sku))
              .map((s) => ({ variant_id: bySku.get(s.sku)!, amount: s.amount, currency_code: "egp" })),
          },
        ],
      },
    })
  }

  // Stock
  const { data: items } = await query.graph({
    entity: "inventory_item",
    fields: ["id", "location_levels.id"],
  })
  const unstocked = items.filter((i) => !i.location_levels?.length)
  if (unstocked.length) {
    await createInventoryLevelsWorkflow(container).run({
      input: {
        inventory_levels: unstocked.map((i) => ({
          inventory_item_id: i.id,
          location_id: locations[0].id,
          stocked_quantity: 100,
        })),
      },
    })
  }

  logger.info(`Imported ${todo.length} PlantX products.`)
}
