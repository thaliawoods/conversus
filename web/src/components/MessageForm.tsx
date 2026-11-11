import { useState } from "react";
import EmojiPicker, { EmojiStyle, Theme } from "emoji-picker-react";
import { FONTS, fontFamily } from "../fonts";
import ReactionIcon, { REACTIONS } from "./ReactionIcon";
import AnonymousIcon from "./AnonymousIcon";
import type { ReactionValue } from "../pages/Chat";

type MessageFormProps = {
  onSend: (
    content: string,
    font: string | undefined,
    effect: ReactionValue | undefined,
    anonymous: boolean,
  ) => Promise<boolean>;
  placeholder: string;
  error: string;
};

type Panel = "emoji" | "font" | "effect" | null;

function MessageForm({ onSend, placeholder, error }: MessageFormProps) {
  const [content, setContent] = useState("");
  const [font, setFont] = useState<string | undefined>(undefined);
  const [effect, setEffect] = useState<ReactionValue | undefined>(undefined);
  const [anonymous, setAnonymous] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [sending, setSending] = useState(false);

  function togglePanel(name: Panel) {
    setPanel(panel === name ? null : name);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!content.trim() || sending) return;
    setSending(true);
    const sent = await onSend(content, font, effect, anonymous);
    setSending(false);
    if (!sent) return;
    setContent("");
    setEffect(undefined);
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
        {panel === "effect" && (
          <div className="composer-panel">
            <button
              type="button"
              className={effect === undefined ? "active" : undefined}
              onClick={() => {
                setEffect(undefined);
                setPanel(null);
              }}
            >
              Aucun
            </button>
            {REACTIONS.map((option) => (
              <button
                type="button"
                key={option.value}
                className={effect === option.value ? "active" : undefined}
                data-tip={option.label}
                aria-label={option.label}
                onClick={() => {
                  setEffect(option.value);
                  setPanel(null);
                }}
              >
                <ReactionIcon value={option.value} />
              </button>
            ))}
          </div>
        )}
        {content && (
          <p className="composer-preview" style={{ fontFamily: fontFamily(font) }}>
            {content}
          </p>
        )}
        {error && <p className="login-error" role="alert">{error}</p>}
      </div>
      <form className="message-form" onSubmit={handleSubmit}>
        <button
          type="button"
          className={panel === "emoji" ? "composer-tool on" : "composer-tool"}
          data-tip="Emojis"
          aria-label="Emojis"
          aria-expanded={panel === "emoji"}
          onClick={() => togglePanel("emoji")}
        >
          ☺
        </button>
        <button
          type="button"
          className={panel === "font" ? "composer-tool on" : "composer-tool"}
          data-tip="Change ta police"
          aria-label="Change ta police"
          aria-expanded={panel === "font"}
          onClick={() => togglePanel("font")}
        >
          Aa
        </button>
        <button
          type="button"
          className={panel === "effect" ? "composer-tool on" : "composer-tool"}
          data-tip="Choisis ton effet"
          aria-label="Choisis ton effet"
          aria-expanded={panel === "effect"}
          onClick={() => togglePanel("effect")}
        >
          ✦
        </button>
        <button
          type="button"
          className={anonymous ? "composer-tool on" : "composer-tool"}
          data-tip="Anonyme"
          aria-label="Anonyme"
          aria-pressed={anonymous}
          onClick={() => setAnonymous(!anonymous)}
        >
          <AnonymousIcon lit={anonymous} />
        </button>
        <input
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder={placeholder}
          style={{ fontFamily: fontFamily(font) }}
        />
        <button type="submit" disabled={sending}>Envoyer</button>
      </form>
    </div>
  );
}

export default MessageForm;
