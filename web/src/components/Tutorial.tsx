import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import SynthesisIcon from "./SynthesisIcon";

// Column the step needs on screen (the workspace opens it, or switches tab on mobile).
export type TutorialColumn = "side" | "channel" | "debate";

type Step = {
  title: string;
  text: string;
  // CSS selector of the part to light up; none = centred bubble.
  target?: string;
  reveal?: TutorialColumn;
  // The step ends with something the user does, not with "Suivant":
  // "open" a ConVersus, "select" messages (selection mode on), "launch" a new ConVersus.
  waitFor?: "open" | "select" | "launch";
};

const STEPS: Step[] = [
  {
    title: "Bienvenue sur ConVersus",
    text:
      "Ici, quand un sujet mérite qu'on s'y arrête, on en fait un ConVersus : un débat qui pousse comme une plante. " +
      "Chaque réponse devient une branche, et les réactions y font pousser des feuilles, des épines, ou la font faner. " +
      "Quand le débat a bien poussé, on en tire une synthèse. Je te montre comment ça marche ?",
  },
  {
    title: "Les canaux",
    text:
      "On y discute librement. Tu peux y partager la synthèse d'un ConVersus à tout moment, " +
      "pour faire le point sur où en est le débat.",
    target: '[data-tour="channels"]',
    reveal: "side",
  },
  {
    title: "Les ConVersus",
    text: "Les débats ouverts dans ce canal. Ouvre-en un.",
    target: '[data-tour="debates"]',
    reveal: "side",
    waitFor: "open",
  },
  {
    title: "Participer au débat",
    text:
      "Écris ici pour ajouter ta branche au ConVersus. Tu peux ajouter des emojis, changer la police ou passer en anonyme avec le chapeau.",
    target: ".chat.debate .message-form",
    reveal: "debate",
  },
  {
    title: "Répondre et réagir",
    text:
      "Clique sur un message de la plante pour le lire en entier, y répondre, ou réagir : content, en colère ou triste. " +
      "Ta réaction fait briller le message un instant de sa couleur, et change sa police.",
    target: ".chat.debate .viewport",
    reveal: "debate",
  },
  {
    title: "Écrire dans le canal",
    text: "Pour discuter dans le canal ouvert, hors débat, c'est ici.",
    target: ".channel-panel .message-form",
    reveal: "channel",
  },
  {
    title: "Lancer un ConVersus",
    text: "Un sujet s'enflamme ? Transforme-le en ConVersus. Essaie : clique sur « Lancer un ConVersus ».",
    target: ".channel-panel .panel-action",
    reveal: "channel",
    waitFor: "select",
  },
  {
    title: "Choisis les messages",
    text:
      "Coche les messages dont tu as envie de débattre, puis clique sur « Lancer le ConVersus » en bas. " +
      "Tu choisis alors le titre du débat : c'est la question à laquelle tout le monde va répondre.",
    target: ".channel-panel",
    reveal: "channel",
    waitFor: "launch",
  },
  {
    title: "La synthèse",
    text:
      "Quand le débat a bien poussé, « Faire ma Synthesis » en tire un résumé, partagé dans le canal d'origine ou dans le canal Synthesis.",
    target: ".synthesis-button",
    reveal: "debate",
  },
];

// Space between the lit part and its outline, and between the outline and the bubble.
const PAD = 6;
const GAP = 14;
const MARGIN = 16;

type Rect = { top: number; left: number; width: number; height: number };

function sameRect(a: Rect | null, b: Rect | null) {
  return a === b || (!!a && !!b && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height);
}

// Where the target is on screen, with its outline padding; null when it is not shown.
function measure(selector: string | undefined): Rect | null {
  if (!selector) return null;
  const element = document.querySelector(selector);
  if (!element) return null;
  const box = element.getBoundingClientRect();
  if (box.width === 0 || box.height === 0) return null;
  return {
    top: Math.round(box.top - PAD),
    left: Math.round(box.left - PAD),
    width: Math.round(box.width + PAD * 2),
    height: Math.round(box.height + PAD * 2),
  };
}

// Beside the target when there is room (right first), otherwise below or above it.
function placeBubble(rect: Rect | null, bubble: { width: number; height: number }) {
  const { innerWidth: width, innerHeight: height } = window;
  const clampLeft = (left: number) => Math.max(MARGIN, Math.min(left, width - bubble.width - MARGIN));
  const clampTop = (top: number) => Math.max(MARGIN, Math.min(top, height - bubble.height - MARGIN));
  if (!rect) return { left: (width - bubble.width) / 2, top: (height - bubble.height) / 2 };
  if (rect.left + rect.width + GAP + bubble.width + MARGIN <= width) {
    return { left: rect.left + rect.width + GAP, top: clampTop(rect.top) };
  }
  if (rect.left - GAP - bubble.width >= MARGIN) {
    return { left: rect.left - GAP - bubble.width, top: clampTop(rect.top) };
  }
  const left = clampLeft(rect.left + rect.width / 2 - bubble.width / 2);
  if (rect.top + rect.height + GAP + bubble.height + MARGIN <= height) return { left, top: rect.top + rect.height + GAP };
  if (rect.top - GAP - bubble.height >= MARGIN) return { left, top: rect.top - GAP - bubble.height };
  // Target taller than the screen (the whole plant on a phone): bubble over its bottom.
  return { left, top: height - bubble.height - MARGIN };
}

type TutorialProps = {
  // The ConVersus open right now, if any.
  debateId: string | undefined;
  hasDebates: boolean;
  // Message selection mode of the channel (first step of launching a ConVersus).
  selecting: boolean;
  onReveal: (column: TutorialColumn) => void;
  onClose: () => void;
};

function Tutorial({ debateId, hasDebates, selecting, onReveal, onClose }: TutorialProps) {
  const [index, setIndex] = useState(0);
  const step = STEPS[index];
  const last = index === STEPS.length - 1;
  const [rect, setRect] = useState<Rect | null>(null);
  // A dialog of the app is open (choosing the title of the new ConVersus): the tour steps aside.
  const [paused, setPaused] = useState(false);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [bubbleSize, setBubbleSize] = useState({ width: 320, height: 200 });
  // ConVersus open when a waiting step began: only opening or launching another one counts.
  const [debateAtStep, setDebateAtStep] = useState<{ index: number; debateId: string | undefined }>({ index, debateId });
  if (debateAtStep.index !== index) setDebateAtStep({ index, debateId });
  const reveal = useRef(onReveal);
  useEffect(() => {
    reveal.current = onReveal;
  }, [onReveal]);

  useEffect(() => {
    if (step.reveal) reveal.current(step.reveal);
  }, [step]);

  // What the user did moves the tour on.
  const opened = debateId !== undefined && debateId !== debateAtStep.debateId;
  const done = step.waitFor === "select" ? selecting : opened;
  if (step.waitFor && debateAtStep.index === index && done) setIndex(index + 1);

  // Follows the target every frame: columns slide, resize and load their content.
  useEffect(() => {
    let frame = 0;
    const follow = () => {
      const next = measure(step.target);
      setRect((current) => (sameRect(current, next) ? current : next));
      setPaused(document.querySelector(".modal-backdrop") !== null);
      frame = requestAnimationFrame(follow);
    };
    follow();
    return () => cancelAnimationFrame(frame);
  }, [step]);

  useLayoutEffect(() => {
    const bubble = bubbleRef.current;
    if (!bubble) return;
    const update = () => setBubbleSize({ width: bubble.offsetWidth, height: bubble.offsetHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(bubble);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    // Escape in an app dialog (while the tour steps aside) belongs to that dialog.
    const skip = (event: KeyboardEvent) =>
      event.key === "Escape" && !document.querySelector(".modal-backdrop") && onClose();
    window.addEventListener("keydown", skip);
    return () => window.removeEventListener("keydown", skip);
  }, [onClose]);

  // Waiting for the user to act on the lit part. Opening a ConVersus is optional when one is
  // already open or none exists; a part that is not on screen cannot be waited for.
  const waiting = !!step.waitFor && rect !== null && (step.waitFor !== "open" || (hasDebates && debateId === undefined));
  const interactive = !!step.waitFor && rect !== null;
  const position = placeBubble(rect, bubbleSize);

  function next() {
    if (last) onClose();
    else setIndex(index + 1);
  }

  return createPortal(
    <div className="tour" role="dialog" aria-modal aria-labelledby="tour-title" hidden={paused}>
      {rect ? (
        <>
          <div className="tour-hole" style={rect} />
          {/* Clicks outside the lit part do nothing; inside it, only when the step asks for one. */}
          <div className="tour-block" style={{ top: 0, left: 0, right: 0, height: Math.max(0, rect.top) }} />
          <div className="tour-block" style={{ top: rect.top + rect.height, left: 0, right: 0, bottom: 0 }} />
          <div className="tour-block" style={{ top: rect.top, left: 0, width: Math.max(0, rect.left), height: rect.height }} />
          <div className="tour-block" style={{ top: rect.top, left: rect.left + rect.width, right: 0, height: rect.height }} />
          {!interactive && <div className="tour-block" style={rect} />}
        </>
      ) : (
        <div className="tour-dim" />
      )}
      <div className={step.target ? "tour-bubble" : "tour-bubble centred"} ref={bubbleRef} style={position}>
        {!step.target && <SynthesisIcon />}
        <p className="tour-progress">
          {index + 1} / {STEPS.length}
        </p>
        <h2 id="tour-title">{step.title}</h2>
        <p className="tour-text">{step.text}</p>
        {step.waitFor === "open" && !hasDebates && (
          <p className="tour-text tour-hint">Il n'y en a pas encore : passe à la suite, tu en verras bientôt.</p>
        )}
        {step.waitFor === "launch" && !selecting && (
          <p className="tour-text tour-hint">Clique d'abord sur « Lancer un ConVersus », en haut du canal.</p>
        )}
        <div className="tour-actions">
          {!last && (
            <button type="button" className="tour-skip" onClick={onClose}>
              Passer le tuto
            </button>
          )}
          {index > 0 && !step.waitFor && (
            <button type="button" onClick={() => setIndex(index - 1)}>
              Retour
            </button>
          )}
          {waiting ? (
            <button type="button" onClick={next}>
              Passer l'étape
            </button>
          ) : (
            <button type="button" className="tour-next" onClick={next} autoFocus>
              {index === 0 ? "C'est parti" : last ? "Terminer" : "Suivant"}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default Tutorial;
