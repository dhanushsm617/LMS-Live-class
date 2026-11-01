/**
 * Auto-grading. A question is worth its full points only when the selected option set
 * exactly matches the correct option set (no partial credit – keeps "select all that apply" honest).
 */
export function gradeAttempt(quiz, submitted) {
  const byQuestion = new Map(submitted.map((a) => [String(a.question), a.selected]));
  let score = 0;
  let maxScore = 0;
  const results = [];
  const detail = [];

  for (const q of quiz.questions) {
    maxScore += q.points;
    const selected = [...new Set(byQuestion.get(String(q._id)) || [])].sort((a, b) => a - b);
    const correctIdx = q.options.flatMap((o, i) => (o.isCorrect ? [i] : []));
    const correct = selected.length === correctIdx.length && selected.every((v, i) => v === correctIdx[i]);
    const earned = correct ? q.points : 0;
    score += earned;
    results.push({ question: q._id, correct, earned });
    detail.push({ question: q._id, correct, earned, correctOptions: correctIdx, explanation: q.explanation });
  }

  const percent = maxScore ? Math.round((score / maxScore) * 1000) / 10 : 0;
  return { score, maxScore, percent, passed: percent >= quiz.passPercent, results, detail };
}

/** Strip answers before sending a quiz to a student. */
export function sanitizeQuiz(quiz) {
  const obj = quiz.toObject ? quiz.toObject() : quiz;
  return {
    ...obj,
    questions: obj.questions.map((q) => ({
      _id: q._id,
      prompt: q.prompt,
      type: q.type,
      points: q.points,
      options: q.options.map((o) => ({ text: o.text })),
    })),
  };
}
