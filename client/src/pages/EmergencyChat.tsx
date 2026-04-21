import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  AlertCircle,
  Send,
  Phone,
  MapPin,
  Mic,
  Loader2,
  Square,
  ChevronLeft,
  PanelRight,
  X,
} from "lucide-react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useState, useEffect, useRef } from "react";
import { Streamdown } from "streamdown";

export default function EmergencyChat() {
  const { incidentId } = useParams<{ incidentId: string }>();
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();

  const [messages, setMessages] = useState<Array<{ role: string; content: any }>>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const id = parseInt(incidentId || "0");

  const { data: incident } = trpc.incidents.getById.useQuery(
    { id },
    { enabled: !!id }
  );
  const { data: chatHistory } = trpc.chat.getHistory.useQuery(
    { incidentId: id },
    { enabled: !!id }
  );

  const sendMessage = trpc.ai.chat.useMutation();
  const transcribeAudio = trpc.system.transcribeAudio.useMutation();
  const addChatMessage = trpc.chat.addMessage.useMutation();

  useEffect(() => {
    if (chatHistory && chatHistory.length > 0) {
      setMessages(
        chatHistory.map((msg) => ({ role: msg.role, content: msg.content }))
      );
    } else if (messages.length === 0) {
      setMessages([
        {
          role: "assistant",
          content:
            "I am RAPTOR, your AI emergency co-pilot. I'm here to guide you through this crisis. Tell me what happened and describe any injuries.",
        },
      ]);
    }
  }, [chatHistory]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;
    const userMessage = input.trim();
    setInput("");
    inputRef.current?.focus();

    const newMessages = [...messages, { role: "user", content: userMessage }];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      await addChatMessage.mutateAsync({ incidentId: id, role: "user", content: userMessage });
      const response = await sendMessage.mutateAsync({ incidentId: id, message: userMessage });
      const assistantMessage =
        typeof response.response === "string"
          ? response.response
          : JSON.stringify(response.response);
      setMessages((prev) => [...prev, { role: "assistant", content: assistantMessage }]);
      await addChatMessage.mutateAsync({ incidentId: id, role: "assistant", content: assistantMessage });
    } catch (error) {
      console.error("Failed to send message:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      setRecordingTime(0);

      mediaRecorder.ondataavailable = (e) => audioChunksRef.current.push(e.data);
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        try {
          setInput("🎤 Transcribing...");
          
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = async () => {
            try {
              const base64 = (reader.result as string).split(",")[1];
              const result = await transcribeAudio.mutateAsync({
                audio: base64,
                mimeType: audioBlob.type,
              });
              
              if ("text" in result) {
                setInput(result.text || "Unable to transcribe");
              } else {
                setInput("Failed to transcribe. Please try again.");
              }
            } catch (error) {
              console.error("Transcription error:", error);
              setInput("Error transcribing audio. Please try again.");
            }
          };
        } catch (error) {
          console.error("Audio processing error:", error);
          setInput("Error processing audio. Please try again.");
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      recordingTimerRef.current = setInterval(() => setRecordingTime((p) => p + 1), 1000);
    } catch {
      alert("Unable to access microphone. Please check permissions.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
    }
  };

  const formatTime = (s: number) =>
    `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  const triageBadge =
    incident?.triageLevel === "CRITICAL"
      ? "bg-primary/20 text-primary"
      : incident?.triageLevel === "SERIOUS"
      ? "bg-secondary/20 text-secondary"
      : "bg-green-500/20 text-green-400";

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="bg-card p-6 sm:p-8 text-center max-w-sm w-full">
          <AlertCircle className="w-12 h-12 text-primary mx-auto mb-4" />
          <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-2">
            Authentication Required
          </h2>
          <p className="text-foreground/70 mb-6">
            Please sign in to access emergency chat
          </p>
          <Button
            onClick={() => setLocation("/", { replace: true })}
            className="bg-primary text-primary-foreground w-full"
          >
            Go Home
          </Button>
        </Card>
      </div>
    );
  }

  const EmergencySidebar = ({ className = "" }: { className?: string }) => (
    <div className={`flex flex-col gap-0 ${className}`}>
      {/* Emergency Contacts */}
      <div className="p-4 border-b border-border/50">
        <h3 className="font-bold text-foreground mb-3 flex items-center gap-2 text-sm sm:text-base">
          <Phone className="w-4 h-4 text-primary" />
          Emergency Services
        </h3>
        <div className="space-y-2">
          {[
            { num: "112", label: "Universal Emergency" },
            { num: "108", label: "Ambulance" },
            { num: "100", label: "Police" },
          ].map(({ num, label }) => (
            <Button
              key={num}
              variant="outline"
              className="w-full justify-start text-left h-auto py-2 border-primary/30 hover:bg-primary/10"
              onClick={() => (window.location.href = `tel:${num}`)}
            >
              <div>
                <div className="font-bold text-primary">{num}</div>
                <div className="text-xs text-foreground/70">{label}</div>
              </div>
            </Button>
          ))}
        </div>
      </div>

      {/* Location */}
      <div className="p-4 border-b border-border/50">
        <h3 className="font-bold text-foreground mb-3 flex items-center gap-2 text-sm sm:text-base">
          <MapPin className="w-4 h-4 text-primary" />
          Location
        </h3>
        <Card className="bg-background/50 border-border/50 p-3 text-center">
          <p className="text-sm text-foreground/70">
            {incident?.location || "Location not set"}
          </p>
          <p className="text-xs text-foreground/50 mt-1">
            {incident?.latitude && incident?.longitude
              ? `${incident.latitude}, ${incident.longitude}`
              : "GPS coordinates pending"}
          </p>
        </Card>
      </div>

      {/* Incident Status */}
      <div className="p-4">
        <h3 className="font-bold text-foreground mb-3 text-sm sm:text-base">
          Incident Status
        </h3>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground/70">Triage Level:</span>
            <span className={`text-xs font-bold px-2 py-1 rounded ${triageBadge}`}>
              {incident?.triageLevel || "PENDING"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground/70">Dispatch:</span>
            <span className="text-sm text-foreground/50">
              {incident?.dispatchSubmitted ? "✓ Submitted" : "Pending"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-card flex flex-col">
      {/* Header */}
      <div className="border-b border-border/50 backdrop-blur-sm sticky top-0 z-40 bg-background/80">
        <div className="container h-14 sm:h-16 flex items-center justify-between gap-2">
          {/* Left: back + title */}
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setLocation("/")}
              className="p-1.5 text-foreground/60 hover:text-foreground transition-colors shrink-0"
              aria-label="Back to home"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <AlertCircle className="w-5 h-5 text-primary animate-pulse shrink-0" />
            <div className="min-w-0">
              <h1 className="font-bold text-foreground text-sm sm:text-base truncate leading-tight">
                RAPTOR AI Emergency Chat
              </h1>
              <p className="text-xs text-foreground/60 leading-tight">
                Incident #{id}
              </p>
            </div>
          </div>

          {/* Right: sidebar toggle (visible on mobile/tablet) */}
          <button
            className="lg:hidden p-2 text-foreground/70 hover:text-foreground transition-colors shrink-0"
            onClick={() => setShowSidebar(true)}
            aria-label="Show emergency panel"
          >
            <PanelRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Chat Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 sm:space-y-4">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] sm:max-w-2xl rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3 text-sm sm:text-base ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-none"
                      : "bg-card border border-border/50 text-foreground rounded-bl-none"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <Streamdown>{msg.content}</Streamdown>
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-card border border-border/50 rounded-2xl rounded-bl-none px-4 py-3">
                  <div className="flex gap-1.5">
                    <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="border-t border-border/50 p-3 sm:p-4 bg-background/60 backdrop-blur">
            {isRecording && (
              <div className="mb-2 flex items-center gap-2 px-3 py-1.5 bg-primary/20 border border-primary/50 rounded-lg">
                <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                <span className="text-xs sm:text-sm text-primary font-medium">
                  Recording: {formatTime(recordingTime)}
                </span>
              </div>
            )}
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                placeholder={
                  isRecording
                    ? "Recording in progress..."
                    : "Describe your situation..."
                }
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !isRecording) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                disabled={isLoading || isRecording}
                className="flex-1 bg-input border-border/50 text-foreground placeholder:text-foreground/50 text-sm"
              />
              <Button
                size="icon"
                variant={isRecording ? "destructive" : "outline"}
                onClick={isRecording ? stopRecording : startRecording}
                className="shrink-0"
                title={isRecording ? "Stop recording" : "Voice input"}
              >
                {isRecording ? (
                  <Square className="w-4 h-4" />
                ) : (
                  <Mic className="w-4 h-4" />
                )}
              </Button>
              <Button
                size="icon"
                onClick={handleSendMessage}
                disabled={isLoading || !input.trim() || isRecording}
                className="bg-primary hover:bg-primary/90 text-primary-foreground shrink-0"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-foreground/40 mt-1.5">
              {isRecording
                ? "Recording… tap stop when done"
                : "Press Enter to send · mic for voice"}
            </p>
          </div>
        </div>

        {/* Desktop Sidebar */}
        <aside className="w-72 xl:w-80 border-l border-border/50 bg-card/30 overflow-y-auto hidden lg:block shrink-0">
          <EmergencySidebar />
        </aside>
      </div>

      {/* Mobile Sidebar Drawer */}
      {showSidebar && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 z-50 lg:hidden"
            onClick={() => setShowSidebar(false)}
          />
          {/* Panel */}
          <div className="fixed right-0 top-0 bottom-0 w-72 sm:w-80 bg-card border-l border-border/50 z-50 lg:hidden overflow-y-auto flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-border/50">
              <span className="font-bold text-foreground">Emergency Panel</span>
              <button
                onClick={() => setShowSidebar(false)}
                className="p-1 text-foreground/60 hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <EmergencySidebar className="flex-1" />
          </div>
        </>
      )}
    </div>
  );
}
