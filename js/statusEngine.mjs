// StatusEngine.mjs
import { clamp, chance } from "./utlils.mjs";

// What we consider "primary" (non-volatile) statuses
export const PRIMARY_STATUSES = new Set([
    "burn",
    "paralysis",
    "poison",
    "badly-poisoned",
    "sleep",
    "freeze"
]);

// Some common volatile statuses (you can expand this)
export const VOLATILE_STATUSES = new Set([
    "confusion",
    "flinch",
    "leech-seed"
]);
// flinch, attraction, confusion, bind, trap, recharge, focus-energy, protect-like, substitute-like, taunt, torment, disable, embargo,etc.


// Resolves/Removes statuses
function clearStatus(target, statusName) {
    const statusClass = STATUS_DEFS[statusName].kind;

    if (statusClass == "primary") {
        target.status = "none"// null;
    }
    else if (statusClass == "volatile") {
        target.volatileStatuses.delete(statusName)
    }
}


// Dataset and Handler for each statuses individual effects.
const STATUS_DEFS = {
    // --- Primary Statuses
    burn: {
        kind: "primary",
        phases: {
            end: ({ target, ctx }) => {
                const damage = Math.max(1, Math.floor(target.defaultStats.hp / 16));
                target.stats.hp = clamp(
                    target.stats.hp - damage,
                    0,
                    target.defaultStats.hp
                );
                ctx.damage += damage;
                ctx.messages.push(`${target.name} is hurt by its burn!`);
            }
        }
    },

    paralysis: {
        kind: "primary",
        phases: {
            start: ({ target, ctx }) => {
                if (chance(25)) {
                    ctx.messages.push(`${target.name} is fully paralyzed!`);
                    ctx.canAct = false;
                }
            }
        }
    },

    poison: {
        kind: "primary",
        phases: {
            end: ({ target, ctx }) => {
                const damage = Math.max(1, Math.floor(target.defaultStats.hp / 8));
                target.stats.hp = clamp(
                    target.stats.hp - damage,
                    0,
                    target.defaultStats.hp
                );
                ctx.damage += damage;
                ctx.messages.push(`${target.name} is hurt by the poison!`);
            }
        }
    },

    "badly-poisoned": {
        kind: "primary",
        phases: {
            end: ({ target, ctx }) => {
                const n = target.statusCounters.toxic || 1;
                const frac = n / 16;
                const raw = target.defaultStats.hp * frac;
                const damage = Math.max(1, Math.floor(raw));

                target.stats.hp = clamp(
                    target.stats.hp - damage,
                    0,
                    target.defaultStats.hp
                );
                target.statusCounters.toxic = n + 1;

                ctx.damage += damage;
                ctx.messages.push(`${target.name} is hurt by the toxic poison!`);
            }
        }
    },

    sleep: {
        kind: "primary",
        phases: {
            start: ({ target, ctx }) => {
                if (target.statusCounters.sleep > 0) {
                    target.statusCounters.sleep--;
                    ctx.messages.push(`${target.name} is fast asleep.`);
                    ctx.canAct = false;

                    if (target.statusCounters.sleep === 0) {
                        clearStatus(target, "sleep");
                        ctx.messages.push(`${target.name} woke up!`);
                    }
                }
            }
        }
    },

    freeze: {
        kind: "primary",
        phases: {
            start: ({ target, ctx }) => {
                if (chance(80)) {
                    ctx.messages.push(`${target.name} is frozen solid!`);
                    ctx.canAct = false;
                } else {
                    clearStatus(target, "freeze");
                    ctx.messages.push(`${target.name} thawed out!`);
                }
            }
        }
    },

    // --- Volatile Statuses

    flinch: {
        kind: "volatile",
        phases: {
            start: ({ target, ctx }) => {
                if (!target.volatileStatuses?.has("flinch")) return;
                ctx.messages.push(`${target.name} flinched and couldn't move!`);
                ctx.canAct = false;
                clearStatus(target, "flinch");
            }
        }
    },

    confusion: {
        kind: "volatile",
        phases: {
            start: ({ target, ctx }) => {
                if (!target.volatileStatuses?.has("confusion")) return;

                if (target.statusCounters.confusion <= 0) {
                    clearStatus(target, "confusion");
                    ctx.messages.push(`${target.name} snapped out of its confusion!`);
                    return;
                }

                target.statusCounters.confusion--;

                // 50% chance to hurt itself
                if (chance(50)) {
                    const lvl = target.level ?? 50;
                    const atk = target.stats.attack;
                    const def = target.stats.defense || 1;

                    let damage = Math.floor(
                        Math.floor(
                            Math.floor((2 * lvl) / 5 + 2) * 40 * (atk / def)
                        ) / 50
                    ) + 2;

                    damage = clamp(damage, 1, target.stats.hp);
                    target.stats.hp = clamp(
                        target.stats.hp - damage,
                        0,
                        target.defaultStats.hp
                    );
                    ctx.damage += damage;
                    ctx.messages.push(`${target.name} hurt itself in its confusion!`);
                    ctx.canAct = false;
                }
            }
        }
    }
};


export function applyStatusPhase(target, phase) {
    const ctx = {
        canAct: true,   // relevant for "start"
        damage: 0,      // relevant for "end"
        messages: []
    };

    // Primary status
    if (target.status) {
        const def = STATUS_DEFS[target.status];
        const fn = def?.phases?.[phase];
        if (fn) {
            fn({ target, ctx });
        }
    }

    // Volatile statuses
    if (target.volatileStatuses) {
        for (const name of target.volatileStatuses) {
            const def = STATUS_DEFS[name];
            const fn = def?.phases?.[phase];
            if (fn) {
                fn({ target, ctx });
                // if a status stops action, you *might* want to stop early:
                if (!ctx.canAct && phase === "start") break;
            }
        }
    }

    return ctx;
}