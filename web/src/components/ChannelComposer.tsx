import { useEffect, useRef, useState } from "react";
import EmojiPicker, { EmojiStyle, Theme } from "emoji-picker-react";

type ChannelComposerProps = {
  placeholder: string;
  onSend: (content: string) => Promise<boolean>;
};

// Zone de texte toute simple : Entrée envoie, Maj+Entrée va à la ligne, un bouton pour les emojis.
function ChannelComposer({ placeholder, onSend }: ChannelComposerProps) {
  const [content, setContent] = useState("");
  const [emojis, setEmojis] = useState(false);
  const [sending, setSending] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const text = textRef.current;
    if (!text) return;
    text.style.height = "auto";
    text.style.height = `${Math.min(text.scrollHeight, 160)}px`;
  }, [content]);

  async function send() {
    if (!content.trim() || sending) return;
    setSending(true);
    const sent = await onSend(content.trim());
    setSending(false);
    if (!sent) return;
    setContent("");
    setEmojis(false);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    send();
  }

  return (
    <div className="channel-composer">
      {emojis && (
        <div className="channel-composer-emojis">
          <EmojiPicker
            emojiStyle={EmojiStyle.NATIVE}
            theme={Theme.DARK}
            emojiData={() => import("emoji-picker-react/data/emojis-fr")}
            labels={{ searchPlaceholder: "Rechercher" }}
            previewConfig={{ showPreview: false }}
            onEmojiClick={(emoji) => {
              setContent((current) => current + emoji.emoji);
              setEmojis(false);
              textRef.current?.focus();
            }}
          />
        </div>
      )}
      <textarea
        ref={textRef}
        rows={1}
        value={content}
        placeholder={placeholder}
        onChange={(event) => setContent(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      <button
        type="button"
        className={emojis ? "emoji-toggle on" : "emoji-toggle"}
        title="Emojis"
        aria-label="Emojis"
        aria-expanded={emojis}
        onClick={() => setEmojis(!emojis)}
      >
        ☺
      </button>
    </div>
  );
}

export default ChannelComposer;
