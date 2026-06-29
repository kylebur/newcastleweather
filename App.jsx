import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
    Sun, Cloud, CloudRain, CloudSnow, CloudLightning, 
    CloudFog, CloudDrizzle, Droplets, ArrowUp, ArrowDown,
    Waves, Loader2, CloudSun, AlertCircle, CalendarClock
} from 'lucide-react';

// --- Utility Functions ---

const getEstDateStr = () => {
    const estDate = new Date(new Date().toLocaleString("en-US", {timeZone: "America/New_York"}));
    const yyyy = estDate.getFullYear();
    const mm = String(estDate.getMonth() + 1).padStart(2, '0');
    const dd = String(estDate.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
};

const mapNwsForecastToWmoCode = (forecastStr) => {
    if (!forecastStr) return 0;
    const str = forecastStr.toLowerCase();
    if (str.includes("thunderstorm") || str.includes("storm") || str.includes("lightning")) return 95;
    if (str.includes("snow showers") || str.includes("snow flurries")) return 85;
    if (str.includes("snow") || str.includes("sleet") || str.includes("ice") || str.includes("wintry mix")) return 73;
    if (str.includes("rain showers") || str.includes("showers") || str.includes("drizzle showers")) return 80;
    if (str.includes("freezing rain") || str.includes("freezing drizzle")) return 66;
    if (str.includes("heavy rain") || str.includes("downpour")) return 65;
    if (str.includes("rain") || str.includes("precipitation")) return 63;
    if (str.includes("drizzle") || str.includes("mist")) return 51;
    if (str.includes("fog") || str.includes("haze") || str.includes("misty")) return 45;
    if (str.includes("overcast") || str.includes("cloudy")) return 3;
    if (str.includes("partly cloudy") || str.includes("partly sunny") || str.includes("scattered clouds")) return 2;
    if (str.includes("mostly clear") || str.includes("mostly sunny") || str.includes("few clouds")) return 1;
    if (str.includes("clear") || str.includes("sunny") || str.includes("fair")) return 0;
    return 0;
};

const estimateCloudCoverFromNws = (forecastStr) => {
    if (!forecastStr) return 50;
    const str = forecastStr.toLowerCase();
    if (str.includes("clear") || str.includes("sunny") || str.includes("fair")) return 10;
    if (str.includes("mostly sunny") || str.includes("mostly clear")) return 25;
    if (str.includes("partly cloudy") || str.includes("partly sunny")) return 50;
    if (str.includes("mostly cloudy")) return 75;
    if (str.includes("cloudy") || str.includes("overcast")) return 100;
    return 50;
};

const generate29DaysRange = () => {
    const days = [];
    const today = new Date(new Date().toLocaleString("en-US", {timeZone: "America/New_York"}));
    for (let i = -14; i <= 14; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        days.push(`${yyyy}-${mm}-${dd}`);
    }
    return days;
};

const mergeNwsDataWithCache = (nwsData) => {
    const timeRange = generate29DaysRange();
    
    // Load cache
    const cachedStr = localStorage.getItem('newcastle_weather_cache');
    const cache = cachedStr ? JSON.parse(cachedStr) : null;
    const cachedDaily = cache && cache.data && cache.data.daily ? cache.data.daily : null;
    
    // Map NWS periods by date
    const nwsPeriodsByDate = {};
    if (nwsData && nwsData.properties && nwsData.properties.periods) {
        nwsData.properties.periods.forEach(p => {
            const dateStr = p.startTime.substring(0, 10);
            if (!nwsPeriodsByDate[dateStr]) {
                nwsPeriodsByDate[dateStr] = {};
            }
            if (p.isDaytime) {
                nwsPeriodsByDate[dateStr].day = p;
            } else {
                nwsPeriodsByDate[dateStr].night = p;
            }
        });
    }
    
    const daily = {
        time: timeRange,
        temperature_2m_max: [],
        temperature_2m_min: [],
        weather_code: [],
        precipitation_sum: [],
        snowfall_sum: [],
        precipitation_probability_max: []
    };
    
    const hourly = {
        time: [],
        cloud_cover: []
    };
    
    timeRange.forEach(dateStr => {
        const nwsDay = nwsPeriodsByDate[dateStr];
        let cacheIdx = -1;
        if (cachedDaily && cachedDaily.time) {
            cacheIdx = cachedDaily.time.indexOf(dateStr);
        }
        
        let maxTemp = 70;
        let minTemp = 50;
        let weatherCode = 2;
        let precipSum = 0;
        let snowSum = 0;
        let precipProb = 0;
        let cloudVal = 50;
        
        // 1. Populate from cache
        if (cacheIdx !== -1) {
            maxTemp = cachedDaily.temperature_2m_max[cacheIdx];
            minTemp = cachedDaily.temperature_2m_min[cacheIdx];
            weatherCode = cachedDaily.weather_code[cacheIdx];
            precipSum = cachedDaily.precipitation_sum[cacheIdx] || 0;
            snowSum = cachedDaily.snowfall_sum[cacheIdx] || 0;
            precipProb = cachedDaily.precipitation_probability_max[cacheIdx] || 0;
            
            if (cache && cache.data && cache.data.hourly) {
                const hData = cache.data.hourly;
                for (let i = 0; i < hData.time.length; i++) {
                    if (hData.time[i].startsWith(dateStr)) {
                        hourly.time.push(hData.time[i]);
                        hourly.cloud_cover.push(hData.cloud_cover[i]);
                    }
                }
            }
        }
        
        // 2. Overwrite with NWS forecast
        if (nwsDay) {
            if (nwsDay.day) {
                maxTemp = nwsDay.day.temperature;
                weatherCode = mapNwsForecastToWmoCode(nwsDay.day.shortForecast);
                cloudVal = estimateCloudCoverFromNws(nwsDay.day.shortForecast);
                if (nwsDay.day.probabilityOfPrecipitation) {
                    precipProb = nwsDay.day.probabilityOfPrecipitation.value || 0;
                }
            }
            if (nwsDay.night) {
                minTemp = nwsDay.night.temperature;
                if (!nwsDay.day) {
                    weatherCode = mapNwsForecastToWmoCode(nwsDay.night.shortForecast);
                    cloudVal = estimateCloudCoverFromNws(nwsDay.night.shortForecast);
                }
                if (nwsDay.night.probabilityOfPrecipitation) {
                    precipProb = Math.max(precipProb, nwsDay.night.probabilityOfPrecipitation.value || 0);
                }
            }
            
            // Clean cached hourly cloud cover for this date
            const prefix = dateStr;
            for (let i = hourly.time.length - 1; i >= 0; i--) {
                if (hourly.time[i].startsWith(prefix)) {
                    hourly.time.splice(i, 1);
                    hourly.cloud_cover.splice(i, 1);
                }
            }
            
            for (let h = 0; h < 24; h++) {
                hourly.time.push(`${dateStr}T${String(h).padStart(2, '0')}:00`);
                hourly.cloud_cover.push(cloudVal);
            }
        } else {
            const hasHourly = hourly.time.some(t => t.startsWith(dateStr));
            if (!hasHourly) {
                for (let h = 0; h < 24; h++) {
                    hourly.time.push(`${dateStr}T${String(h).padStart(2, '0')}:00`);
                    hourly.cloud_cover.push(50);
                }
            }
        }
        
        daily.temperature_2m_max.push(maxTemp);
        daily.temperature_2m_min.push(minTemp);
        daily.weather_code.push(weatherCode);
        daily.precipitation_sum.push(precipSum);
        daily.snowfall_sum.push(snowSum);
        daily.precipitation_probability_max.push(precipProb);
    });
    
    return {
        daily,
        hourly
    };
};

const formatLocalDate = (date) => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
};

const TIDE_CONSTITUENTS = [
    { name: 'M2', amplitude: 3.2719, phaseRad: 5.8 * Math.PI / 180, speedRad: (2 * Math.PI) / 12.4206 },
    { name: 'N2', amplitude: 0.6885, phaseRad: 343.0 * Math.PI / 180, speedRad: (2 * Math.PI) / 12.6583 },
    { name: 'O1', amplitude: 0.3821, phaseRad: 171.6 * Math.PI / 180, speedRad: (2 * Math.PI) / 25.8193 },
    { name: 'MSF', amplitude: 0.3708, phaseRad: 26.2 * Math.PI / 180, speedRad: (2 * Math.PI) / 354.3671 },
    { name: 'L2', amplitude: 0.3029, phaseRad: 32.5 * Math.PI / 180, speedRad: (2 * Math.PI) / 12.1916 },
    { name: 'K1', amplitude: 0.2907, phaseRad: 170.9 * Math.PI / 180, speedRad: (2 * Math.PI) / 23.9345 },
    { name: 'MM', amplitude: 0.2826, phaseRad: 0.4 * Math.PI / 180, speedRad: (2 * Math.PI) / 661.3092 },
    { name: 'M4', amplitude: 0.2715, phaseRad: 298.7 * Math.PI / 180, speedRad: (2 * Math.PI) / 6.2103 },
    { name: 'S2', amplitude: 0.2049, phaseRad: 65.6 * Math.PI / 180, speedRad: (2 * Math.PI) / 12.0000 },
    { name: 'MN4', amplitude: 0.1803, phaseRad: 293.5 * Math.PI / 180, speedRad: (2 * Math.PI) / 6.2692 },
    { name: 'MK3', amplitude: 0.1450, phaseRad: 110.3 * Math.PI / 180, speedRad: (2 * Math.PI) / 8.1771 },
    { name: 'MS4', amplitude: 0.1159, phaseRad: 8.1 * Math.PI / 180, speedRad: (2 * Math.PI) / 6.1033 },
    { name: 'MO3', amplitude: 0.1123, phaseRad: 49.8 * Math.PI / 180, speedRad: (2 * Math.PI) / 8.3863 },
    { name: 'M6', amplitude: 0.0847, phaseRad: 168.3 * Math.PI / 180, speedRad: (2 * Math.PI) / 4.1402 },
    { name: 'EPS2', amplitude: 0.0828, phaseRad: 357.9 * Math.PI / 180, speedRad: (2 * Math.PI) / 13.1273 },
    { name: '2MK5', amplitude: 0.0742, phaseRad: 305.8 * Math.PI / 180, speedRad: (2 * Math.PI) / 4.9309 },
    { name: '2MN6', amplitude: 0.0707, phaseRad: 155.1 * Math.PI / 180, speedRad: (2 * Math.PI) / 4.1663 },
    { name: 'OO1', amplitude: 0.0604, phaseRad: 6.3 * Math.PI / 180, speedRad: (2 * Math.PI) / 22.3061 },
    { name: 'SN4', amplitude: 0.0603, phaseRad: 96.8 * Math.PI / 180, speedRad: (2 * Math.PI) / 6.1602 },
    { name: 'SK3', amplitude: 0.0573, phaseRad: 308.2 * Math.PI / 180, speedRad: (2 * Math.PI) / 7.9927 },
    { name: 'Q1', amplitude: 0.0493, phaseRad: 252.3 * Math.PI / 180, speedRad: (2 * Math.PI) / 26.8684 },
    { name: 'ALP1', amplitude: 0.0454, phaseRad: 160.0 * Math.PI / 180, speedRad: (2 * Math.PI) / 29.0727 },
    { name: 'S4', amplitude: 0.0446, phaseRad: 125.6 * Math.PI / 180, speedRad: (2 * Math.PI) / 6.0000 },
    { name: 'UPS1', amplitude: 0.0367, phaseRad: 208.6 * Math.PI / 180, speedRad: (2 * Math.PI) / 21.5782 },
    { name: 'NO1', amplitude: 0.0336, phaseRad: 222.7 * Math.PI / 180, speedRad: (2 * Math.PI) / 24.8332 },
    { name: 'M3', amplitude: 0.0335, phaseRad: 339.4 * Math.PI / 180, speedRad: (2 * Math.PI) / 8.2804 },
    { name: 'MU2', amplitude: 0.0334, phaseRad: 115.9 * Math.PI / 180, speedRad: (2 * Math.PI) / 12.8718 },
    { name: 'ETA2', amplitude: 0.0309, phaseRad: 61.9 * Math.PI / 180, speedRad: (2 * Math.PI) / 11.7545 },
    { name: '2SK5', amplitude: 0.0296, phaseRad: 310.8 * Math.PI / 180, speedRad: (2 * Math.PI) / 4.7974 },
    { name: 'M8', amplitude: 0.0263, phaseRad: 350.3 * Math.PI / 180, speedRad: (2 * Math.PI) / 3.1052 },
    { name: '3MK7', amplitude: 0.0249, phaseRad: 168.7 * Math.PI / 180, speedRad: (2 * Math.PI) / 3.5296 },
    { name: '2MS6', amplitude: 0.0238, phaseRad: 210.7 * Math.PI / 180, speedRad: (2 * Math.PI) / 4.0924 },
    { name: '2Q1', amplitude: 0.0232, phaseRad: 306.6 * Math.PI / 180, speedRad: (2 * Math.PI) / 28.0062 },
    { name: 'J1', amplitude: 0.0140, phaseRad: 132.0 * Math.PI / 180, speedRad: (2 * Math.PI) / 23.0985 },
    { name: '2SM6', amplitude: 0.0024, phaseRad: 190.4 * Math.PI / 180, speedRad: (2 * Math.PI) / 4.0457 }
];

const getTideHeight = (dateObj, startYear) => {
    const epoch = new Date(`${startYear}-01-01T00:00:00`);
    const tMs = dateObj.getTime() - epoch.getTime();
    const tHours = tMs / (1000 * 60 * 60);

    const H0 = 3.3850; // Mean Offset in ft
    let height = H0;

    for (let i = 0; i < TIDE_CONSTITUENTS.length; i++) {
        const c = TIDE_CONSTITUENTS[i];
        height += c.amplitude * Math.cos(c.speedRad * tHours - c.phaseRad);
    }

    return height;
};

const generateCustomTideData = (startDayStr, endDayStr) => {
    const startYear = parseInt(startDayStr.substring(0, 4), 10);
    const startLocal = new Date(`${startDayStr}T00:00:00`);
    const endLocal = new Date(`${endDayStr}T23:59:59`);

    const continuous = [];
    let curr = new Date(startLocal.getTime());
    while (curr <= endLocal) {
        const v = getTideHeight(curr, startYear);
        continuous.push({
            t: formatLocalDate(curr),
            v: v.toFixed(3)
        });
        curr.setTime(curr.getTime() + 15 * 60 * 1000);
    }

    const hilo = [];
    let tSearch = new Date(startLocal.getTime());
    const stepMs = 5 * 60 * 1000;
    while (tSearch <= endLocal) {
        const vPrev = getTideHeight(new Date(tSearch.getTime() - stepMs), startYear);
        const vCurr = getTideHeight(tSearch, startYear);
        const vNext = getTideHeight(new Date(tSearch.getTime() + stepMs), startYear);

        if (vCurr > vPrev && vCurr > vNext) {
            hilo.push({
                t: formatLocalDate(tSearch),
                v: vCurr.toFixed(3),
                type: 'H'
            });
        } else if (vCurr < vPrev && vCurr < vNext) {
            hilo.push({
                t: formatLocalDate(tSearch),
                v: vCurr.toFixed(3),
                type: 'L'
            });
        }
        tSearch.setTime(tSearch.getTime() + stepMs);
    }

    return { hilo, continuous };
};

const getMoonPhase = (date) => {
    const LUNAR_MONTH = 29.53058867;
    const NEW_MOON_EPOCH = new Date('2000-01-06T18:14:00Z').getTime();
    const elapsedDays = (date.getTime() - NEW_MOON_EPOCH) / (1000 * 60 * 60 * 24);
    const cycleDays = elapsedDays % LUNAR_MONTH;
    const phaseRatio = (cycleDays < 0 ? cycleDays + LUNAR_MONTH : cycleDays) / LUNAR_MONTH;
    
    let index = Math.round(phaseRatio * 8);
    if (index >= 8) index = 0;
    
    const phases = [
        { name: "New Moon", icon: "🌑" },
        { name: "Waxing Crescent", icon: "🌒" },
        { name: "First Quarter", icon: "🌓" },
        { name: "Waxing Gibbous", icon: "🌔" },
        { name: "Full Moon", icon: "🌕" },
        { name: "Waning Gibbous", icon: "🌖" },
        { name: "Last Quarter", icon: "🌗" },
        { name: "Waning Crescent", icon: "🌘" }
    ];
    return phases[index];
};

const getWeatherIcon = (code, size = 24) => {
    if (code === 0) return <Sun size={size} className="text-yellow-400 drop-shadow-[0_0_10px_rgba(250,204,21,0.5)]" />;
    if (code === 1 || code === 2) return <CloudSun size={size} className="text-yellow-200 drop-shadow-[0_0_10px_rgba(254,240,138,0.3)]" />;
    if (code === 3) return <Cloud size={size} className="text-slate-300" />;
    if (code === 45 || code === 48) return <CloudFog size={size} className="text-slate-400" />;
    if (code >= 51 && code <= 57) return <CloudDrizzle size={size} className="text-blue-300" />;
    if (code >= 61 && code <= 67) return <CloudRain size={size} className="text-blue-400" />;
    if (code >= 71 && code <= 77) return <CloudSnow size={size} className="text-white" />;
    if (code >= 80 && code <= 82) return <CloudRain size={size} className="text-blue-500" />;
    if (code >= 85 && code <= 86) return <CloudSnow size={size} className="text-white" />;
    if (code >= 95 && code <= 99) return <CloudLightning size={size} className="text-yellow-400 drop-shadow-[0_0_10px_rgba(250,204,21,0.5)]" />;
    return <Sun size={size} className="text-yellow-400" />;
};

const getWeatherLabel = (code) => {
    if (code === 0) return "Clear";
    if (code === 1) return "Mostly Clear";
    if (code === 2) return "Partly Cloudy";
    if (code === 3) return "Overcast";
    if (code === 45 || code === 48) return "Fog";
    if (code >= 51 && code <= 57) return "Drizzle";
    if (code >= 61 && code <= 67) return "Rain";
    if (code >= 71 && code <= 77) return "Snow";
    if (code >= 80 && code <= 82) return "Showers";
    if (code >= 85 && code <= 86) return "Snow Showers";
    if (code >= 95 && code <= 99) return "Storms";
    return "Unknown";
};

const getDayLabel = (dateObj, isToday) => {
    if (isToday) return "Today";
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${days[dateObj.getDay()]}, ${months[dateObj.getMonth()]} ${dateObj.getDate()}`;
};

const formatTime = (timeStr) => {
    const timePart = timeStr.split(' ')[1];
    let [hr, min] = timePart.split(':');
    let hours = parseInt(hr, 10);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${hours}:${min} ${ampm}`;
};

const parseLocal = (timeStr) => new Date(timeStr.replace(' ', 'T'));

// --- Components ---

const Clock = () => {
    const [time, setTime] = useState(new Date());
    useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);
    return (
        <div className="text-white text-3xl lg:text-4xl font-light tracking-wider drop-shadow-md">
            {time.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
        </div>
    );
};

const TideChart = ({ tideData, fullWeatherData }) => {
    const [now, setNow] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 60000); // Update every minute
        return () => clearInterval(timer);
    }, []);

    if (!tideData || !tideData.continuous || tideData.continuous.length === 0 || fullWeatherData.length === 0) return null;

    const totalDays = fullWeatherData.length;
    const startTime = fullWeatherData[0].dateObj.getTime();
    const totalTime = totalDays * 24 * 60 * 60 * 1000; 
    
    // Scale SVG width to allow drawing the full 29 days continuously
    const svgWidth = totalDays * 200;

    const continuousData = tideData.continuous;
    const hiloData = tideData.hilo;

    const heights = continuousData.map(d => parseFloat(d.v));
    const minHeight = Math.min(...heights);
    const maxHeight = Math.max(...heights);

    const yPadding = (maxHeight - minHeight) * 0.45;
    const yMin = minHeight - yPadding;
    const yMax = maxHeight + yPadding;

    const getX = (t) => {
        const time = parseLocal(t).getTime();
        return ((time - startTime) / totalTime) * svgWidth;
    };

    const getY = (v) => {
        const val = parseFloat(v);
        return 100 - ((val - yMin) / (yMax - yMin)) * 100;
    };

    let pathD = `M ${getX(continuousData[0].t)},${getY(continuousData[0].v)}`;
    continuousData.forEach(p => {
        pathD += ` L ${getX(p.t)},${getY(p.v)}`;
    });
    
    const fillD = `${pathD} L ${svgWidth},100 L 0,100 Z`;

    const nowTime = now.getTime();
    const xNow = ((nowTime - startTime) / totalTime) * svgWidth;
    
    let yNow = 50;
    if (xNow >= 0 && xNow <= svgWidth) {
        let minDiff = Infinity;
        continuousData.forEach(p => {
            const ptTime = parseLocal(p.t).getTime();
            const diff = Math.abs(ptTime - nowTime);
            if (diff < minDiff) {
                minDiff = diff;
                yNow = getY(p.v);
            }
        });
    }

    return (
        <div className="w-full h-full flex flex-col pointer-events-none">
            {/* The absolute container positions the "Tides" text nicely fixed on the left regardless of pan */}
            <div className="flex items-center gap-2 mb-2 pl-2 opacity-90 absolute -top-8 left-2 z-10">
                <Waves size={18} className="text-cyan-400" />
                <span className="text-sm font-bold text-cyan-400 tracking-widest uppercase drop-shadow-md">Tides</span>
            </div>
            
            <div className="flex-1 relative bg-slate-900/40 rounded-3xl border border-slate-700/50 backdrop-blur-xl shadow-2xl overflow-visible">
                <svg viewBox={`0 0 ${svgWidth} 100`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full rounded-3xl overflow-hidden">
                    <defs>
                        <linearGradient id="waterFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="rgba(6, 182, 212, 0.4)" />
                            <stop offset="100%" stopColor="rgba(30, 58, 138, 0.1)" />
                        </linearGradient>
                        <linearGradient id="lineGlow" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor="#38bdf8" />
                            <stop offset="50%" stopColor="#22d3ee" />
                            <stop offset="100%" stopColor="#38bdf8" />
                        </linearGradient>
                    </defs>

                    {Array.from({length: totalDays - 1}).map((_, i) => (
                        <line key={i} x1={(i + 1) * 200} y1="0" x2={(i + 1) * 200} y2="100" stroke="rgba(148, 163, 184, 0.15)" strokeWidth="1" strokeDasharray="4 4" />
                    ))}

                    <path d={fillD} fill="url(#waterFill)" />
                    <path d={pathD} fill="none" stroke="url(#lineGlow)" strokeWidth="2.5" className="drop-shadow-[0_0_5px_rgba(34,211,238,0.8)]" />
                    
                    {xNow >= 0 && xNow <= svgWidth && (
                        <>
                            <line x1={xNow} y1="0" x2={xNow} y2="100" stroke="rgba(255, 255, 255, 0.5)" strokeWidth="1.5" strokeDasharray="4 4" />
                            <circle cx={xNow} cy={yNow} r="10" fill="rgba(56, 189, 248, 0.3)" className="animate-pulse" />
                            <circle cx={xNow} cy={yNow} r="4" fill="#fff" className="drop-shadow-[0_0_5px_rgba(255,255,255,1)]" />
                        </>
                    )}
                </svg>

                {hiloData.map((pt, idx) => {
                    const xPercent = (getX(pt.t) / svgWidth) * 100;
                    if (xPercent < 0 || xPercent > 100) return null;
                    
                    const yPercent = getY(pt.v);
                    const isHigh = pt.type === 'H';
                    
                    return (
                        <div key={idx} 
                            className="absolute transform -translate-x-1/2 flex flex-col items-center z-10"
                            style={{ 
                                left: `${xPercent}%`, 
                                top: isHigh ? `calc(${yPercent}% - 34px)` : `calc(${yPercent}% + 8px)` 
                            }}>
                            <div className="flex items-center gap-0.5">
                                {isHigh ? <ArrowUp size={10} className="text-cyan-300"/> : <ArrowDown size={10} className="text-blue-400"/>}
                                <span className={`text-[11px] xl:text-xs font-bold leading-none ${isHigh ? 'text-cyan-300' : 'text-blue-400'}`}>
                                    {parseFloat(pt.v).toFixed(1)}'
                                </span>
                            </div>
                            <span className="text-[10px] xl:text-[11px] text-slate-200 font-medium whitespace-nowrap mt-0.5 filter drop-shadow-md">
                                {formatTime(pt.t)}
                            </span>
                        </div>
                    );
                })}
                
                {xNow >= 0 && xNow <= svgWidth && (
                    <div 
                        className="absolute transform -translate-x-1/2 top-0 mt-3 flex flex-col items-center z-20"
                        style={{ left: `${(xNow / svgWidth) * 100}%` }}>
                        <span className="bg-blue-500/90 text-white text-[9px] xl:text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shadow-[0_0_10px_rgba(59,130,246,0.6)] border border-blue-400/50">
                            Now
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
};

const DayCard = ({ day }) => {
    const isToday = day.isToday;
    const isSnow = day.snowSum > 0;
    
    // Day style rules strictly bound to day.isToday
    const cardBaseClasses = "flex flex-col relative rounded-[1.5rem] lg:rounded-[2rem] p-4 lg:p-5 backdrop-blur-xl transition-all duration-500 w-full h-full";
    const bgClasses = isToday 
        ? "bg-gradient-to-b from-blue-900/70 to-slate-900/90 border border-blue-400/50 shadow-[0_0_50px_rgba(59,130,246,0.3)] scale-[1.03] lg:scale-105 z-20" 
        : "bg-slate-800/50 border border-slate-700/50 shadow-lg opacity-75 transition-opacity z-10 scale-95 lg:scale-100";
        
    return (
        <div className={`${cardBaseClasses} ${bgClasses}`}>
            {/* Header */}
            <div className="text-center mb-4 xl:mb-6">
                <h2 className={`font-bold tracking-wide mb-1 whitespace-nowrap ${isToday ? 'text-2xl text-white' : 'text-lg lg:text-xl text-slate-200'}`}>
                    {getDayLabel(day.dateObj, isToday)}
                </h2>
                <p className="text-xs xl:text-sm text-blue-200/70 font-medium tracking-widest uppercase">
                    {day.dateStr}
                </p>
            </div>
            
            {/* Weather Icon */}
            <div className="flex flex-col items-center mb-4 xl:mb-6">
                <div className={`flex items-center justify-center rounded-full bg-slate-900/40 shadow-inner mb-3 ${isToday ? 'w-24 h-24' : 'w-16 h-16 xl:w-20 xl:h-20'}`}>
                    {getWeatherIcon(day.weatherCode, isToday ? 52 : 36)}
                </div>
                <span className={`font-semibold tracking-wide text-center ${isToday ? 'text-xl text-blue-100' : 'text-sm xl:text-base text-slate-300'}`}>
                    {getWeatherLabel(day.weatherCode)}
                </span>
            </div>
            
            {/* Temps */}
            <div className="flex justify-center items-center gap-3 xl:gap-5 mb-4 xl:mb-6">
                <div className="flex flex-col items-center">
                    <span className="text-[10px] xl:text-xs text-slate-400 font-semibold tracking-widest uppercase mb-1">High</span>
                    <span className={`font-bold ${isToday ? 'text-3xl text-white' : 'text-2xl xl:text-3xl text-slate-200'}`}>{Math.round(day.maxTemp)}°{isToday && 'F'}</span>
                </div>
                <div className={`w-px bg-slate-600/50 ${isToday ? 'h-8' : 'h-6 xl:h-8'}`}></div>
                <div className="flex flex-col items-center">
                    <span className="text-[10px] xl:text-xs text-slate-400 font-semibold tracking-widest uppercase mb-1">Low</span>
                    <span className={`font-bold ${isToday ? 'text-3xl text-slate-300' : 'text-2xl xl:text-3xl text-slate-400'}`}>{Math.round(day.minTemp)}°</span>
                </div>
            </div>
            
            {/* Grid Stats */}
            <div className="grid grid-cols-2 gap-2 xl:gap-3 mb-4 xl:mb-6">
                <div className="flex flex-col items-center justify-center bg-slate-900/40 rounded-xl py-3 px-1 text-center">
                    {isSnow ? (
                        <CloudSnow size={18} className="text-white mb-2" />
                    ) : (
                        <Droplets size={18} className="text-blue-400 mb-2" />
                    )}
                    <span className="font-bold text-white text-sm xl:text-base mb-0.5">
                        {isSnow ? `${day.snowSum.toFixed(1)}"` : (day.precipSum > 0 ? `${day.precipSum.toFixed(2)}"` : '0"')}
                    </span>
                    <span className="text-[9px] xl:text-[10px] text-slate-400 font-semibold tracking-wider uppercase">
                        {isSnow ? 'Snow' : `${day.precipProb}% Rain`}
                    </span>
                </div>
                <div className="flex flex-col items-center justify-center bg-slate-900/40 rounded-xl py-3 px-1 text-center">
                    <Cloud size={18} className="text-slate-400 mb-2" />
                    <span className="font-bold text-white text-sm xl:text-base mb-0.5">{day.cloudCover}%</span>
                    <span className="text-[9px] xl:text-[10px] text-slate-400 font-semibold tracking-wider uppercase">Clouds</span>
                </div>
            </div>
            
            {/* Moon Phase */}
            <div className="flex items-center justify-center gap-2 xl:gap-3 bg-slate-900/40 rounded-xl py-2 xl:py-3 px-2 whitespace-nowrap overflow-hidden mt-auto">
                <span className="text-lg xl:text-xl filter drop-shadow-md">{day.moonPhase.icon}</span>
                <span className="text-xs xl:text-sm font-medium text-slate-200 truncate">{day.moonPhase.name}</span>
            </div>
        </div>
    );
};

// --- Main App ---

export default function App() {
    const [fullWeatherData, setFullWeatherData] = useState([]);
    const [tideData, setTideData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [weatherSource, setWeatherSource] = useState('Open-Meteo');
    
    const [todayIndex, setTodayIndex] = useState(14);
    const [panIndex, setPanIndex] = useState(12); // The index of the leftmost visible day
    const [currentDayStr, setCurrentDayStr] = useState(getEstDateStr());

    // Drag / Swipe State
    const containerRef = useRef(null);
    const [dragStartX, setDragStartX] = useState(null);
    const [dragOffsetPx, setDragOffsetPx] = useState(0);
    const [isDragging, setIsDragging] = useState(false);

    const calculateDailyCloudCover = (dateStr, hourlyData) => {
        if (!hourlyData || !hourlyData.time) return 0;
        let sum = 0, count = 0;
        for (let i = 0; i < hourlyData.time.length; i++) {
            if (hourlyData.time[i].startsWith(dateStr)) {
                const hour = parseInt(hourlyData.time[i].substring(11, 13), 10);
                if (hour >= 8 && hour <= 18) {
                    sum += hourlyData.cloud_cover[i] || 0;
                    count++;
                }
            }
        }
        return count > 0 ? Math.round(sum / count) : 0;
    };

    const fetchAllData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const lat = 44.0328;
            const lon = -69.5191;
            const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum,precipitation_probability_max&hourly=cloud_cover&temperature_unit=fahrenheit&precipitation_unit=inch&timezone=America%2FNew_York&past_days=14&forecast_days=15`;
            
            let wData;
            let source = 'Open-Meteo';
            
            try {
                const wRes = await fetch(weatherUrl);
                if (!wRes.ok) throw new Error(`Status ${wRes.status}`);
                wData = await wRes.json();
                
                // Save to cache
                localStorage.setItem('newcastle_weather_cache', JSON.stringify({
                    timestamp: Date.now(),
                    source: 'Open-Meteo',
                    data: wData
                }));
            } catch (openMeteoError) {
                console.warn("Open-Meteo fetch failed, trying NWS fallback...", openMeteoError);
                try {
                    const nwsUrl = `https://api.weather.gov/gridpoints/GYX/93,79/forecast`;
                    const nwsRes = await fetch(nwsUrl, {
                        headers: {
                            'User-Agent': 'NewcastleWeatherApp/1.0'
                        }
                    });
                    if (!nwsRes.ok) throw new Error(`NWS Status ${nwsRes.status}`);
                    const nwsData = await nwsRes.json();
                    
                    wData = mergeNwsDataWithCache(nwsData);
                    source = 'NWS Fallback';
                } catch (nwsError) {
                    console.error("NWS fallback fetch failed as well.", nwsError);
                    const cachedStr = localStorage.getItem('newcastle_weather_cache');
                    if (cachedStr) {
                        const cache = JSON.parse(cachedStr);
                        wData = cache.data;
                        source = `Local Cache (${new Date(cache.timestamp).toLocaleDateString()})`;
                    } else {
                        throw new Error(`Failed to fetch weather data: Open-Meteo (${openMeteoError.message}) & NWS Fallback (${nwsError.message}). No cache available.`);
                    }
                }
            }
            
            setWeatherSource(source);
            
            const todayStrEst = getEstDateStr();
            let actualTodayIdx = wData.daily.time.findIndex(d => d === todayStrEst);
            if (actualTodayIdx === -1) actualTodayIdx = 14; 
            
            setTodayIndex(actualTodayIdx);
            setPanIndex(actualTodayIdx - 2); // Automatically center Today initially

            const startDayStr = wData.daily.time[0];
            const endDayStr = wData.daily.time[wData.daily.time.length - 1];
            const generatedTide = generateCustomTideData(startDayStr, endDayStr);

            setTideData({
                hilo: generatedTide.hilo,
                continuous: generatedTide.continuous
            });

            const combined = wData.daily.time.map((timeStr, idx) => {
                const [year, month, day] = timeStr.split('-');
                const dateObj = new Date(year, month - 1, day);
                
                return {
                    dateStr: timeStr,
                    dateObj: dateObj,
                    isToday: idx === actualTodayIdx, 
                    maxTemp: wData.daily.temperature_2m_max[idx],
                    minTemp: wData.daily.temperature_2m_min[idx],
                    weatherCode: wData.daily.weather_code[idx],
                    precipSum: wData.daily.precipitation_sum[idx] || 0,
                    snowSum: wData.daily.snowfall_sum[idx] || 0,
                    precipProb: wData.daily.precipitation_probability_max[idx] || 0,
                    cloudCover: calculateDailyCloudCover(timeStr, wData.hourly),
                    moonPhase: getMoonPhase(dateObj)
                };
            });
            
            setFullWeatherData(combined);
        } catch (err) {
            console.error(err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAllData();
        
        const timer = setInterval(() => {
            const nowStr = getEstDateStr();
            if (nowStr !== currentDayStr) {
                // Midnight passed
                setCurrentDayStr(nowStr);
                fetchAllData();
            } else if (new Date().getMinutes() % 15 === 0) {
                // 15 min check
                fetchAllData();
            }
        }, 60000); 
        
        return () => clearInterval(timer);
    }, [fetchAllData, currentDayStr]);

    // Drag / Swipe Handlers mapped cleanly for fluid motion
    const handlePointerDown = (e) => {
        setDragStartX(e.clientX || (e.touches && e.touches[0].clientX));
        setIsDragging(true);
        if (e.target.setPointerCapture) e.target.setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e) => {
        if (!isDragging || dragStartX === null) return;
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        setDragOffsetPx(clientX - dragStartX);
    };

    const handlePointerUp = (e) => {
        if (!isDragging) return;
        setIsDragging(false);
        if (e.target.releasePointerCapture) e.target.releasePointerCapture(e.pointerId);
        
        if (containerRef.current) {
            const viewWidth = containerRef.current.offsetWidth;
            const dayWidth = viewWidth / 5; // Width of 1 day panel
            let shiftedDays = Math.round(-dragOffsetPx / dayWidth);
            
            // Allow quick swiping / flicking without crossing the 50% threshold
            if (shiftedDays === 0) {
                if (dragOffsetPx < -40) shiftedDays = 1;
                if (dragOffsetPx > 40) shiftedDays = -1;
            }
            
            const maxPan = fullWeatherData.length - 5;
            setPanIndex(prev => Math.max(0, Math.min(prev + shiftedDays, maxPan)));
        }
        
        setDragOffsetPx(0);
        setDragStartX(null);
    };

    const isCenteredOnToday = panIndex === todayIndex - 2;
    const totalDays = fullWeatherData.length;
    const wrapperWidthPercent = totalDays > 0 ? (totalDays / 5) * 100 : 100;

    return (
        <div className="h-screen w-full bg-[#0a0f1c] overflow-hidden flex flex-col relative text-white font-sans selection:bg-blue-500/30">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[10%] w-[50%] h-[50%] bg-blue-600/10 blur-[120px] rounded-full mix-blend-screen animate-[pulse_10s_ease-in-out_infinite]"></div>
                <div className="absolute bottom-[-10%] right-[10%] w-[40%] h-[40%] bg-cyan-600/10 blur-[100px] rounded-full mix-blend-screen animate-[pulse_8s_ease-in-out_infinite_alternate]"></div>
            </div>

            <header className="w-full pt-6 pb-4 px-8 lg:px-12 flex flex-col md:flex-row justify-between items-center md:items-end shrink-0 z-10 gap-4">
                <div className="text-center md:text-left">
                    <h1 className="text-4xl lg:text-5xl font-light tracking-wide text-white mb-1 xl:mb-2 shadow-sm">Newcastle, ME</h1>
                </div>
                
                <div className={`absolute top-6 left-1/2 transform -translate-x-1/2 transition-all duration-500 ${!isCenteredOnToday ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'}`}>
                    <button 
                        onClick={() => setPanIndex(todayIndex - 2)}
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-full text-xs font-bold tracking-widest uppercase shadow-[0_0_20px_rgba(37,99,235,0.6)] border border-blue-400/50 transition-colors"
                    >
                        <CalendarClock size={16} />
                        Return to Today
                    </button>
                </div>

                <div className="text-center md:text-right">
                    <Clock />
                </div>
            </header>

            <main 
                ref={containerRef}
                className="flex-1 flex flex-col w-full max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-10 pb-6 z-20 overflow-visible gap-6 touch-none cursor-grab active:cursor-grabbing select-none"
                style={{ touchAction: 'pan-y' }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
            >
                {loading && fullWeatherData.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-6 text-blue-400">
                        <Loader2 size={56} className="animate-spin" />
                        <p className="text-xl tracking-widest uppercase font-medium">Synchronizing Metrics...</p>
                    </div>
                ) : error ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-4 text-red-400 bg-red-950/40 p-8 rounded-3xl border border-red-900/50 m-10">
                        <AlertCircle size={48} />
                        <p className="text-lg tracking-wide">{error}</p>
                        <button onClick={() => { setPanIndex(todayIndex - 2); fetchAllData(); }} className="mt-4 px-6 py-2 bg-red-900/50 hover:bg-red-800/60 rounded-full text-white transition-colors cursor-pointer">
                            Retry Connection
                        </button>
                    </div>
                ) : (
                    <div 
                        className="flex-1 flex flex-col h-full will-change-transform"
                        style={{ 
                            width: `${wrapperWidthPercent}%`,
                            transform: `translateX(calc(${-panIndex * (100 / totalDays)}% + ${dragOffsetPx}px))`, 
                            transition: isDragging ? 'none' : 'transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1)' 
                        }}
                    >
                        {/* 29 Days Continuous DayCards Track */}
                        <div className="flex w-full items-stretch flex-shrink-0 mt-6 lg:mt-8 relative z-30 pointer-events-none h-fit">
                            {fullWeatherData.map((day, idx) => (
                                <div key={idx} style={{ width: `${100 / totalDays}%`, padding: '0 12px' }}>
                                    <DayCard day={day} />
                                </div>
                            ))}
                        </div>

                        {/* 29 Days Continuous Unified Tide Chart Track */}
                        <div className="flex-1 w-full mt-10 relative pointer-events-none pb-2">
                            <TideChart tideData={tideData} fullWeatherData={fullWeatherData} />
                        </div>
                    </div>
                )}
            </main>
            <div className="absolute bottom-2 right-4 text-[10px] text-slate-500 font-mono z-50 pointer-events-none select-none">
                v1.3.0 • {weatherSource}
            </div>
        </div>
    );
}
