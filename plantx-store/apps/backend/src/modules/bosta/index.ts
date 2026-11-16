import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import BostaFulfillmentService from "./service"

export default ModuleProvider(Modules.FULFILLMENT, {
  services: [BostaFulfillmentService],
})
