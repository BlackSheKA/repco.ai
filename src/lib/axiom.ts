import { Axiom } from "@axiomhq/js";

// Only instantiate Axiom client when token is available.
// In local dev without AXIOM_TOKEN, axiom will be null and
// logger.ts guards all ingest calls with a token check.
export const axiom = process.env.AXIOM_TOKEN
  ? new Axiom({ token: process.env.AXIOM_TOKEN })
  : (null as unknown as Axiom);

export const AXIOM_DATASET = process.env.AXIOM_DATASET || "repco";
