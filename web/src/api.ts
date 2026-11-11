// Adresse de l'API. Par défaut le serveur de la prof ;
// pour utiliser l'API locale : VITE_API_URL=http://localhost:4000 dans web/.env.local
export const API: string = import.meta.env.VITE_API_URL ?? "http://37.27.91.240:4000";
