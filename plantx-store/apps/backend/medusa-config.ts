import { loadEnv, defineConfig } from "@medusajs/framework/utils"

loadEnv(process.env.NODE_ENV || "development", process.cwd())

const backendUrl = process.env.BACKEND_URL || "http://localhost:9000"
const storefrontUrl = process.env.STOREFRONT_URL || "http://localhost:8000"

const paymentProviders: Record<string, unknown>[] = []
if (process.env.PAYMOB_SECRET_KEY) {
  paymentProviders.push({
    resolve: "./src/modules/paymob",
    id: "paymob",
    options: {
      secretKey: process.env.PAYMOB_SECRET_KEY,
      publicKey: process.env.PAYMOB_PUBLIC_KEY,
      apiKey: process.env.PAYMOB_API_KEY,
      hmacSecret: process.env.PAYMOB_HMAC_SECRET,
      integrationIds: process.env.PAYMOB_INTEGRATION_IDS,
      backendUrl,
      redirectUrl: `${storefrontUrl}/checkout/paymob-return`,
    },
  })
}

const fulfillmentProviders: Record<string, unknown>[] = [
  { resolve: "@medusajs/medusa/fulfillment-manual", id: "manual" },
]
if (process.env.BOSTA_API_KEY) {
  fulfillmentProviders.push({
    resolve: "./src/modules/bosta",
    id: "bosta",
    options: { apiKey: process.env.BOSTA_API_KEY, baseUrl: process.env.BOSTA_BASE_URL },
  })
}

const fileProvider = process.env.S3_BUCKET
  ? {
      resolve: "@medusajs/medusa/file-s3",
      id: "s3",
      options: {
        file_url: process.env.S3_FILE_URL,
        access_key_id: process.env.S3_ACCESS_KEY_ID,
        secret_access_key: process.env.S3_SECRET_ACCESS_KEY,
        region: process.env.S3_REGION,
        bucket: process.env.S3_BUCKET,
        endpoint: process.env.S3_ENDPOINT,
      },
    }
  : {
      resolve: "@medusajs/medusa/file-local",
      id: "local",
      options: { backend_url: `${backendUrl}/static` },
    }

// Production uses Redis for events, workflows, locking and caching so the
// server and worker processes stay in sync.
const redisModules = process.env.REDIS_URL && process.env.NODE_ENV === "production"
  ? [
      { resolve: "@medusajs/medusa/event-bus-redis", options: { redisUrl: process.env.REDIS_URL } },
      {
        resolve: "@medusajs/medusa/workflow-engine-redis",
        options: { redis: { redisUrl: process.env.REDIS_URL } },
      },
      {
        resolve: "@medusajs/medusa/locking",
        options: {
          providers: [
            {
              resolve: "@medusajs/medusa/locking-redis",
              id: "locking-redis",
              is_default: true,
              options: { redisUrl: process.env.REDIS_URL },
            },
          ],
        },
      },
    ]
  : []

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET,
      cookieSecret: process.env.COOKIE_SECRET,
    },
    workerMode: (process.env.MEDUSA_WORKER_MODE as "shared" | "worker" | "server") || "shared",
  },
  admin: {
    backendUrl,
    disable: process.env.DISABLE_MEDUSA_ADMIN === "true",
  },
  modules: [
    ...redisModules,
    {
      resolve: "@medusajs/medusa/payment",
      options: { providers: paymentProviders },
    },
    {
      resolve: "@medusajs/medusa/fulfillment",
      options: { providers: fulfillmentProviders },
    },
    {
      resolve: "@medusajs/medusa/file",
      options: { providers: [fileProvider] },
    },
  ],
})
