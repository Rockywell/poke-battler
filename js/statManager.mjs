import { clamp as clampUtility } from "./utlils.mjs";

export const IVManager = {
    maxIV: 31,
    default() {
        return {
            hp: this.maxIV,
            attack: this.maxIV,
            defense: this.maxIV,
            spAttack: this.maxIV,
            spDefense: this.maxIV,
            speed: this.maxIV
        };
    },

    perfect() {
        // returns perfect IVs: all 31
        return this.default();
    },

    clamp(value) {
        return clampUtility(value, 0, this.maxIV);
    },

    create(overrides = {}) {
        const base = this.default();

        for (const key in overrides) {
            if (key in base) {
                base[key] = this.clamp(overrides[key]);
            }
        }

        return base;
    },

    random() {
        // random IV spread like in the games
        const result = {};
        for (const stat of ["hp", "attack", "defense", "spAttack", "spDefense", "speed"]) {
            result[stat] = Math.floor(Math.random() * 32);
        }
        return result;
    }
};

export const EVManager = {
    maxTotalEV: 510,
    maxEV: 255,

    default() {
        return {
            hp: 0,
            attack: 0,
            defense: 0,
            spAttack: 0,
            spDefense: 0,
            speed: 0
        };
    },

    perfect() {
        return {
            hp: 85,
            attack: 85,
            defense: 85,
            spAttack: 85,
            spDefense: 85,
            speed: 85
        };
    },

    clamp(value) {
        return clampUtility(value, 0, this.maxEV);
    },

    total(evObj) {
        return Object.values(evObj).reduce((a, b) => a + b, 0);
    },

    enforceTotalCap(evObj) {
        let total = this.total(evObj);
        if (total <= 510) return evObj;

        // Reduce stats evenly until total <= 510
        const keys = Object.keys(evObj);

        // const perStatAvg = 510 / keys.length;

        // const candidateKeys = keys.filter(k => evObj[k] > perStatAvg);

        // Equally Weighted Option WIP
        // 190
        // 100, 90

        // 71.5
        // 100 - 85

        // 15

        // 15 * (100 / 190)

        // 7.8947

        // 100 - 7
        // 93



        const reducibleSum = (total - this.maxTotalEV) / evObj.length;

        const passOver = 0;

        for (const key of keys) {
            let amount = reducibleSum + passOver;
            passOver = amount % 1;

            evObj[key] -= Math.floor(amount);
        }

        return evObj;
    },

    create(overrides = {}) {
        const base = this.default();

        for (const key in overrides) {
            if (key in base) {
                base[key] = this.clamp(overrides[key]);
            }
        }

        return this.enforceTotalCap(base);
    }
};

export const statManager = {
    default() {
        return {
            hp: 1,
            attack: 5,
            defense: 5,
            spAttack: 10,
            spDefense: 20,
            speed: 5
        }
    },

    baseCalculation(B, IV, EV, level) {
        return Math.floor(((2 * B + IV + Math.floor(EV / 4)) * level) / 100);
    },

    create(overrides = {}) {
        const base = this.default();

        for (const statName of ["hp", "attack", "defense", "spAttack", "spDefense", "speed"]) {
            //            (baseStat, IV, EV, level)
            let baseNum = this.baseCalculation(
                overrides[statName],
                overrides.iv[statName],
                overrides.ev[statName],
                overrides.level
            );

            base[statName] = Math.floor(statName == "hp" ? baseNum + overrides.level + 10 : (baseNum + 5) * overrides.nature[statName]);
        };

        return base
    }
}