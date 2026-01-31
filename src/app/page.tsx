import { Canvas } from "@/components/canvas/Canvas";
import { ChatPanel } from "@/components/chat/ChatPanel";

export default function Home() {
  return (
    <main className="min-h-screen flex">
      {/* Canvas takes remaining space */}
      <div className="flex-1 p-4">
        <Canvas />
      </div>

      {/* Chat sidebar - fixed width */}
      <div className="w-80 h-screen sticky top-0">
        <ChatPanel />
      </div>
    </main>
  );
}
