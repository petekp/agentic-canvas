import { Canvas } from "@/components/canvas/Canvas";
import { ChatPanel } from "@/components/chat/ChatPanel";

export default function Home() {
  return (
    <main className="relative h-screen overflow-hidden">
      <Canvas />
      <ChatPanel />
    </main>
  );
}
