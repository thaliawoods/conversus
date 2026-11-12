import { useState } from "react";
import EmojiPicker, { EmojiStyle, Theme } from "emoji-picker-react";
import { fontFamily } from "../fonts";
import AnonymousIcon from "./AnonymousIcon";
import SendArrow from "./SendArrow";
import type { ReactionValue } from "../pages/Chat";

type MessageFormProps = {
  onSend: (
    content: string,
    effect: ReactionValue | undefined,
    anonymous: boolean,
  ) => Promise<boolean>;
  placeholder: string;
  error: string;
};

type Panel = "emoji" | null;

function MessageForm({ onSend, placeholder, error }: MessageFormProps) {
  const [content, setContent] = useState("");
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
    const sent = await onSend(content, effect, anonymous);
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
          className={anonymous ? "composer-tool on" : "composer-tool"}
          data-tip="Anonyme"
          aria-label="Anonyme"
          aria-pressed={anonymous}
          onClick={() => setAnonymous(!anonymous)}
        >
          <AnonymousIcon lit={anonymous} />
        </button>
        <div className="send-line">
          <input
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder={placeholder}
            style={{ fontFamily: fontFamily() }}
          />
          <button className="send-button" type="submit" disabled={sending} aria-label="Envoyer" data-tip="Envoyer">
            <SendArrow />
          </button>
        </div>
      </form>
    </div>
  );
}

export default MessageForm;
