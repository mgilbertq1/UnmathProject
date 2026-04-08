// lib/store/user-store.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { BadgeId, ShopItemId } from '@/lib/types';

// ── Types ────────────────────────────────────────────────────────
export type Badge = {
    id: BadgeId;
    name: string;
    description: string;
    emoji: string;
    earned: boolean;
};

export type ShopItem = {
    id: ShopItemId;
    name: string;
    description: string;
    emoji: string;
    price: number;
    owned: number;
    maxStack: number;
};

export type DailyRecord = {
    date: string;           // 'YYYY-MM-DD'
    xp: number;
    levelsPlayed: number;
};

// ── State & Actions ──────────────────────────────────────────────
type UserState = {
    // Profile
    username: string;
    avatar: string;

    // Progress
    totalXP: number;
    gems: number;
    loginStreak: number;
    longestStreak: number;
    lastLoginDate: string;

    // Daily
    dailyXP: number;
    dailyTarget: number;
    dailyHistory: DailyRecord[];

    // Collections
    badges: Badge[];
    shopItems: ShopItem[];

    // Settings
    soundEnabled: boolean;

    // ── Actions ──────────────────────────────────────────────────
    setUsername: (name: string) => void;
    setAvatar: (avatar: string) => void;

    addXP: (amount: number) => void;
    addGems: (amount: number) => void;

    purchaseItem: (id: ShopItemId) => boolean;
    useItem: (id: ShopItemId) => boolean;

    /** Called on game start — updates streak for the day */
    checkDailyLogin: () => void;

    /** Unlock a badge (idempotent) */
    earnBadge: (id: BadgeId) => void;
    /** Alias for earnBadge — keeps old call-sites working */
    unlockBadge: (id: BadgeId) => void;

    setDailyTarget: (target: 10 | 30 | 50 | 100) => void;
    toggleSound: () => void;

    /** Reset all progress back to defaults */
    resetProgress: () => void;
};

// ── Defaults ─────────────────────────────────────────────────────
const DEFAULT_BADGES: Badge[] = [
    { id: 'first_win',     name: 'Pemenang Pertama',    description: 'Selesaikan level pertamamu',        emoji: '🏆', earned: false },
    { id: 'streak_3',      name: '3 Hari Berturut',     description: 'Main 3 hari berturut-turut',        emoji: '🔥', earned: false },
    { id: 'streak_7',      name: 'Seminggu Juara',      description: 'Main 7 hari berturut-turut',         emoji: '🌟', earned: false },
    { id: 'all_math',      name: 'Master Matematika',   description: 'Selesaikan semua level Matematika', emoji: '📐', earned: false },
    { id: 'all_pkn',       name: 'Warga Negara Teladan',description: 'Selesaikan semua level PKN',        emoji: '🏛️', earned: false },
    { id: 'perfect_level', name: 'Sempurna!',           description: 'Raih 3 bintang di satu level',      emoji: '💯', earned: false },
    { id: 'speed_demon',   name: 'Si Kilat',            description: 'Jawab 5 soal berturut benar',        emoji: '⚡', earned: false },
    { id: 'gem_spender',   name: 'Big Spender',         description: 'Belanja item di toko pertama kali', emoji: '💎', earned: false },
];

const DEFAULT_SHOP_ITEMS: ShopItem[] = [
    { id: 'heart_refill',  name: 'Isi Nyawa',     description: 'Isi ulang 5 nyawa instan',                   emoji: '❤️', price: 15,  owned: 0, maxStack: 5 },
    { id: 'streak_freeze', name: 'Streak Freeze', description: 'Pertahankan streak 1 hari walau tidak main',  emoji: '❄️', price: 20,  owned: 0, maxStack: 3 },
    { id: 'double_xp',     name: 'Double XP',     description: '2x XP untuk sesi berikutnya',                emoji: '⭐', price: 50,  owned: 0, maxStack: 3 },
    { id: 'dark_theme',    name: 'Tema Gelap',    description: 'Unlock tema warna gelap eksklusif',           emoji: '🌙', price: 100, owned: 0, maxStack: 1 },
];

const getLocalDate = (d: Date) => {
    const tzOffset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - tzOffset).toISOString().split('T')[0];
};

const todayStr = () => getLocalDate(new Date());
const yesterdayStr = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return getLocalDate(d);
};

// ── Store ─────────────────────────────────────────────────────────
export const useUserStore = create<UserState>()(
    persist(
        (set, get) => ({
            // Profile
            username: 'Pelajar',
            avatar: '🦊',

            // Progress
            totalXP: 0,
            gems: 50,
            loginStreak: 0,
            longestStreak: 0,
            lastLoginDate: '',

            // Daily
            dailyXP: 0,
            dailyTarget: 30,
            dailyHistory: [],

            // Collections
            badges: DEFAULT_BADGES,
            shopItems: DEFAULT_SHOP_ITEMS,

            // Settings
            soundEnabled: false,

            // ── Profile ──────────────────────────────────────────
            setUsername: (name) => set({ username: name.trim() || 'Pelajar' }),
            setAvatar: (avatar) => set({ avatar }),

            // ── XP & Gems ────────────────────────────────────────
            addXP: (amount) => {
                if (amount <= 0) return;
                set((s) => {
                    const today = todayStr();
                    const history = [...s.dailyHistory];
                    const idx = history.findIndex((r) => r.date === today);
                    if (idx >= 0) {
                        history[idx] = { ...history[idx], xp: history[idx].xp + amount };
                    } else {
                        history.push({ date: today, xp: amount, levelsPlayed: 0 });
                    }
                    return {
                        totalXP: s.totalXP + amount,
                        dailyXP: s.dailyXP + amount,
                        dailyHistory: history,
                    };
                });
            },

            addGems: (amount) => {
                if (amount === 0) return;
                set((s) => ({ gems: Math.max(0, s.gems + amount) }));
            },

            // ── Shop ─────────────────────────────────────────────
            purchaseItem: (id) => {
                const { gems, shopItems, earnBadge } = get();
                const item = shopItems.find((i) => i.id === id);
                if (!item || gems < item.price || item.owned >= item.maxStack) return false;

                set((s) => ({
                    gems: s.gems - item.price,
                    shopItems: s.shopItems.map((i) =>
                        i.id === id ? { ...i, owned: i.owned + 1 } : i
                    ),
                }));
                earnBadge('gem_spender');
                return true;
            },

            useItem: (id) => {
                const { shopItems } = get();
                const item = shopItems.find((i) => i.id === id);
                if (!item || item.owned <= 0) return false;
                set((s) => ({
                    shopItems: s.shopItems.map((i) =>
                        i.id === id ? { ...i, owned: i.owned - 1 } : i
                    ),
                }));
                return true;
            },

            // ── Streak ───────────────────────────────────────────
            checkDailyLogin: () => {
                const { lastLoginDate, loginStreak, longestStreak, shopItems, earnBadge } = get();
                const today = todayStr();

                // Already updated today — don't run again this session
                if (lastLoginDate === today) return;

                const yesterday = yesterdayStr();
                const continued = lastLoginDate === yesterday;
                const hasFreeze = shopItems.some((i) => i.id === 'streak_freeze' && i.owned > 0);
                const useFreeze = !continued && hasFreeze;

                const newStreak = continued || useFreeze ? loginStreak + 1 : 1;

                if (useFreeze) {
                    // Consume one streak freeze
                    set((s) => ({
                        shopItems: s.shopItems.map((i) =>
                            i.id === 'streak_freeze' ? { ...i, owned: i.owned - 1 } : i
                        ),
                    }));
                }

                set({
                    loginStreak: newStreak,
                    longestStreak: Math.max(longestStreak, newStreak),
                    lastLoginDate: today,
                    dailyXP: lastLoginDate !== today ? 0 : get().dailyXP,
                });

                if (newStreak >= 3) earnBadge('streak_3');
                if (newStreak >= 7) earnBadge('streak_7');
            },

            // ── Badges ───────────────────────────────────────────
            earnBadge: (id) => {
                const already = get().badges.find((b) => b.id === id)?.earned;
                if (already) return;
                set((s) => ({
                    badges: s.badges.map((b) =>
                        b.id === id ? { ...b, earned: true } : b
                    ),
                }));
            },

            unlockBadge: (id) => get().earnBadge(id),

            // ── Settings ─────────────────────────────────────────
            setDailyTarget: (target) => set({ dailyTarget: target }),
            toggleSound: () => set((s) => ({ soundEnabled: !s.soundEnabled })),

            // ── Reset ────────────────────────────────────────────
            resetProgress: () =>
                set({
                    totalXP: 0,
                    gems: 50,
                    loginStreak: 0,
                    longestStreak: 0,
                    lastLoginDate: '',
                    dailyXP: 0,
                    dailyHistory: [],
                    badges: DEFAULT_BADGES,
                    shopItems: DEFAULT_SHOP_ITEMS,
                    // Keep username & avatar — those are preferences, not progress
                }),
        }),
        {
            name: 'user-store-v1',
            storage: createJSONStorage(() => localStorage),
        }
    )
);