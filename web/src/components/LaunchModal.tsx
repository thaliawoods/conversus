import { useState } from "react";
import type { Message } from "../pages/Chat";

type LaunchModalProps = {
  messages: Message[];
  onCancel: () => void;
  onLaunch: (subject: string) => void;
};

function LaunchModal({ messages, onCancel, onLaunch }: LaunchModalProps) {
  const [subject, setSubject] = useState(messages[0].content);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!subject.trim()) return;
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
        <p className="modal-label">Messages à l'origine</p>
        <ul className="modal-messages">
          {messages.map((message) => (
            <li key={message.id}>
              <strong>{message.user}</strong> {message.content}
            </li>
          ))}
        </ul>
        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            Annuler
          </button>
          <button type="submit" disabled={!subject.trim()}>
            Lancer le ConVersus
          </button>
        </div>
      </form>
    </div>
  );
}

export default LaunchModal;
