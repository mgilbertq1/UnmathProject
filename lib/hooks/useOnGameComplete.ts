// lib/hooks/useOnGameComplete.ts
import { useCallback } from 'react';
import { useGameStore } from '@/lib/store/game-store';
import { useUserStore } from '@/lib/store/user-store';

/**
 * Panggil hook ini di GameEngine ketika sesi permainan selesai.
 *
 * @example
 * const onComplete = useOnGameComplete();
 * // Ketika game selesai:
 * onComplete({ subject: 'math', levelId: 3, xp: 80 });
 */
export function useOnGameComplete() {
    const completeLevel = useGameStore((s) => s.completeLevel);
    const checkAndUpdateStreak = useUserStore((s) => s.checkAndUpdateStreak);

    return useCallback(
        ({ subject, levelId, xp }: { subject: 'math' | 'pkn'; levelId: number; xp: number }) => {
            completeLevel(subject, levelId, xp);
            checkAndUpdateStreak();
        },
        [completeLevel, checkAndUpdateStreak]
    );
}