import { useState, useEffect, useRef } from "react";

const SYSTEM_PROMPT = `You are an expert aviation examiner for EASA Flight Dispatcher certification. 
You generate adaptive quiz questions on Navigation, Meteorology, and Flight Dispatcher concepts under EASA framework.

When asked to generate a question, respond ONLY with a valid JSON object (no markdown, no extra text) in this exact format:
{
  "question": "The question text",
  "options": ["A. option1", "B. option2", "C. option3", "D. option4"],
  "correct": "A",
  "explanation": "Brief explanation of the correct answer with EASA/ICAO reference if applicable",
  "topic": "Navigation|Meteorology|Flight Dispatch",
  "difficulty": 1-10
}

Difficulty levels:
1-2: Basic definitions and concepts
3-4: Intermediate procedural knowledge  
5-6: Applied knowledge and calculations
7-8: Complex scenarios and regulations
9-10: Expert-level edge cases and integrations

Topics to cover across levels:
- Navigation: VOR/NDB/ILS, RNAV, waypoints, airways, fuel planning, ETOPS, PBN
- Meteorology: METAR/TAF, SIGMET, wind shear, icing, turbulence, CB clouds, QNH/QFE
- Flight Dispatch: OFP, fuel policy, EASA Part-ORO, MEL, flight release, alternate planning`;

const DIFFICULTY_COLORS = [
  "", "#22c55e","#22c55e","#84cc16","#84cc16","#eab308",
  "#eab308","#f97316","#f97316","#ef4444","#ef4444"
];

const LEVEL_NAMES = [
  "","Novice","Apprentice","Junior Dispatcher","Dispatcher","Senior Dispatcher",
  "Lead Dispatcher","Flight Operations Specialist","Senior FO Specialist","Expert Dispatcher","Master Dispatcher"
];

export default function AdaptiveQuizApp() {
  const [phase, setPhase] = useState("intro"); // intro | loading | question | feedback | result
  const [userName, setUserName] = useState("");
  const [currentLevel, setCurrentLevel] = useState(1);
  const [questionNum, setQuestionNum] = useState(0);
  const [question, setQuestion] = useState(null);
  const [selected, setSelected] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [score, setScore] = useState(0);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState("");
  const [loadingMsg, setLoadingMsg] = useState("Generating question...");
  const [streak, setStreak] = useState(0);
  const [finalLevel, setFinalLevel] = useState(1);
  const inputRef = useRef(null);

  const totalQuestions = 10;

  async function fetchQuestion(level) {
    setPhase("loading");
    setError("");
    setLoadingMsg("AI is crafting your next question...");
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.REACT_APP_ANTHROPIC_API_KEY || "",
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true"
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: SYSTEM_PROMPT,
          messages: [{
            role: "user",
            content: `Generate a unique aviation question for difficulty level ${level} out of 10. 
            Question number ${questionNum + 1} of ${totalQuestions}. 
            Previously asked topics: ${history.map(h=>h.topic).join(", ") || "none"}.
            Make it different from previous questions. Respond ONLY with the JSON object.`
          }]
        })
      });
      const data = await res.json();
      const text = data.content?.[0]?.text || "";
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      setQuestion(parsed);
      setSelected(null);
      setFeedback(null);
      setPhase("question");
    } catch (e) {
      setError("Failed to load question. Please try again.");
      setPhase("question");
    }
  }

  async function evaluateAnswer(option) {
    setSelected(option);
    setPhase("loading");
    setLoadingMsg("Evaluating your answer...");
    
    const letter = option.split(".")[0].trim();
    const isCorrect = letter === question.correct;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.REACT_APP_ANTHROPIC_API_KEY || "",
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true"
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 300,
          system: "You are an aviation training expert. Provide brief, encouraging feedback on quiz answers. Keep it to 2-3 sentences max.",
          messages: [{
            role: "user",
            content: `Question: "${question.question}"
Correct answer: ${question.correct}. ${question.options.find(o=>o.startsWith(question.correct))}
User chose: ${option}
Result: ${isCorrect ? "CORRECT" : "INCORRECT"}

Provide brief feedback explaining why the answer is ${isCorrect ? "correct" : "incorrect"} and reinforce the key learning point. ${question.explanation}`
          }]
        })
      });
      const data = await res.json();
      const fb = data.content?.[0]?.text || question.explanation;
      
      const newStreak = isCorrect ? streak + 1 : 0;
      setStreak(newStreak);
      
      const newScore = isCorrect ? score + 1 : score;
      setScore(newScore);
      
      // Adaptive level adjustment
      let nextLevel = currentLevel;
      if (isCorrect && currentLevel < 10) {
        nextLevel = Math.min(10, currentLevel + 1);
      } else if (!isCorrect && currentLevel > 1) {
        nextLevel = Math.max(1, currentLevel - 1);
      }

      const entry = { 
        q: questionNum + 1, 
        correct: isCorrect, 
        level: currentLevel, 
        topic: question.topic,
        question: question.question,
        chosen: option,
        answer: question.options.find(o=>o.startsWith(question.correct))
      };
      setHistory(prev => [...prev, entry]);
      setFeedback({ isCorrect, text: fb, nextLevel });
      setCurrentLevel(nextLevel);
      setPhase("feedback");
    } catch {
      const isCorrect = option.split(".")[0].trim() === question.correct;
      setFeedback({ isCorrect, text: question.explanation, nextLevel: currentLevel });
      setPhase("feedback");
    }
  }

  function nextQuestion() {
    const nextNum = questionNum + 1;
    if (nextNum >= totalQuestions) {
      // Calculate final level based on performance
      const correct = history.filter(h=>h.correct).length + (feedback?.isCorrect ? 1 : 0);
      const perf = correct / totalQuestions;
      const fl = Math.max(1, Math.min(10, Math.round(perf * 10)));
      setFinalLevel(fl);
      setPhase("result");
    } else {
      setQuestionNum(nextNum);
      fetchQuestion(currentLevel);
    }
  }

  function startQuiz() {
    if (!userName.trim()) return;
    setQuestionNum(0);
    setCurrentLevel(1);
    setScore(0);
    setHistory([]);
    setStreak(0);
    fetchQuestion(1);
  }

  function restart() {
    setPhase("intro");
    setUserName("");
    setCurrentLevel(1);
    setQuestionNum(0);
    setQuestion(null);
    setSelected(null);
    setFeedback(null);
    setScore(0);
    setHistory([]);
    setStreak(0);
  }

  const progressPct = (questionNum / totalQuestions) * 100;

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0a0f1e 0%, #0d1b3e 40%, #071428 100%)",
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      color: "#e2e8f0",
      padding: "0",
      position: "relative",
      overflow: "hidden"
    }}>
      {/* Background decoration */}
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse at 20% 50%, rgba(59,130,246,0.08) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(99,102,241,0.06) 0%, transparent 50%)",
        zIndex: 0
      }}/>

      <div style={{ position: "relative", zIndex: 1, maxWidth: 760, margin: "0 auto", padding: "20px 16px" }}>
        
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ 
            display: "inline-flex", alignItems: "center", gap: 10, 
            background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.3)",
            borderRadius: 24, padding: "6px 18px", marginBottom: 16
          }}>
            <span style={{ fontSize: 18 }}>✈️</span>
            <span style={{ fontSize: 13, color: "#93c5fd", letterSpacing: 2, fontWeight: 600, textTransform: "uppercase" }}>EASA Flight Dispatcher</span>
          </div>
          <h1 style={{ margin: 0, fontSize: "clamp(24px, 5vw, 36px)", fontWeight: 800, 
            background: "linear-gradient(135deg, #60a5fa, #a78bfa, #34d399)", 
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            Adaptive Quiz System
          </h1>
          <p style={{ margin: "8px 0 0", color: "#64748b", fontSize: 14 }}>
            AI-powered • Navigation • Meteorology • Flight Dispatch
          </p>
        </div>

        {/* INTRO */}
        {phase === "intro" && (
          <div style={{
            background: "rgba(15,23,42,0.8)", border: "1px solid rgba(59,130,246,0.2)",
            borderRadius: 20, padding: "36px 32px", textAlign: "center",
            backdropFilter: "blur(12px)"
          }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>🛫</div>
            <h2 style={{ margin: "0 0 8px", fontSize: 24, color: "#f1f5f9" }}>Ready for Takeoff?</h2>
            <p style={{ color: "#94a3b8", marginBottom: 28, lineHeight: 1.6 }}>
              This adaptive quiz will assess your Flight Dispatcher knowledge across <strong style={{color:"#60a5fa"}}>10 progressive levels</strong>. 
              Questions adapt to your performance in real time using AI.
            </p>
            
            <div style={{ display: "flex", gap: 12, justifyContent: "center", marginBottom: 28, flexWrap: "wrap" }}>
              {["📡 Navigation","🌩️ Meteorology","📋 Flight Dispatch"].map(t => (
                <span key={t} style={{ 
                  background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)",
                  borderRadius: 20, padding: "6px 14px", fontSize: 13, color: "#93c5fd"
                }}>{t}</span>
              ))}
            </div>

            <input
              ref={inputRef}
              value={userName}
              onChange={e => setUserName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && startQuiz()}
              placeholder="Enter your full name"
              style={{
                width: "100%", maxWidth: 360, padding: "14px 20px",
                background: "rgba(30,41,59,0.8)", border: "1px solid rgba(99,102,241,0.4)",
                borderRadius: 12, color: "#f1f5f9", fontSize: 16, outline: "none",
                boxSizing: "border-box", marginBottom: 16,
                transition: "border-color 0.2s"
              }}
            />
            <br/>
            <button
              onClick={startQuiz}
              disabled={!userName.trim()}
              style={{
                background: userName.trim() ? "linear-gradient(135deg, #3b82f6, #6366f1)" : "rgba(30,41,59,0.5)",
                border: "none", borderRadius: 12, padding: "14px 36px",
                color: "#fff", fontSize: 16, fontWeight: 700, cursor: userName.trim() ? "pointer" : "default",
                transition: "all 0.2s", letterSpacing: 0.5
              }}
            >
              Begin Assessment →
            </button>
          </div>
        )}

        {/* LOADING */}
        {phase === "loading" && (
          <div style={{
            background: "rgba(15,23,42,0.8)", border: "1px solid rgba(59,130,246,0.2)",
            borderRadius: 20, padding: "60px 32px", textAlign: "center",
            backdropFilter: "blur(12px)"
          }}>
            <div style={{ fontSize: 48, marginBottom: 16, animation: "spin 2s linear infinite", display: "inline-block" }}>⚙️</div>
            <p style={{ color: "#93c5fd", fontSize: 16 }}>{loadingMsg}</p>
            <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
          </div>
        )}

        {/* QUESTION */}
        {(phase === "question" || phase === "feedback") && question && (
          <div>
            {/* Stats bar */}
            <div style={{ 
              display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center"
            }}>
              <div style={{ 
                background: "rgba(15,23,42,0.7)", border: "1px solid rgba(59,130,246,0.2)",
                borderRadius: 10, padding: "8px 14px", fontSize: 13, color: "#93c5fd", flex: 1, minWidth: 120
              }}>
                👤 {userName}
              </div>
              <div style={{ 
                background: "rgba(15,23,42,0.7)", border: `1px solid ${DIFFICULTY_COLORS[currentLevel]}40`,
                borderRadius: 10, padding: "8px 14px", fontSize: 13, color: DIFFICULTY_COLORS[currentLevel], flex: 1, minWidth: 120
              }}>
                🎯 Level {currentLevel}/10
              </div>
              <div style={{ 
                background: "rgba(15,23,42,0.7)", border: "1px solid rgba(34,197,94,0.2)",
                borderRadius: 10, padding: "8px 14px", fontSize: 13, color: "#4ade80", flex: 1, minWidth: 120
              }}>
                ✅ {score}/{questionNum} Correct
              </div>
              {streak >= 2 && (
                <div style={{ 
                  background: "rgba(234,179,8,0.15)", border: "1px solid rgba(234,179,8,0.4)",
                  borderRadius: 10, padding: "8px 14px", fontSize: 13, color: "#fbbf24"
                }}>
                  🔥 {streak} Streak!
                </div>
              )}
            </div>

            {/* Progress bar */}
            <div style={{ 
              background: "rgba(30,41,59,0.5)", borderRadius: 8, height: 6, marginBottom: 20, overflow: "hidden"
            }}>
              <div style={{ 
                width: `${progressPct}%`, height: "100%",
                background: "linear-gradient(90deg, #3b82f6, #6366f1)",
                borderRadius: 8, transition: "width 0.5s ease"
              }}/>
            </div>

            {/* Question card */}
            <div style={{
              background: "rgba(15,23,42,0.85)", border: "1px solid rgba(59,130,246,0.2)",
              borderRadius: 20, padding: "28px", backdropFilter: "blur(12px)", marginBottom: 16
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <span style={{ 
                  background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.4)",
                  borderRadius: 8, padding: "4px 12px", fontSize: 12, color: "#a78bfa"
                }}>
                  Q{questionNum + 1} of {totalQuestions}
                </span>
                <span style={{ 
                  background: `${DIFFICULTY_COLORS[question.difficulty]}20`, 
                  border: `1px solid ${DIFFICULTY_COLORS[question.difficulty]}40`,
                  borderRadius: 8, padding: "4px 12px", fontSize: 12, 
                  color: DIFFICULTY_COLORS[question.difficulty]
                }}>
                  {question.topic} • Difficulty {question.difficulty}/10
                </span>
              </div>
              <p style={{ fontSize: "clamp(15px,2.5vw,18px)", lineHeight: 1.65, margin: 0, color: "#f1f5f9", fontWeight: 500 }}>
                {question.question}
              </p>
            </div>

            {/* Options */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
              {question.options.map(opt => {
                const letter = opt.split(".")[0].trim();
                const isSelected = selected === opt;
                const isCorrectOpt = letter === question.correct;
                const showResult = phase === "feedback";
                
                let bg = "rgba(15,23,42,0.7)";
                let border = "rgba(59,130,246,0.2)";
                let color = "#e2e8f0";
                
                if (showResult && isCorrectOpt) { bg = "rgba(34,197,94,0.15)"; border = "rgba(34,197,94,0.5)"; color = "#4ade80"; }
                else if (showResult && isSelected && !isCorrectOpt) { bg = "rgba(239,68,68,0.15)"; border = "rgba(239,68,68,0.5)"; color = "#f87171"; }
                else if (!showResult && isSelected) { bg = "rgba(99,102,241,0.2)"; border = "rgba(99,102,241,0.6)"; color = "#a78bfa"; }

                return (
                  <button
                    key={opt}
                    onClick={() => phase === "question" && evaluateAnswer(opt)}
                    disabled={phase !== "question"}
                    style={{
                      background: bg, border: `1px solid ${border}`,
                      borderRadius: 12, padding: "14px 18px",
                      color, textAlign: "left", cursor: phase === "question" ? "pointer" : "default",
                      fontSize: 15, transition: "all 0.2s", fontWeight: isSelected ? 600 : 400,
                      display: "flex", alignItems: "center", gap: 12
                    }}
                  >
                    <span style={{ 
                      minWidth: 28, height: 28, borderRadius: "50%",
                      background: showResult && isCorrectOpt ? "rgba(34,197,94,0.3)" : "rgba(99,102,241,0.2)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 13, fontWeight: 700, color: showResult && isCorrectOpt ? "#4ade80" : "#a78bfa"
                    }}>
                      {showResult && isCorrectOpt ? "✓" : showResult && isSelected && !isCorrectOpt ? "✗" : letter}
                    </span>
                    {opt.substring(opt.indexOf(".")+2)}
                  </button>
                );
              })}
            </div>

            {/* Feedback */}
            {phase === "feedback" && feedback && (
              <div style={{
                background: feedback.isCorrect ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
                border: `1px solid ${feedback.isCorrect ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
                borderRadius: 16, padding: "20px 24px", marginBottom: 16
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <span style={{ fontSize: 24 }}>{feedback.isCorrect ? "✅" : "❌"}</span>
                  <strong style={{ color: feedback.isCorrect ? "#4ade80" : "#f87171", fontSize: 16 }}>
                    {feedback.isCorrect ? "Correct!" : "Incorrect"}
                  </strong>
                  <span style={{ marginLeft: "auto", fontSize: 13, color: "#94a3b8" }}>
                    Next Level: {feedback.nextLevel}/10
                  </span>
                </div>
                <p style={{ margin: 0, color: "#cbd5e1", lineHeight: 1.6, fontSize: 14 }}>{feedback.text}</p>
              </div>
            )}

            {phase === "feedback" && (
              <button
                onClick={nextQuestion}
                style={{
                  width: "100%", background: "linear-gradient(135deg, #3b82f6, #6366f1)",
                  border: "none", borderRadius: 12, padding: "16px",
                  color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer"
                }}
              >
                {questionNum + 1 >= totalQuestions ? "View Results →" : "Next Question →"}
              </button>
            )}

            {error && <p style={{ color: "#f87171", textAlign: "center", fontSize: 14 }}>{error}</p>}
          </div>
        )}

        {/* RESULT */}
        {phase === "result" && (
          <div style={{
            background: "rgba(15,23,42,0.85)", border: "1px solid rgba(59,130,246,0.2)",
            borderRadius: 20, padding: "36px 28px", backdropFilter: "blur(12px)"
          }}>
            <div style={{ textAlign: "center", marginBottom: 28 }}>
              <div style={{ fontSize: 64, marginBottom: 12 }}>
                {score >= 8 ? "🏆" : score >= 6 ? "🥈" : score >= 4 ? "🥉" : "📚"}
              </div>
              <h2 style={{ margin: "0 0 4px", fontSize: 28, color: "#f1f5f9" }}>Assessment Complete!</h2>
              <p style={{ color: "#94a3b8", margin: 0 }}>Well done, {userName}!</p>
            </div>

            {/* Final level badge */}
            <div style={{ 
              textAlign: "center", marginBottom: 24,
              background: `${DIFFICULTY_COLORS[finalLevel]}15`,
              border: `2px solid ${DIFFICULTY_COLORS[finalLevel]}50`,
              borderRadius: 16, padding: "20px"
            }}>
              <p style={{ margin: "0 0 4px", color: "#94a3b8", fontSize: 14, textTransform: "uppercase", letterSpacing: 1 }}>Final Level Achieved</p>
              <div style={{ fontSize: 48, fontWeight: 900, color: DIFFICULTY_COLORS[finalLevel] }}>
                Level {finalLevel}
              </div>
              <p style={{ margin: "4px 0 0", color: DIFFICULTY_COLORS[finalLevel], fontSize: 18, fontWeight: 600 }}>
                {LEVEL_NAMES[finalLevel]}
              </p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 24 }}>
              {[
                { label: "Score", value: `${score}/${totalQuestions}`, icon: "🎯" },
                { label: "Accuracy", value: `${Math.round((score/totalQuestions)*100)}%`, icon: "📊" },
                { label: "Peak Level", value: `${Math.max(...history.map(h=>h.level))}`, icon: "⬆️" }
              ].map(s => (
                <div key={s.label} style={{ 
                  background: "rgba(30,41,59,0.6)", borderRadius: 12, padding: "14px", textAlign: "center"
                }}>
                  <div style={{ fontSize: 24 }}>{s.icon}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: "#f1f5f9" }}>{s.value}</div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Question review */}
            <h3 style={{ color: "#93c5fd", fontSize: 15, marginBottom: 12, fontWeight: 600 }}>Question Review</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24, maxHeight: 280, overflowY: "auto" }}>
              {history.map((h, i) => (
                <div key={i} style={{ 
                  display: "flex", alignItems: "center", gap: 10,
                  background: "rgba(30,41,59,0.4)", borderRadius: 10, padding: "10px 14px",
                  border: `1px solid ${h.correct ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}`
                }}>
                  <span style={{ fontSize: 16 }}>{h.correct ? "✅" : "❌"}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: "#e2e8f0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      Q{h.q}: {h.question}
                    </div>
                    {!h.correct && (
                      <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                        Correct: {h.answer}
                      </div>
                    )}
                  </div>
                  <span style={{ fontSize: 11, color: "#64748b", whiteSpace: "nowrap" }}>Lvl {h.level}</span>
                </div>
              ))}
            </div>

            <button
              onClick={restart}
              style={{
                width: "100%", background: "linear-gradient(135deg, #3b82f6, #6366f1)",
                border: "none", borderRadius: 12, padding: "16px",
                color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer"
              }}
            >
              🔄 Retake Assessment
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
