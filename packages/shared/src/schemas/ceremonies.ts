import { z } from "zod";
import { positiveIdString } from "./common.js";

/** `/ceremonies/:id` */
export const ceremonyDetailParams = z.object({
  id: positiveIdString("That link doesn't look right")
});
