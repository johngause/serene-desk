// Calls the same Jev request the relay /intent route makes. Usage: node tools/intent-probe.mjs  (reads TYPESAFE_API_KEY from .env)
import fs from "node:fs";
const key = fs.readFileSync(new URL("../.env", import.meta.url), "utf8").match(/^TYPESAFE_API_KEY=(.+)$/m)[1].trim();
const cart = [{ id: "desk-mat", name: "Wool Felt Desk Mat", sale: true }, { id: "lamp", name: "Lantern Desk Lamp", sale: false }];
export function body(text, items) {
  const criteria = {};
  for (const i of items) criteria[i.id] = i.name + (i.sale ? " (on sale)" : "");
  criteria.none = "No single cart item is clearly meant";
  return { model: "jev-latest", state: { message: text, cart: items }, questions: {
    action: { type: "choice", instructions: "Does the customer's message explicitly ask the shop assistant to act on the website right now? Describing a problem, error or complaint, or asking why or what something means, is NOT a request to act.", criteria: {
      remove: "Remove an item from the cart (take out, drop, delete)",
      apply_promo: "An imperative request to apply, re-apply or try the promo code again, without removing anything (not merely mentioning an error or a code that fails)",
      remove_and_apply: "Both remove a cart item and apply or re-try the promo code",
      none: "Anything else: questions, problem reports, error codes, complaints, policies, delivery, product info, or no explicit action request" } },
    item: { type: "choice", instructions: "Which cart item does the customer want removed? 'the sale item' means the item marked on sale.", criteria } } };
}
if (process.argv[1].endsWith("intent-probe.mjs")) for (const t of ["can you remove the mat from my cart","remove the sale item","take out the wool felt desk mat","remove the felt desk mat and try reapplying the promo code","what's your return policy","how long is delivery","is the desk mat on sale","try the promo code again","remove the lamp","I'm getting an error code when I'm applying a promo the error code is promo-04","my code SERENE10 isn't working","why was my code rejected","which items","apply SERENE10","use SERENE10","get rid of the mat","put the code in"]) {
  const t0 = Date.now();
  const r = await (await fetch("https://api.typesafe.ai/v1/systemone", { method: "POST", headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" }, body: JSON.stringify(body(t, cart)) })).json();
  console.log(Date.now() - t0 + "ms", JSON.stringify(t), r.answers?.action?.choice, r.answers?.action?.confidence?.toFixed(2), r.answers?.item?.choice, r.answers?.item?.confidence?.toFixed(2), r.error || "");
}
