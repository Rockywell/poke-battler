import { getData, getLocalStorage, setLocalStorage } from "./utlils.mjs";


async function getApproxLocationFromIP() {
    // Gets my IP - API
    const { ip } = await getData("https://api.ipify.org?format=json");
    // Get Geo location data - API
    const geo = await getData(`https://ipapi.co/${ip}/json/`);

    return {
        latitude: geo.latitude,
        longitude: geo.longitude,
    };
}


export default class Weather {

    static api = "https://api.open-meteo.com/v1/forecast";
    static storageKey = "weather-type";

    constructor(latitude, longitude, options = {}) {
        this.latitude = latitude;
        this.longitude = longitude;
        this.timezone = options.timezone ?? "auto";
        this.baseUrl = Weather.api;
    }


    // Maps Open-Meteo weather_codes to a simple weather type.
    static mapWeatherCodeToType(code) {
        if (code === 0) return "sunny"; // Clear sky

        if ([1, 2, 3].includes(code)) return "cloudy"; // Mainly clear / partly cloudy / overcast

        if ([45, 48].includes(code)) return "foggy"; // Fog, rime fog

        if ([51, 53, 55, 56, 57].includes(code)) return "drizzle"; // Drizzle & freezing drizzle

        if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "rainy"; // Rain & rain showers

        if ([71, 73, 75, 77, 85, 86].includes(code)) return "snowy"; // Snow & snow showers

        if ([95, 96, 99].includes(code)) return "stormy"; // Thunderstorms (with/without hail)

        return "unknown";
    }

    // Builds the API URL for current conditions.
    buildUrl() {
        const params = new URLSearchParams({
            latitude: this.latitude,
            longitude: this.longitude,
            timezone: this.timezone,
            // Information I want to retrieve.
            current: "temperature_2m,weather_code,cloud_cover,precipitation"
        });

        return `${this.baseUrl}?${params.toString()}`;
    }

    // Gets raw current weather data from Open-Meteo.
    async fetchCurrentRaw() {
        const url = this.buildUrl();
        const data = await getData(url);

        // Raw data example.
        // e.g. { time: "...", interval: 900, temperature_2m: 5.1, weather_code: 3, ... }
        return data.current ?? {};
    }


    //Gets a simple weather type string, e.g. "sunny", "cloudy", "rainy".
    async getCurrentType() {
        const current = await this.fetchCurrentRaw();
        const code = current.weather_code;
        return Weather.mapWeatherCodeToType(code);
    }
}



// Gets Weather from approximate coordinates if the weather isn't already defined.
export const WEATHER_TYPE = await (async () => {
    let stored = getLocalStorage(Weather.storageKey);

    if (stored) return stored;

    const location = await getApproxLocationFromIP();
    const weather = new Weather(location.latitude, location.longitude);

    return setLocalStorage(Weather.storageKey, await weather.getCurrentType());
})();