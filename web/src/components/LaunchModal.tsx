import { useState } from "react";
import type { Message } from "../pages/Chat";
import { pronounsByName } from "../pronouns";

type LaunchModalProps = {
  messages: Message[];
  onCancel: () => void;
  onLaunch: (subject: string) => void;
};

function LaunchModal({ messages, onCancel, onLaunch }: LaunchModalProps) {
  const [subject, setSubject] = useState(messages[0].content);
  const [launching, setLaunching] = useState(false);
  const [unfolded, setUnfolded] = useState<number[]>([]);
  const pronounsOf = pronounsByName(messages);

  function toggleUnfolded(id: number) {
    setUnfolded((current) => (current.includes(id) ? current.filter((other) => other !== id) : [...current, id]));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!subject.trim() || launching) return;
    setLaunching(true);
    onLaunch(subject.trim());
  }

  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={handleSubmit}>
        <h2>Ouvrir un ConVersus</h2>
        <label className="modal-label">
          Sujet
          <input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
          />
        </label>
        <p className="modal-label">
          Messages à l'origine <span className="modal-count">{messages.length}</span>
        </p>
        <ul className="modal-messages">
          {messages.map((message) => (
            <li key={message.id} className={unfolded.includes(message.id) ? "unfolded" : undefined}>
              <strong>
                {message.user}
                {!message.anonymous && pronounsOf.get(message.user) && (
                  <span className="pronouns"> · {pronounsOf.get(message.user)}</span>
                )}
              </strong>
              <button type="button" aria-expanded={unfolded.includes(message.id)} onClick={() => toggleUnfolded(message.id)}>
                {message.content}
              </button>
            </li>
          ))}
        </ul>
        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            Annuler
          </button>
          <button type="submit" disabled={!subject.trim() || launching}>
            Lancer le ConVersus
          </button>
        </div>
      </form>
    </div>
  );
}

export default LaunchModal;
