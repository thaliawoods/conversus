import { useState } from "react";
import EmojiPicker, { EmojiStyle } from "emoji-picker-react";
import { FONTS, fontFamily } from "../fonts";

type MessageFormProps = {
  onSend: (content: string, font: string | undefined, anonymous: boolean) => Promise<boolean>;
};

type Panel = "emoji" | "font" | null;

function MessageForm({ onSend }: MessageFormProps) {
  const [content, setContent] = useState("");
  const [font, setFont] = useState<string | undefined>(undefined);
  const [anonymous, setAnonymous] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);

  function togglePanel(name: Panel) {
    setPanel(panel === name ? null : name);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!content.trim()) return;
    const sent = await onSend(content, font, anonymous);
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
        {content && (
          <p className="composer-preview" style={{ fontFamily: fontFamily(font) }}>
            {content}
          </p>
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
          <img src="/anonyme.png" alt="" />
        </button>
        <input
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="Écris ton message..."
          style={{ fontFamily: fontFamily(font) }}
        />
        <button type="submit">Envoyer</button>
      </form>
    </div>
  );
}

export default MessageForm;
