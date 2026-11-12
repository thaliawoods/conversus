import { useRef, useState } from "react";
import EmojiPicker, { EmojiStyle, Theme } from "emoji-picker-react";
import SendArrow from "./SendArrow";

type ChannelComposerProps = {
  placeholder: string;
  onSend: (content: string) => Promise<boolean>;
};

function ChannelComposer({ placeholder, onSend }: ChannelComposerProps) {
  const [content, setContent] = useState("");
  const [emojis, setEmojis] = useState(false);
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!content.trim() || sending) return;
    setSending(true);
    const sent = await onSend(content.trim());
    setSending(false);
    if (!sent) return;
    setContent("");
    setEmojis(false);
  }

  return (
    <div className="composer">
      {emojis && (
        <div className="composer-above">
          <EmojiPicker
            emojiStyle={EmojiStyle.NATIVE}
            theme={Theme.DARK}
            emojiData={() => import("emoji-picker-react/data/emojis-fr")}
            labels={{ searchPlaceholder: "Rechercher" }}
            previewConfig={{ showPreview: false }}
            onEmojiClick={(emoji) => {
              setContent((current) => current + emoji.emoji);
              setEmojis(false);
              inputRef.current?.focus();
            }}
          />
        </div>
      )}
      <form className="message-form" onSubmit={handleSubmit}>
        <button
          type="button"
          className={emojis ? "composer-tool on" : "composer-tool"}
          data-tip="Emojis"
          aria-label="Emojis"
          aria-expanded={emojis}
          onClick={() => setEmojis(!emojis)}
        >
          ☺
        </button>
        <div className="send-line">
          <input
            ref={inputRef}
            value={content}
            placeholder={placeholder}
            onChange={(event) => setContent(event.target.value)}
          />
          <button className="send-button" type="submit" disabled={sending} aria-label="Envoyer" data-tip="Envoyer">
            <SendArrow />
          </button>
        </div>
      </form>
    </div>
  );
}

export default ChannelComposer;
