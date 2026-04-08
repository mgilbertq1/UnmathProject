// lib/sync.ts
import { useUserStore } from '@/lib/store/user-store';
import { useGameStore } from '@/lib/store/game-store';

// Fungsi untuk sinkronisasi data dari localStorage (Zustand) ke server backend mock
export async function syncGameData(): Promise<void> {
    try {
        const uStore = useUserStore.getState();
        const gStore = useGameStore.getState();

        const updates = {
            totalXP: uStore.totalXP,
            gems: uStore.gems,
            loginStreak: uStore.loginStreak,
            longestStreak: uStore.longestStreak,
            lastLoginDate: uStore.lastLoginDate,
            dailyTarget: uStore.dailyTarget,
            dailyHistory: uStore.dailyHistory,
            badges: uStore.badges,
            shopItems: uStore.shopItems,
            levels: gStore.levels,
        };

        const res = await fetch('/api/user/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates),
        });

        if (!res.ok) {
            console.error('Failed to sync data to server');
        }
    } catch (error) {
        console.error('Sync error:', error);
    }
}