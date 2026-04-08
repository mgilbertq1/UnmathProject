// lib/store/game-store.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Question, Subject, AnswerRecord, LevelStatus } from '@/lib/types';
import { TOTAL_LEVELS } from '@/lib/levels/level-definitions';

// ── Level Progress ────────────────────────────────────────────────
export type LevelProgress = {
    id: number;
    status: LevelStatus;
    bestStars: number;      // 0–3  (matches types.ts → LevelState.bestStars)
    bestXP: number;         // raw XP earned at best run
};

// ── Game Session State ────────────────────────────────────────────
type GameState = {
    // ── Level map (persisted) ─────────────────────────────────────
    levels: {
        math: LevelProgress[];
        pkn: LevelProgress[];
    };

    // ── Active game session (NOT persisted) ──────────────────────
    subject: Subject | null;
    questions: Question[];
    currentIndex: number;
    answers: AnswerRecord[];
    xp: number;
    xpMultiplier: number;
    lives: number;
    maxLives: number;
    streak: number;
    bestStreak: number;
    isGameOver: boolean;
    isGameComplete: boolean;

    // ── Actions ──────────────────────────────────────────────────
    startGame: (subject: Subject, levelId: number, questions: Question[]) => void;
    answerQuestion: (given: string | string[]) => boolean;
    nextQuestion: () => void;
    skipQuestion: () => void;
    unlockNextLevel: (subject: Subject, levelId: number, stars: number) => void;
    resetAllProgress: () => void;
    refillLives: () => void;
    activateDoubleXP: () => void;
};

// ── Helpers ───────────────────────────────────────────────────────
const makeLevel = (id: number): LevelProgress => ({
    id,
    status: id === 1 ? 'available' : 'locked',
    bestStars: 0,
    bestXP: 0,
});

const makeDefaultLevels = () =>
    Array.from({ length: TOTAL_LEVELS }, (_, i) => makeLevel(i + 1));

const isCorrectAnswer = (given: string | string[], correct: string | string[]): boolean => {
    if (Array.isArray(correct)) {
        if (!Array.isArray(given)) return false;
        return (
            given.length === correct.length &&
            given.every((g, i) => g.trim().toLowerCase() === correct[i].trim().toLowerCase())
        );
    }
    const g = Array.isArray(given) ? given[0] : given;
    return g.trim().toLowerCase() === correct.trim().toLowerCase();
};

/**
 * Compute stars from an array of answer records and total questions.
 * Exported so GameEngine and ResultScreen can call it.
 */
export const computeStars = (answers: AnswerRecord[], totalQuestions: number): number => {
    if (totalQuestions <= 0) return 0;
    const correct = answers.filter((a) => a.isCorrect).length;
    const pct = correct / totalQuestions;
    if (pct >= 0.9) return 3;
    if (pct >= 0.6) return 2;
    if (pct >= 0.3) return 1;
    return 0;
};

// ── Store ─────────────────────────────────────────────────────────
export const useGameStore = create<GameState>()(
    persist(
        (set, get) => ({
            // Persisted level map
            levels: {
                math: makeDefaultLevels(),
                pkn: makeDefaultLevels(),
            },

            // Session state (reset on startGame)
            subject: null,
            questions: [],
            currentIndex: 0,
            answers: [],
            xp: 0,
            xpMultiplier: 1,
            lives: 5,
            maxLives: 5,
            streak: 0,
            bestStreak: 0,
            isGameOver: false,
            isGameComplete: false,

            // ── startGame ─────────────────────────────────────────
            startGame: (subject, _levelId, questions) => {
                set({
                    subject,
                    questions,
                    currentIndex: 0,
                    answers: [],
                    xp: 0,
                    xpMultiplier: 1,
                    lives: 5,
                    maxLives: 5,
                    streak: 0,
                    bestStreak: 0,
                    isGameOver: false,
                    isGameComplete: false,
                });
            },

            // ── answerQuestion ────────────────────────────────────
            answerQuestion: (given) => {
                const { questions, currentIndex, answers, xp, lives, streak, bestStreak, xpMultiplier } = get();
                const q = questions[currentIndex];
                if (!q) return false;

                const correct = isCorrectAnswer(given, q.answer);
                const newStreak = correct ? streak + 1 : 0;
                const newBest = Math.max(bestStreak, newStreak);
                const newLives = correct ? lives : lives - 1;
                const earnedXP = correct ? (q.points * xpMultiplier) : 0;

                const record: AnswerRecord = {
                    questionId: q.id,
                    question: q.question,
                    given: Array.isArray(given) ? given : given,
                    correct: q.answer,
                    isCorrect: correct,
                    explanation: q.explanation,
                    points: earnedXP,
                };

                set({
                    answers: [...answers, record],
                    xp: xp + earnedXP,
                    lives: newLives,
                    streak: newStreak,
                    bestStreak: newBest,
                    isGameOver: newLives <= 0,
                });

                return correct;
            },

            // ── nextQuestion ──────────────────────────────────────
            nextQuestion: () => {
                const { currentIndex, questions, isGameOver } = get();
                if (isGameOver) return;
                const next = currentIndex + 1;
                if (next >= questions.length) {
                    set({ isGameComplete: true });
                } else {
                    set({ currentIndex: next });
                }
            },

            // ── skipQuestion ──────────────────────────────────────
            skipQuestion: () => {
                const { currentIndex, questions, answers, isGameOver } = get();
                if (isGameOver) return;

                const q = questions[currentIndex];
                if (q) {
                    // Record as wrong
                    const record: AnswerRecord = {
                        questionId: q.id,
                        question: q.question,
                        given: '',
                        correct: q.answer,
                        isCorrect: false,
                        explanation: q.explanation,
                        points: 0,
                    };
                    set((s) => ({
                        answers: [...answers, record],
                        streak: 0,
                    }));
                }

                const next = currentIndex + 1;
                if (next >= questions.length) {
                    set({ isGameComplete: true });
                } else {
                    set({ currentIndex: next });
                }
            },

            // ── unlockNextLevel ───────────────────────────────────
            unlockNextLevel: (subject, levelId, stars) => {
                set((s) => {
                    const subjectLevels = [...s.levels[subject]];
                    const idx = subjectLevels.findIndex((l) => l.id === levelId);
                    if (idx < 0) return s;

                    const prev = subjectLevels[idx];
                    const currentXP = s.xp;
                    const newBestStars = Math.max(prev.bestStars, stars);

                    // Update current level
                    subjectLevels[idx] = {
                        ...prev,
                        status: 'completed',
                        bestStars: newBestStars,
                        bestXP: Math.max(prev.bestXP, currentXP),
                    };

                    // Unlock next level ONLY if they got 3 stars on this level
                    if (newBestStars >= 3 && idx + 1 < subjectLevels.length && subjectLevels[idx + 1].status === 'locked') {
                        subjectLevels[idx + 1] = { ...subjectLevels[idx + 1], status: 'available' };
                    }

                    return { levels: { ...s.levels, [subject]: subjectLevels } };
                });
            },

            // ── refillLives & activateDoubleXP ────────────────────
            refillLives: () => {
                const { maxLives, isGameOver } = get();
                set({ lives: maxLives, isGameOver: false });
            },

            activateDoubleXP: () => {
                set({ xpMultiplier: 2 });
            },

            // ── resetAllProgress ──────────────────────────────────
            resetAllProgress: () => {
                set({
                    levels: {
                        math: makeDefaultLevels(),
                        pkn: makeDefaultLevels(),
                    },
                    subject: null,
                    questions: [],
                    currentIndex: 0,
                    answers: [],
                    xp: 0,
                    xpMultiplier: 1,
                    lives: 5,
                    maxLives: 5,
                    streak: 0,
                    bestStreak: 0,
                    isGameOver: false,
                    isGameComplete: false,
                });
            },
        }),
        {
            name: 'game-store-v1',
            storage: createJSONStorage(() => localStorage),
            // Only persist the level map — session state resets on startGame anyway
            partialize: (s) => ({ levels: s.levels }),
        }
    )
);