import { clamp, chance, randomInt } from "./utlils.mjs";

// Primary (non-volatile) statuses.
export const PRIMARY_STATUSES = new Set([
    "burn",
    "paralysis",
    "poison",
    "badly-poisoned", // Also known as toxic.
    "sleep",
    "freeze"
]);

// Volatile statuses - this should be in the order of priority (What gets applies first).
export const VOLATILE_STATUSES = new Set([
    "flinch",
    "confusion",
    "trap",
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

// Sets up a status and it's counters.
function setStatus(target, statusName) {
    const status = STATUS_DEFS[statusName];

    target.statusCounters ??= {};

    target.statusCounters[statusName] = status?.counter ?? randomInt(status.minCounter, status.maxCounter);
}

// Checks if the status has a counter and that the target doesn't already have the counter.
function hasCounter(target, statusName) {
    const status = STATUS_DEFS[statusName];
    const counterProperties = ["minCounter", "counter", "maxCounter"];

    return !Object.hasOwn(target.statusCounters ?? {}, statusName) && counterProperties.some((property) =>
        Object.hasOwn(status, property)
    );
}

// Dataset and Handler for each statuses individual effects.
const STATUS_DEFS = {
    // --- Primary Statuses ---
    burn: {
        kind: "primary",
        phases: {
            end({ target, result }) {
                // Residual damage – 1/16 max HP
                const maxHp = target.defaultStats.hp;
                const damageFrac = 1 / 16;
                const damage = Math.max(1, Math.floor(maxHp * damageFrac));

                target.stats.hp = clamp(
                    target.stats.hp - damage,
                    0,
                    target.defaultStats.hp
                );
                result.damage += damage;
                result.messages.push(`${target.name} is hurt by its burn!`);
            }
        }
    },

    paralysis: {
        kind: "primary",
        phases: {
            start({ target, result }) {
                if (chance(25)) {
                    result.messages.push(`${target.name} is fully paralyzed!`);
                    result.canAct = false;
                }
            },
            //PURELY FOR SETUP
            // end({ target, result }) {
            //     result.messages.push(`${target.name} is paralyzed! It may be unable to move!`);
            // }
        }
    },

    poison: {
        kind: "primary",
        phases: {
            end({ target, result }) {

                // Residual damage – 1/8 max HP
                const maxHp = target.defaultStats.hp;
                const damageFrac = 1 / 8;
                const damage = Math.max(1, Math.floor(maxHp * damageFrac));

                target.stats.hp = clamp(
                    target.stats.hp - damage,
                    0,
                    target.defaultStats.hp
                );
                result.damage += damage;
                result.messages.push(`${target.name} is hurt by the poison!`);
            }
        }
    },

    "badly-poisoned": {
        kind: "primary",
        counter: 1,
        phases: {
            end({ target, result }) {

                // target.statusCounters.toxic
                const counter = target.statusCounters["badly-poisoned"];

                // Residual damage – counter/16 max HP
                const maxHp = target.defaultStats.hp;
                const damageFrac = counter / 16;
                const damage = Math.max(1, Math.floor(maxHp * damageFrac));

                target.stats.hp = clamp(
                    target.stats.hp - damage,
                    0,
                    target.defaultStats.hp
                );
                target.statusCounters["badly-poisoned"] = counter + 1;

                result.damage += damage;
                result.messages.push(`${target.name} is hurt by the toxic poison!`);
            }
        }
    },

    sleep: {
        kind: "primary",

        //Technically 1
        minCounter: 2,
        maxCounter: 3,

        phases: {
            start({ target, result }) {
                if (target.statusCounters.sleep > 0) {
                    target.statusCounters.sleep--;

                    result.messages.push(`${target.name} is fast asleep.`);
                    result.canAct = false;

                    if (target.statusCounters.sleep === 0) {
                        clearStatus(target, "sleep");
                        result.canAct = true;

                        result.messages.push(`${target.name} woke up!`);
                    }
                }
            }
        }
    },

    freeze: {
        kind: "primary",
        phases: {
            start({ target, result }) {
                if (chance(80)) {
                    result.messages.push(`${target.name} is frozen solid!`);
                    result.canAct = false;
                } else {
                    clearStatus(target, "freeze");
                    result.messages.push(`${target.name} thawed out!`);
                }
            }
        }
    },

    // --- Volatile Statuses ---

    flinch: {
        kind: "volatile",
        phases: {
            start({ target, result }) {
                result.messages.push(`${target.name} flinched and couldn't move!`);
                result.canAct = false;
                clearStatus(target, "flinch");
            },
            // Flinch is always removed at the end of turn regardless of wether or not it triggered.
            end({ target, result }) {
                result.affected = false;
                clearStatus(target, "flinch");
            }
        }
    },

    confusion: {
        kind: "volatile",

        minCounter: 1,
        maxCounter: 4,

        phases: {
            start({ target, result }) {

                if (target.statusCounters.confusion <= 0) {
                    clearStatus(target, "confusion");
                    result.messages.push(`${target.name} snapped out of its confusion!`);
                    return;
                }

                result.messages.push(`${target.name} is confused!`);
                target.statusCounters.confusion--;

                // 50% chance to hurt itself.
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
                    result.damage += damage;
                    result.messages.push(`${target.name} hurt itself in its confusion!`);
                    result.canAct = false;
                }
            }
        }
    },

    trap: {
        kind: "volatile",

        minCounter: 2,
        maxCounter: 5,

        phases: {
            end({ target, result }) {
                const duration = target.statusCounters.trap ?? 0;
                if (duration <= 0) return;

                // Residual damage – 1/8 max HP
                const maxHp = target.defaultStats.hp;
                const damageFrac = 1 / 8;

                const damage = Math.max(1, Math.floor(maxHp * damageFrac));

                target.stats.hp = clamp(
                    target.stats.hp - damage,
                    0,
                    target.defaultStats.hp
                );

                result.messages.push(`${target.name} is hurt by the trap!`);

                target.statusCounters.trap = duration - 1;

                if (target.statusCounters.trap === 0) {
                    clearStatus(target, "trap");
                    result.messages.push(`${target.name} is freed from the trap!`);
                }
            }
        },

        // IMPLEMENT LATER
        // blockSwitch: true
    }
};

// applyStatus()
// applyVolatileStatus()

export function applyStatusPhase(target, phase) {
    const result = {
        affected: false, // If the target was affected by the status.
        canAct: true,    // If the target can act.
        damage: 0,
        messages: []
    };

    // Primary status - target.status !== "none";
    if (target.hasStatus) {
        const def = STATUS_DEFS[target.status];
        const fn = def?.phases?.[phase];

        if (fn) {
            if (hasCounter(target, target.status)) setStatus(target, target.status);

            result.affected = true;
            fn({ target, result });

            // If a status stops action, exit early.
            if (!result.canAct && phase === "start") return result;
        }
    }

    // Volatile statuses
    if (target.volatileStatuses) {
        for (const name of target.volatileStatuses) {

            const def = STATUS_DEFS[name];
            const fn = def?.phases?.[phase];

            if (fn) {
                if (hasCounter(target, name)) setStatus(target, name);

                result.affected = true;
                fn({ target, result });

                // If a status stops action, exit early.
                if (!result.canAct && phase === "start") break;
            }
        }
    }

    return result;
}