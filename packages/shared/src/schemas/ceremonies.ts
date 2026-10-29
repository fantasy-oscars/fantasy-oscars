import { z } from "zod";
import { positiveIdString } from "./common.js";

/** `/ceremonies/:id` */
export const ceremonyDetailParams = z.object({
  id: positiveIdString("Invalid ceremony id")
});
