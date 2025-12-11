import PokeApi from "./PokeApi.mjs";
import { WEATHER_TYPE } from "./Weather.mjs";
import { chance, clamp, toAbbreviatedCamel } from "./utlils.mjs";
import { PRIMARY_STATUSES, VOLATILE_STATUSES } from "./statusEngine.mjs";

// helper for stat stages
function clampStage(stage) {
    return clamp(stage, -6, 6);
}

export default class Move {

    power = 100
    accuracy = 100
    pp = 5
    priority = 0

    constructor(raw) {
        this.raw = raw;

        // Primary stats

        this.name = raw.name;

        this.power = raw.power;
        this.accuracy = raw.accuracy;
        this.pp = raw.pp;
        this.priority = raw.priority;

        this.type = raw.type?.name ?? "normal";
        this.damageClass = raw.damage_class?.name ?? "physical"; // "physical" | "special" | "status"

        // Secondary stats

        this.meta = raw.meta ?? {};
        this.category = raw.meta?.category?.name ?? "damage";
        this.ailment = raw.meta?.ailment?.name ?? "none"; // "paralysis" | "burn" | "poison" | "sleep" etc...
        this.ailmentChance = raw.meta?.ailment_chance ?? 0;
        this.statChance = raw.meta?.stat_chance ?? 0;
        this.flinchChance = raw.meta?.flinch_chance;
        // effect_chance???? // Effect_chance is the fall back for general seconday effect or a fallback for volatile statuses if ailment_chance is empty

        // Percentage 0-100 of how much the user heals based on damage dealt.
        this.drain = raw.meta?.drain ?? 0;
        // Percentage 0-100 of how much the user heals based on max hp.
        this.healing = raw.meta?.healing ?? 0;

        this.statChanges = Object.fromEntries(
            (raw.stat_changes ?? []).map((s) => [toAbbreviatedCamel(s.stat.name), s.change])
        );


        // Info

        this.flavorTextEntries = raw.flavor_text_entries ?? [];
        this.targetName = raw.target?.name;
        // this.targetInfo = raw.target;  
    }


    get canUse() {
        return this.pp > 0;
    }

    get canHeal() {
        return this.meta?.healing > 0;
    }

    get dealsDamage() {
        return this.category.includes("damage");
    }

    get isPhysical() {
        return this.damageClass === "physical";
    }

    get isSpecial() {
        return this.damageClass === "special";
    }

    get isStatus() {
        return this.damageClass === "status";
    }

    get critStage() {
        return this.meta?.crit_rate ?? 0; // 0, 1, 2...
    }

    get critChance() {
        switch (this.critStage) {
            case 0: return 1 / 24;
            case 1: return 1 / 8;
            case 2: return 1 / 2;
            default: return 1;
        }
    }

    get changesStats() {
        return !!Object.keys(this.statChanges).length
    }

    get targetsSelf() {
        return this.targetName === "user";
    }

    rollCrit() {
        return chance(this.critChance * 100);
    }

    rollAilment() {
        return (chance(this.ailmentChance) || this.isStatus) && this.ailment !== "none";
    }

    rollFlinch() {
        return chance(this.flinchChance);
    }

    rollStatChange() {
        return (chance(this.statChance) || this.isStatus) && this.changesStats
    }

    didConnectWithTarget(user, target) {
        let accuracyMult = this.getStageMultiplier(user?.statStages?.["acccuracy"] ?? 0);
        let evasionMult = this.getStageMultiplier(-(target?.statStages?.["evasion"] ?? 0));

        return chance(this.accuracy * accuracyMult * evasionMult) || !this.accuracy;
    }


    getDescription(lang = "en") {
        const filtered = this.flavorTextEntries.filter(
            e => e.language.name === lang && !e.flavor_text.includes("This move can’t be used.")
        );
        const last = filtered[filtered.length - 1];
        return last?.flavor_text?.replace(/\f/g, " ") ?? "";
    }

    async getTypeMultiplier(target) {
        return await PokeApi.getTypeEffectiveness(this.type, target.types);
    }

    getStageMultiplier(stage) {
        if (stage === 0) return 1;

        if (stage > 0) {
            return (2 + stage) / 2;       // +1 => 1.5, +2 => 2.0, ...
        } else {
            return 2 / (2 - stage);       // -1 => 2/3, -2 => 0.5, ...
        }
    }


    getModifiedStats(target) {
        const result = { ...target.stats };

        for (const statName in target.statStages) {

            const stage = target.statStages[statName];
            const base = target.stats[statName] ?? 0;

            result[statName] = base * this.getStageMultiplier(stage);
        }

        return result;
    }

    async calculateDamage(user, target, field = { weather: "none" }) {

        let modifiedUserStats = this.getModifiedStats(user);
        let modifiedTargetStats = this.getModifiedStats(target);


        const level = user.level;

        const power = this.power ?? 0;
        const isPhysical = this.isPhysical;


        const attack = isPhysical
            ? modifiedUserStats.attack
            : modifiedUserStats.spAttack;

        const defense = isPhysical
            ? modifiedTargetStats.defense
            : modifiedTargetStats.spDefense;

        // 1. Base damage
        let baseDamage = (Math.floor(
            Math.floor(
                Math.floor((2 * level) / 5 + 2) * power * (attack / defense)
            ) / 50
        ) + 2);

        // === Apply Modifiers ===

        // For Future Implementation WIP
        // 2. Target modifier (double battles)
        // modifier *= this.targetsMultiple ? 0.75 : 1;


        // 3. STAB
        const stabModifier = user.types.includes(this.type.name)
            ? 1.5
            : 1


        // 4. Burn
        const isBurned = user.status == "burned";
        const burnModifier = (isBurned && isPhysical && user.ability !== "guts")
            ? 0.5
            : 1


        // 5. Weather
        let weatherModifier = 1;
        if (field.weather === "rainy") {
            if (this.type === "water") weatherModifier = 1.5;
            if (this.type === "fire") weatherModifier = 0.5;
        }
        if (field.weather === "sunny") {
            if (this.type === "fire") weatherModifier = 1.5;
            if (this.type === "water") weatherModifier = 0.5;
        }


        // 6. Critical hit
        // Determines if the hit was critical.
        const isCrit = this.rollCrit();
        const critModifier = isCrit ? 1.5 : 1;

        // 7. Random           0.85—1.00
        const randomModifier = (85 + Math.floor(Math.random() * 16)) / 100;


        // 8. Type effectiveness  e.g. 2, 0.5, 4, 0, etc.
        const typeEffectiveness = await this.getTypeMultiplier(target);


        // 9. Other modifiers omitted for simplicity

        const modifier = stabModifier * burnModifier * weatherModifier * critModifier * randomModifier;

        let damage = Math.floor(clamp(Math.floor(baseDamage * modifier), 1) * typeEffectiveness);

        return { damage, isCrit, typeEffectiveness }
    }

    calculateHeal(target) {
        return Math.floor(target.defaultStats.hp * this.meta?.healing / 100);
    }

    // Get the amount of health the user recieves from dealing damage.
    calculateDrain(damage) {
        return Math.floor(damage * this.meta?.drain / 100);
    }

    applyAilment(user, target, effects, ailment = this.ailment) {
        // If Pokémon implements applyStatus, use that, otherwise just set status

        target.statusSources ??= {};
        target.statusSources[ailment] = user;

        if (PRIMARY_STATUSES.has(ailment)) {
            if (typeof target.applyStatus === "function") {
                const applied = target.applyStatus(ailment);
                if (!applied) return;
            } else {
                if (target.hasStatus) return; // already has a main status
                target.status = ailment;
            }
        } else if (VOLATILE_STATUSES.has(ailment)) {
            target.volatileStatuses.add(ailment);
        } else return

        effects.push({
            type: "status",
            status: ailment,
            target: target,
        });
    }

    applyStatChanges(target, effects) {
        for (const [key, amount] of Object.entries(this.statChanges)) {
            // Skip if the key isn't present in the target.
            if (!(key in target.statStages)) continue;

            target.statStages[key] = clampStage(
                (target.statStages[key] ?? 0) + amount
            );

            effects.push({
                type: "stat-change",
                stat: key,
                amount,
                target: target,
            })
        }
    }

    async use(user, target = user) {
        if (this.targetsSelf) target = user;

        let result = {
            name: this.name,
            success: false,
            hit: false,
            damage: 0,
            isCrit: false,
            typeEffectiveness: 1,
            targetsSelf: this.targetsSelf,
            priority: this.priority,
            secondaryEffects: [],
            messages: [`${user.name} used ${this.name}!`]
        };

        if (!this.canUse) {
            result.messages.push(`${this.name} is out of PP.`);
            return result
        }

        // Number of uses.
        this.pp--;


        // Did the move miss the target?
        if (!this.didConnectWithTarget(user, target)) {
            result.messages.push(`${user.name} missed!`);

            return Object.assign(result, {
                success: true,
                hit: false,
            });
        }


        // 1. Damage
        if (this.dealsDamage) {
            Object.assign(result, await this.calculateDamage(user, target, { weather: WEATHER_TYPE }));

            // Super Effective Move
            if (result.typeEffectiveness >= 2) result.messages.push("It's super effective!");
            // Innefective Move
            if (result.typeEffectiveness == 0) result.messages.push("It had no effect!");

            target.stats.hp = clamp(target.stats.hp - result.damage, 0, target.defaultStats.hp) || 0;

            // Drain Heal - rolled once for total damage
            let drain = this.calculateDrain(result.damage);
            user.stats.hp = clamp(user.stats.hp + drain, 0, user.defaultStats.hp);
        }

        // 2. Healing
        if (this.canHeal) {
            let heal = this.calculateHeal(target) || 0;
            target.stats.hp = clamp(target.stats.hp + heal, 0, target.defaultStats.hp);
        }

        // 3. Primary ailment
        if (this.rollAilment()) this.applyAilment(user, target, result.secondaryEffects);
        // 4. Stat changes
        if (this.changesStats) {
            let statTarget = this.category.includes("raise") ? user : target;
            this.applyStatChanges(statTarget, result.secondaryEffects);
        }
        // 5. Flinch flinchChance
        if (this.rollFlinch()) this.applyAilment(user, target, result.secondaryEffects, "flinch");



        // Other messages to add: "A critical hit!"
        return Object.assign(result, {
            success: true,
            hit: true,
            targetFainted: target.isFainted,
        });

    }
}