import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import PaymobProviderService from "./service"

export default ModuleProvider(Modules.PAYMENT, {
  services: [PaymobProviderService],
})
