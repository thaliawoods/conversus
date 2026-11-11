import { useState } from "react";
import EmojiPicker, { EmojiStyle, Theme } from "emoji-picker-react";
import { FONTS, fontFamily } from "../fonts";
import AnonymousIcon from "./AnonymousIcon";

type MessageFormProps = {
  onSend: (
    content: string,
    font: string | undefined,
    anonymous: boolean,
    useAI: boolean,
  ) => Promise<boolean>;
};

type Panel = "emoji" | "font" | null;

const AI_KEY = "conversus-ia";

// Choix mémorisé dans ce navigateur ; activé par défaut.
function readUseAI() {
  try {
    return localStorage.getItem(AI_KEY) !== "off";
  } catch {
    return true;
  }
}

function MessageForm({ onSend }: MessageFormProps) {
  const [content, setContent] = useState("");
  const [font, setFont] = useState<string | undefined>(undefined);
  const [sending, setSending] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [useAI, setUseAI] = useState(readUseAI);

  function toggleAI() {
    const next = !useAI;
    setUseAI(next);
    try {
      localStorage.setItem(AI_KEY, next ? "on" : "off");
    } catch {
      // stockage indisponible : le choix vaut pour cette page seulement
    }
  }

  function togglePanel(name: Panel) {
    setPanel(panel === name ? null : name);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!content.trim() || sending) return;
    setSending(true);
    const sent = await onSend(content, font, anonymous, useAI);
    setSending(false);
    if (!sent) return;
    setContent("");
    setPanel(null);
  }

  return (
    <div className="composer">
      <div className="composer-above">
        {panel === "emoji" && (
          <EmojiPicker
            emojiStyle={EmojiStyle.NATIVE}
            theme={Theme.DARK}
            emojiData={() => import("emoji-picker-react/data/emojis-fr")}
            labels={{ searchPlaceholder: "Rechercher" }}
            previewConfig={{ showPreview: false }}
            onEmojiClick={(emoji) => {
              setContent((current) => current + emoji.emoji);
              setPanel(null);
            }}
          />
        )}
        {panel === "font" && (
          <div className="composer-panel">
            {FONTS.map((option) => (
              <button
                type="button"
                key={option.label}
                className={font === option.value ? "active" : undefined}
                style={{ fontFamily: fontFamily(option.value) }}
                onClick={() => {
                  setFont(option.value);
                  setPanel(null);
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <form className="message-form" onSubmit={handleSubmit}>
        <button
          type="button"
          className={panel === "emoji" ? "composer-tool on" : "composer-tool"}
          title="Emojis"
          aria-label="Emojis"
          aria-expanded={panel === "emoji"}
          onClick={() => togglePanel("emoji")}
        >
          ☺
        </button>
        <button
          type="button"
          className={panel === "font" ? "composer-tool on" : "composer-tool"}
          title="Choisir la police"
          aria-label="Choisir la police"
          aria-expanded={panel === "font"}
          onClick={() => togglePanel("font")}
        >
          Aa
        </button>
        <button
          type="button"
          className={anonymous ? "composer-tool on" : "composer-tool"}
          title={anonymous ? "Mode anonyme activé" : "Envoyer sans révéler mon identité"}
          aria-label="Mode anonyme"
          aria-pressed={anonymous}
          onClick={() => setAnonymous(!anonymous)}
        >
          <AnonymousIcon lit={anonymous} />
        </button>
        <button
          type="button"
          className={useAI ? "composer-tool on" : "composer-tool"}
          title={useAI ? "L'IA choisit l'allure de la branche (cliquer pour désactiver)" : "IA désactivée : branche sans style (cliquer pour activer)"}
          aria-label="Style de branche par l'IA"
          aria-pressed={useAI}
          onClick={toggleAI}
        >
          IA
        </button>
        <input
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="Écris ton message..."
          style={{ fontFamily: fontFamily(font) }}
        />
        <button type="submit" disabled={sending}>{sending ? "…" : "Envoyer"}</button>
      </form>
    </div>
  );
}

export default MessageForm;
