import PokeApi from "./PokeApi.mjs";
import { chance, clamp, toAbbreviatedCamel } from "./utlils.mjs";

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
        // flinch_chance
        // effect_chance???? //Effect_chance is the fall back for general seconday effect or a fallback for volatile statuses if ailment_chance is empty
        //       "effect_changes": [
        // {
        //   "effect_entries": [
        //     {
        //       "effect": "Does not raise Defense.",

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

    get isStatusOnly() {
        return this.damageClass === "status" || !this.power;
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
        return chance(this.ailmentChance) && this.ailment !== "none";
    }

    rollStatChange() {
        return (chance(this.statChance) || this.targetsSelf) && this.changesStats
    }

    get didConnectWithTarget() {
        return chance(this.accuracy);
    }


    getDescription(lang = "en") {
        const filtered = this.flavorTextEntries.filter(
            e => e.language.name === lang
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

        // console.table(modifiedTargetStats);
        // console.table(modifiedUserStats);

        const level = user.level;

        const power = this.power;
        const isPhysical = this.isPhysical;


        const attack = isPhysical
            ? modifiedUserStats.attack
            : modifiedUserStats.spAttack;

        const defense = isPhysical
            ? modifiedTargetStats.defense
            : modifiedTargetStats.spDefense;

        // EVENTUALLY INCLUDE EVASION.

        // 1. Base damage
        console.log("Lv:", level, "Pow:", power, "Atk:", attack, "Def:", defense);
        let baseDamage = Math.floor(
            Math.floor(
                Math.floor((2 * level) / 5 + 2) * power * (attack / defense)
            ) / 50
        ) + 2;

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
        if (field.weather === "rain") {
            if (this.type === "water") weatherModifier = 1.5;
            if (this.type === "fire") weatherModifier = 0.5;
        }
        if (field.weather === "sun") {
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
        return target.defaultStats.hp * this.meta?.healing / 100;
    }

    // Get the amount of health the user recieves from dealing damage.
    calculateDrain(damage) {
        return damage * this.meta?.drain / 100;
    }

    applyAilment(target, effects) {
        // If Pokémon implements applyStatus, use that; otherwise just set status
        if (typeof target.applyStatus === "function") {
            const applied = target.applyStatus(this.ailment);
            if (!applied) return;
        } else {
            if (target.status) return; // already has a main status
            target.status = this.ailment;
        }

        effects.push({
            type: "status",
            status: this.ailment,
            target: "target",
        });
    }

    applyStatChanges(target, effects) {

        // if (!target.statStages) return;


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
                target: this.targetName,
            })
        }
    }

    async use(user, target = user) {
        if (this.targetsSelf) target = user;

        // let result = {};

        // WIP
        let damage = 0;
        let isCrit = false;
        let typeEffectiveness = 1;
        const secondaryEffects = [];
        // WIP

        if (!this.canUse) return {
            success: false,
            message: `${this.name} is out of PP.`,
        };

        // Number of uses.
        this.pp--;

        // console.log(`${this.name}: ${this.category}`, this.damageClass, this.power);

        // Did the move miss the target?
        if (!this.targetsSelf && !this.didConnectWithTarget) return {
            success: true,
            hit: false,
            move: this.name,
            damage: 0,
            priority: this.priority
        };



        // 1. Damage
        if (this.dealsDamage) {
            ({ damage, isCrit, typeEffectiveness } = await this.calculateDamage(user, target));

            target.stats.hp = clamp(target.stats.hp - damage, 0, target.defaultStats.hp);

            // Drain Heal - rolled once for total damage
            let drain = this.calculateDrain(damage);
            user.stats.hp = clamp(user.stats.hp + drain, 0, user.defaultStats.hp);
        }

        // 2. Healing
        if (this.canHeal) {
            let heal = this.calculateHeal(target);
            target.stats.hp = clamp(target.stats.hp + heal, 0, target.defaultStats.hp);
        }

        // 3. Primary ailment
        if (this.rollAilment()) { console.log("applying ailment"); this.applyAilment(target, secondaryEffects); }
        // 4. Stat changes
        if (this.changesStats) { console.log("changing stats"); this.applyStatChanges(target, secondaryEffects); }
        // 5. Flinch flinchChance

        return {
            success: true,
            hit: true, // !!target && (!this.isStatusOnly ? damage > 0 || typeEffectiveness >= 0 : true)
            move: this.name,
            damage,
            isCrit,
            typeEffectiveness,
            targetFainted: target.isFainted,
            priority: this.priority,
            secondaryEffects,
        };

    }
}