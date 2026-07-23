import React, { useState, useMemo, useRef, useEffect } from "react";
import mammoth from "mammoth";
import { Lock, Check, Star, BookOpen, Sparkles, X, ChevronRight, Flag, Compass, FileWarning } from "lucide-react";

const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;600&display=swap');`;

const COLORS = {
  bg: "#111C33",
  panel: "#1B2A4A",
  panelLine: "rgba(255,255,255,0.07)",
  parchment: "#EFE8D6",
  parchmentLine: "#C9BE9E",
  brass: "#C9A96A",
  trail: "#5B8C6A",
  ember: "#C1652E",
  locked: "#3C4A6B",
  lockedText: "#8492B0",
};

function TopoBackground() {
  const rings = [];
  for (let i = 0; i < 14; i++) {
    rings.push(
      <ellipse
        key={i}
        cx={`${(i * 37) % 100}%`}
        cy={`${(i * 53) % 100}%`}
        rx={60 + (i % 5) * 30}
        ry={40 + (i % 4) * 22}
        fill="none"
        stroke="rgba(201,169,106,0.06)"
        strokeWidth="1"
      />
    );
  }
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none">
      {rings}
    </svg>
  );
}

async function callClaude(prompt) {
  const response = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    throw new Error(errBody.error || "Request to /api/claude failed.");
  }

  const data = await response.json();
  const text = (data.content || [])
    .map((b) => (b.type === "text" ? b.text : ""))
    .filter(Boolean)
    .join("\n");
  const cleaned = text.replace(/```json|```/g, "").trim();
  return JSON.parse(cleaned);
}

function buildPrompt(bookText) {
  return `You are an expert instructional designer building a study roadmap.

Analyze the text below and break it into 5 to 7 sequential study checkpoints ("topics"). If the text clearly assumes background knowledge it never explains, you may add ONE brief gap-fill topic (isGapFill: true) inserted before the topic that needs it.

Respond with ONLY raw JSON (no markdown fences, no commentary) in exactly this shape, keep every string SHORT to fit a tight token budget:
{
  "bookTitle": "short title",
  "topics": [
    {
      "id": "t1",
      "title": "short topic title",
      "summary": "one exciting sentence: what you'll learn",
      "keyTerms": ["term1","term2","term3"],
      "prerequisites": [],
      "isGapFill": false,
      "quiz": [
        {"question": "short question", "options": ["a","b","c","d"], "answerIndex": 0},
        {"question": "short question", "options": ["a","b","c","d"], "answerIndex": 0}
      ],
      "funFact": "one short rewarding fact revealed on completion"
    }
  ]
}
Order "topics" in correct study sequence. Each topic's "prerequisites" must only reference earlier ids. Keep quiz to exactly 2 questions per topic.

IMPORTANT: Write every generated string (bookTitle, title, summary, keyTerms, quiz questions, quiz options, funFact) in the SAME language as the TEXT TO ANALYZE below — if that text is in Amharic, respond entirely in Amharic; if it's in English, respond in English; match whatever language the source text uses.

TEXT TO ANALYZE:
"""
${bookText.slice(0, 9000)}
"""`;
}

export default function StudyTrail() {
  const [screen, setScreen] = useState("upload");
  const [bookText, setBookText] = useState("");
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [completed, setCompleted] = useState({});
  const [activeId, setActiveId] = useState(null);
  const [answers, setAnswers] = useState({});
  const [graded, setGraded] = useState(null);
  const fileRef = useRef(null);

  const STORAGE_KEY = "study-trail:v1";

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.data && parsed.data.topics) {
          setData(parsed.data);
          setCompleted(parsed.completed || {});
          setScreen("roadmap");
        }
      }
    } catch (e) {}
  }, []);

  useEffect(() => {
    if (!data) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ data, completed }));
    } catch (e) {}
  }, [data, completed]);

  function startNewBook() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
    setData(null);
    setCompleted({});
    setBookText("");
    setActiveId(null);
    setAnswers({});
    setGraded(null);
    setScreen("upload");
  }

  const topics = data?.topics || [];

  const isUnlocked = (topic) =>
    topic.prerequisites.every((p) => completed[p]) || topic.prerequisites.length === 0;

  async function handleAnalyze() {
    if (bookText.trim().length < 200) {
      setError("እባክዎ ትንሽ ተጨማሪ ጽሑፍ ይለጥፉ — ቢያንስ ጥቂት አንቀጾች — ለመተንተን እንዲበቃ።");
      return;
    }
    setError("");
    setScreen("loading");
    try {
      const result = await callClaude(buildPrompt(bookText));
      if (!result.topics || !result.topics.length) throw new Error("empty");
      setData(result);
      setScreen("roadmap");
    } catch (e) {
      setError("ትንተናው በትክክል አልተመለሰም። አጭር ጽሑፍ ይሞክሩ ወይም እንደገና ይሞክሩ።");
      setScreen("upload");
    }
  }

  const [dragActive, setDragActive] = useState(false);

  function processFile(file) {
    if (!file) return;
    const name = file.name.toLowerCase();

    if (name.endsWith(".txt")) {
      const reader = new FileReader();
      reader.onload = () => setBookText(String(reader.result || ""));
      reader.readAsText(file);
      return;
    }

    if (name.endsWith(".docx")) {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const result = await mammoth.extractRawText({ arrayBuffer: reader.result });
          setBookText(result.value || "");
          setError("");
        } catch (err) {
          setError("ይህ .docx ፋይል ማንበብ አልተቻለም። ጽሑፉን ገልብጠው ይለጥፉ።");
        }
      };
      reader.readAsArrayBuffer(file);
      return;
    }

    if (name.endsWith(".pdf")) {
      setError(
        "PDF ፋይሎችን በቀጥታ እዚህ ማንበብ አይቻልም። ፋይሉን በውይይቱ (chat) ውስጥ ይላኩልኝ፣ ጽሑፉን አውጥቼ እሰጥዎታለሁ፣ ከዚያ እዚህ ይለጥፉት። ወይም .txt / .docx ይሞክሩ።"
      );
      return;
    }

    setError("ይህ ፋይል ዓይነት አይደገፍም። .txt ወይም .docx ይጠቀሙ፣ ወይም PDF ከሆነ በውይይቱ ውስጥ ይላኩልኝ።");
  }

  function handleFile(e) {
    processFile(e.target.files?.[0]);
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragActive(false);
    processFile(e.dataTransfer.files?.[0]);
  }

  function openTopic(topic) {
    setActiveId(topic.id);
    setAnswers({});
    setGraded(null);
  }

  function submitQuiz(topic) {
    let score = 0;
    topic.quiz.forEach((q, i) => {
      if (answers[i] === q.answerIndex) score++;
    });
    const passed = score >= Math.ceil(topic.quiz.length / 2);
    setGraded({ score, total: topic.quiz.length, passed });
    if (passed) setCompleted((c) => ({ ...c, [topic.id]: true }));
  }

  const positions = useMemo(() => {
    return topics.map((t, i) => {
      const wave = Math.sin(i * 0.9) * 26;
      const x = 50 + wave;
      const y = 90 + i * 176;
      return { x, y };
    });
  }, [topics]);

  const pathD = useMemo(() => {
    if (positions.length < 2) return "";
    let d = `M ${positions[0].x} ${positions[0].y}`;
    for (let i = 1; i < positions.length; i++) {
      const prev = positions[i - 1];
      const cur = positions[i];
      const midY = (prev.y + cur.y) / 2;
      d += ` C ${prev.x} ${midY}, ${cur.x} ${midY}, ${cur.x} ${cur.y}`;
    }
    return d;
  }, [positions]);

  const completedCount = Object.keys(completed).length;
  const totalCount = topics.length;
  const activeTopic = topics.find((t) => t.id === activeId);

  return (
    <div
      className="w-full min-h-screen"
      style={{ background: COLORS.bg, fontFamily: "'Inter', sans-serif" }}
    >
      <style>{`
        ${FONT_IMPORT}
        .font-display { font-family: 'Fraunces', serif; }
        .font-mono { font-family: 'JetBrains Mono', monospace; }
        @keyframes pulseRing {
          0% { box-shadow: 0 0 0 0 rgba(193,101,46,0.55); }
          70% { box-shadow: 0 0 0 14px rgba(193,101,46,0); }
          100% { box-shadow: 0 0 0 0 rgba(193,101,46,0); }
        }
        .pulse-node { animation: pulseRing 2.2s infinite; }
        @keyframes riseIn {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .rise-in { animation: riseIn 0.35s ease-out; }
      `}</style>

      {screen === "upload" && (
        <div className="relative min-h-screen flex items-center justify-center px-6 py-16 overflow-hidden">
          <TopoBackground />
          <div className="relative z-10 max-w-xl w-full rise-in">
            <div className="flex items-center gap-2 mb-3" style={{ color: COLORS.brass }}>
              <Compass size={20} />
              <span className="font-mono text-xs tracking-widest uppercase">የጥናት መንገድ</span>
            </div>
            <h1 className="font-display text-4xl text-white mb-3" style={{ fontWeight: 600 }}>
              ማንኛውንም መጽሐፍ ወደ ጥናት መንገድ ቀይረው።
            </h1>
            <p className="text-sm mb-8" style={{ color: "#B7C0D6" }}>
              ምዕራፍ ይለጥፉ ወይም .txt ፋይል ይጫኑ። በቅደም ተከተል ወደ ማቆሚያዎች እንቀይረዋለን —
              ከጥያቄዎችና ከትንሽ ሽልማቶች ጋር።
            </p>

            <button
              onClick={() => fileRef.current?.click()}
              className="w-full py-3.5 rounded-lg font-medium flex items-center justify-center gap-2 mb-3 transition-opacity hover:opacity-90"
              style={{ background: COLORS.panel, color: "#E8EBF3", border: `1px solid ${COLORS.brass}` }}
            >
              <BookOpen size={16} color={COLORS.brass} />
              ከፋይሎችዎ ይምረጡ (.txt / .docx)
            </button>
            <input ref={fileRef} type="file" accept=".txt,.docx,.pdf" onChange={handleFile} className="hidden" />

            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1 h-px" style={{ background: COLORS.panelLine }} />
              <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "#5D6B8C" }}>ወይም</span>
              <div className="flex-1 h-px" style={{ background: COLORS.panelLine }} />
            </div>

            <div
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              className="rounded-lg transition-colors"
              style={{
                border: `1.5px dashed ${dragActive ? COLORS.brass : "transparent"}`,
                background: dragActive ? "rgba(201,169,106,0.06)" : "transparent",
              }}
            >
              <textarea
                value={bookText}
                onChange={(e) => setBookText(e.target.value)}
                placeholder="የምዕራፉን ጽሑፍ እዚህ ይለጥፉ…"
                className="w-full h-40 rounded-lg p-4 text-sm outline-none resize-none"
                style={{
                  background: COLORS.panel,
                  color: "#E8EBF3",
                  border: `1px solid ${COLORS.panelLine}`,
                }}
              />
            </div>

            <div className="flex items-center justify-end mt-3 mb-6">
              <span className="text-xs font-mono" style={{ color: "#5D6B8C" }}>
                {bookText.length.toLocaleString()} ፊደላት
              </span>
            </div>

            {error && (
              <p className="text-sm mb-4" style={{ color: "#E7A489" }}>
                {error}
              </p>
            )}

            <button
              onClick={handleAnalyze}
              className="w-full py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
              style={{ background: COLORS.ember, color: "#FFF6EE" }}
            >
              መንገዱን ሥራ <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {screen === "loading" && (
        <div className="relative min-h-screen flex items-center justify-center overflow-hidden">
          <TopoBackground />
          <div className="relative z-10 text-center">
            <div
              className="mx-auto mb-5 rounded-full flex items-center justify-center"
              style={{ width: 56, height: 56, background: COLORS.panel, border: `1px solid ${COLORS.brass}` }}
            >
              <Compass size={24} color={COLORS.brass} className="animate-spin" style={{ animationDuration: "3s" }} />
            </div>
            <p className="font-display text-xl text-white mb-1">ቦታውን በመቃኘት ላይ…</p>
            <p className="text-sm" style={{ color: "#8492B0" }}>ለጥናት የሚመች ቅደም ተከተል በመፈለግ ላይ።</p>
          </div>
        </div>
      )}

      {screen === "roadmap" && data && (
        <div className="relative min-h-screen overflow-hidden">
          <TopoBackground />
          <div
            className="sticky top-0 z-20 px-6 py-4 flex items-center justify-between"
            style={{ background: "rgba(17,28,51,0.9)", backdropFilter: "blur(6px)", borderBottom: `1px solid ${COLORS.panelLine}` }}
          >
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest" style={{ color: COLORS.brass }}>
                መንገድ
              </p>
              <h2 className="font-display text-lg text-white leading-tight">{data.bookTitle}</h2>
            </div>
            <div className="text-right flex items-center gap-3">
              <div>
                <p className="font-mono text-sm text-white">{completedCount}/{totalCount}</p>
                <p className="text-[10px]" style={{ color: "#8492B0" }}>ማቆሚያዎች</p>
              </div>
              <button
                onClick={startNewBook}
                className="text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded"
                style={{ color: COLORS.brass, border: `1px solid ${COLORS.panelLine}` }}
                title="Start a new book (clears saved progress)"
              >
                አዲስ
              </button>
            </div>
          </div>

          <div className="relative mx-auto" style={{ maxWidth: 480, height: positions.length ? positions[positions.length - 1].y + 160 : 400 }}>
            <svg className="absolute inset-0 w-full h-full" viewBox={`0 0 100 ${positions.length ? positions[positions.length - 1].y + 160 : 400}`} preserveAspectRatio="none">
              <path d={pathD} fill="none" stroke={COLORS.panelLine} strokeWidth="1.2" strokeDasharray="3 3" />
            </svg>

            {topics.map((topic, i) => {
              const pos = positions[i];
              const done = completed[topic.id];
              const unlocked = isUnlocked(topic);
              const stateColor = done ? COLORS.trail : unlocked ? COLORS.ember : COLORS.locked;
              return (
                <div
                  key={topic.id}
                  className="absolute flex flex-col items-center"
                  style={{ left: `${pos.x}%`, top: pos.y, transform: "translate(-50%,-50%)", width: 200 }}
                >
                  <button
                    onClick={() => unlocked && openTopic(topic)}
                    disabled={!unlocked}
                    className={`relative rounded-full flex items-center justify-center transition-transform ${unlocked ? "hover:scale-105 cursor-pointer" : "cursor-not-allowed"} ${unlocked && !done ? "pulse-node" : ""}`}
                    style={{
                      width: 56,
                      height: 56,
                      background: done ? COLORS.trail : unlocked ? COLORS.ember : COLORS.panel,
                      border: `2px solid ${stateColor}`,
                    }}
                  >
                    {done ? (
                      <Star size={22} color="#FFF6EE" fill="#FFF6EE" />
                    ) : unlocked ? (
                      <BookOpen size={20} color="#FFF6EE" />
                    ) : (
                      <Lock size={18} color={COLORS.lockedText} />
                    )}
                    {topic.isGapFill && (
                      <span
                        className="absolute -top-1 -right-1 rounded-full font-mono"
                        style={{ background: COLORS.brass, color: "#1B2A4A", fontSize: 9, padding: "1px 5px" }}
                      >
                        ዝግጅት
                      </span>
                    )}
                  </button>
                  <p
                    className="mt-2 text-center text-xs leading-tight"
                    style={{ color: unlocked ? "#E8EBF3" : "#5D6B8C", maxWidth: 150 }}
                  >
                    {topic.title}
                  </p>
                </div>
              );
            })}

            <div
              className="absolute flex flex-col items-center"
              style={{
                left: "50%",
                top: positions.length ? positions[positions.length - 1].y + 130 : 400,
                transform: "translate(-50%,-50%)",
              }}
            >
              <div
                className="rounded-full flex items-center justify-center"
                style={{ width: 44, height: 44, background: completedCount === totalCount && totalCount > 0 ? COLORS.brass : COLORS.panel, border: `2px solid ${COLORS.brass}` }}
              >
                <Flag size={18} color={completedCount === totalCount && totalCount > 0 ? "#1B2A4A" : COLORS.brass} />
              </div>
              <p className="mt-2 text-xs font-mono" style={{ color: COLORS.brass }}>
                {completedCount === totalCount && totalCount > 0 ? "መጽሐፉ ተጠናቋል" : "የመንገዱ መጨረሻ"}
              </p>
            </div>
          </div>
        </div>
      )}

      {activeTopic && (
        <div
          className="fixed inset-0 z-30 flex items-end sm:items-center justify-center p-0 sm:p-6"
          style={{ background: "rgba(10,15,28,0.65)" }}
          onClick={() => setActiveId(null)}
        >
          <div
            className="rise-in w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-6 max-h-[85vh] overflow-y-auto"
            style={{ background: COLORS.parchment, color: "#2A2416" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                {activeTopic.isGapFill && (
                  <p className="font-mono text-[10px] uppercase tracking-widest mb-1" style={{ color: "#8A6D3B" }}>
                    የዝግጅት መንገድ
                  </p>
                )}
                <h3 className="font-display text-2xl" style={{ fontWeight: 600 }}>{activeTopic.title}</h3>
              </div>
              <button onClick={() => setActiveId(null)} className="p-1 opacity-60 hover:opacity-100">
                <X size={20} />
              </button>
            </div>

            <p className="text-sm mb-4 leading-relaxed">{activeTopic.summary}</p>

            <div className="flex flex-wrap gap-2 mb-6">
              {activeTopic.keyTerms.map((term) => (
                <span
                  key={term}
                  className="font-mono text-[11px] px-2 py-1 rounded"
                  style={{ background: "rgba(0,0,0,0.06)", border: `1px solid ${COLORS.parchmentLine}` }}
                >
                  {term}
                </span>
              ))}
            </div>

            {!graded && (
              <div>
                <p className="font-mono text-xs uppercase tracking-widest mb-3" style={{ color: "#8A6D3B" }}>
                  የማቆሚያ ጥያቄ
                </p>
                {activeTopic.quiz.map((q, qi) => (
                  <div key={qi} className="mb-4">
                    <p className="text-sm font-medium mb-2">{qi + 1}. {q.question}</p>
                    <div className="space-y-1.5">
                      {q.options.map((opt, oi) => (
                        <button
                          key={oi}
                          onClick={() => setAnswers((a) => ({ ...a, [qi]: oi }))}
                          className="w-full text-left text-sm px-3 py-2 rounded-lg transition-colors"
                          style={{
                            background: answers[qi] === oi ? "#5B8C6A" : "rgba(0,0,0,0.05)",
                            color: answers[qi] === oi ? "#FFF6EE" : "#2A2416",
                          }}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                <button
                  onClick={() => submitQuiz(activeTopic)}
                  disabled={Object.keys(answers).length < activeTopic.quiz.length}
                  className="w-full py-3 rounded-lg font-medium mt-2 disabled:opacity-40"
                  style={{ background: "#C1652E", color: "#FFF6EE" }}
                >
                  መልሶችን አረጋግጥ
                </button>
              </div>
            )}

            {graded && (
              <div className="text-center py-2">
                {graded.passed ? (
                  <>
                    <Sparkles size={28} className="mx-auto mb-2" color="#8A6D3B" />
                    <p className="font-display text-xl mb-1">ማቆሚያው ተጠናቋል</p>
                    <p className="text-sm mb-4" style={{ color: "#6B5D3E" }}>
                      {graded.score}/{graded.total} ትክክል
                    </p>
                    <div className="rounded-lg p-3 mb-4 text-sm" style={{ background: "rgba(0,0,0,0.05)" }}>
                      <p className="font-mono text-[10px] uppercase tracking-widest mb-1" style={{ color: "#8A6D3B" }}>
                        ሽልማት
                      </p>
                      {activeTopic.funFact}
                    </div>
                    <button
                      onClick={() => setActiveId(null)}
                      className="w-full py-3 rounded-lg font-medium"
                      style={{ background: "#5B8C6A", color: "#FFF6EE" }}
                    >
                      መንገዱን ቀጥል
                    </button>
                  </>
                ) : (
                  <>
                    <p className="font-display text-xl mb-1">ገና አልደረሰም</p>
                    <p className="text-sm mb-4" style={{ color: "#6B5D3E" }}>
                      {graded.score}/{graded.total} ትክክል — ከላይ ያለውን ማጠቃለያ እንደገና ያንብቡ እና እንደገና ይሞክሩ።
                    </p>
                    <button
                      onClick={() => { setGraded(null); setAnswers({}); }}
                      className="w-full py-3 rounded-lg font-medium"
                      style={{ background: "#C1652E", color: "#FFF6EE" }}
                    >
                      ማቆሚያውን እንደገና ሞክር
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
