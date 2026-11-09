import { useEffect, useState } from "react";
import { useParams } from "react-router";
import type { Channel } from "../components/Navbar";

type DebateProps = { token: string };

function Debate({ token }: DebateProps) {
  const { channelId } = useParams();
  const [channels, setChannels] = useState<Channel[]>([]);
  const debate = channels.find((channel) => channel.id === Number(channelId));

  useEffect(() => {
    async function loadChannels() {
      const response = await fetch("http://localhost:4000/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return;
      const profile = await response.json();
      setChannels(profile.channels);
    }

    loadChannels();
  }, [token]);

  return (
    <main className="chat debate">
      <h2 className="channel-title">{debate?.name.replace(/#\d+$/, "")}</h2>
    </main>
  );
}

export default Debate;
