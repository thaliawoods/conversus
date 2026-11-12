// Vercel function: POST /api/synthese (the front calls /ia/synthese, rewritten in vercel.json).
// Same job as the Vite dev server plugin in ia/serveur.ts. The OpenAI key comes from Vercel's settings.
import { configDepuis, synthetiser } from "./_synthese.js";

const TAILLE_MAX = 2e5;

export async function POST(request: Request) {
  const texte = await request.text();
  // A debate is at most 100 messages: 200 kB is plenty.
  if (texte.length > TAILLE_MAX) return Response.json({ erreur: "Requête trop grosse" }, { status: 413 });
  let demande;
  try {
    demande = JSON.parse(texte || "{}");
  } catch {
    return Response.json({ erreur: "JSON invalide" }, { status: 400 });
  }
  const { code, corps } = await synthetiser(configDepuis(process.env), demande, request.headers.get("authorization"));
  return Response.json(corps, { status: code });
}
