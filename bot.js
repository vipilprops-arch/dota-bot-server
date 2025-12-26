
const { Telegraf } = require('telegraf');
const { GoogleGenAI } = require('@google/genai');
const fetch = require('node-fetch');
const http = require('http');

// 1. СЕРВЕР ДЛЯ RENDER (Health Check)
// Render требует, чтобы приложение "слушало" порт, иначе он его убивает.
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    console.log(`[HealthCheck] Request received at ${new Date().toISOString()}`);
    res.writeHead(200);
    res.end('Dota Bot is running');
}).listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Health check server is listening on port ${PORT}`);
});

// 2. ПРОВЕРКА КЛЮЧЕЙ (Проверка в логах Render)
if (!process.env.TELEGRAM_TOKEN) {
    console.error('!!! ОШИБКА: TELEGRAM_TOKEN не найден в переменных окружения Render !!!');
} else {
    console.log('[Config] TELEGRAM_TOKEN найден.');
}

if (!process.env.API_KEY) {
    console.error('!!! ОШИБКА: API_KEY не найден в переменных окружения Render !!!');
} else {
    console.log('[Config] API_KEY найден.');
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
const bot = new Telegraf(process.env.TELEGRAM_TOKEN);

// Функция конвертации ID
function to32(id) {
    if (!id || typeof id !== 'string') return null;
    const digitsOnly = id.replace(/\D/g, '');
    if (digitsOnly.length === 0) return null; 
    if (digitsOnly.length < 10) return digitsOnly;
    try {
        return (BigInt(digitsOnly) - BigInt("76561197960265728")).toString();
    } catch (e) {
        return digitsOnly;
    }
}

async function analyzePlayer(ctx, input) {
    console.log(`[Action] Анализ игрока: ${input}`);
    await ctx.sendChatAction('typing');
    
    const id32 = to32(input);
    console.log(`[Debug] Resolved ID32: ${id32 || 'None (using nickname)'}`);

    try {
        let apiSummary = "Профиль скрыт или не найден в OpenDota API.";
        
        if (id32) {
            try {
                const apiRes = await fetch(`https://api.opendota.com/api/players/${id32}/recentMatches`);
                console.log(`[API] OpenDota status: ${apiRes.status}`);
                if (apiRes.ok) {
                    const matches = await apiRes.json();
                    if (Array.isArray(matches) && matches.length > 0) {
                        const m = matches[0];
                        const win = (m.radiant_win && m.player_slot < 128) || (!m.radiant_win && m.player_slot >= 128);
                        apiSummary = `Последний матч (API): Герой ID ${m.hero_id}, ${win ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ'}, KDA: ${m.kills}/${m.deaths}/${m.assists}.`;
                    }
                }
            } catch (e) {
                console.error("[API Error] OpenDota fetch failed:", e.message);
            }
        }

        console.log("[AI] Запрос к Gemini...");
        const prompt = `
        Player info: ${input}. 
        Context from API: ${apiSummary}.
        
        Задание:
        1. Найди этого игрока в Google (dotabuff или stratz), если данных API недостаточно.
        2. Сделай ОЧЕНЬ ТОКСИЧНЫЙ и агрессивный разбор его последней игры на РУССКОМ ЯЗЫКЕ.
        3. Используй жесткий сленг дотеров (руинер, рак, мусор на миду, 2к мусор, купи варды).
        4. Если это победа — скажи, что его протащили. Если поражение — смешай с грязью.
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: { tools: [{ googleSearch: {} }] }
        });

        const text = response.text;
        console.log("[AI] Ответ получен.");
        await ctx.reply(text || "ИИ не смог придумать унижение. Попробуй другой ID.");

    } catch (error) {
        console.error('[Error] AnalyzePlayer failed:', error);
        if (error.message.includes('429')) {
            await ctx.reply("📛 Лимиты Google AI исчерпаны. Подожди минуту.");
        } else {
            await ctx.reply("💀 Ошибка при анализе. Видимо, этот игрок настолько плох, что даже ИИ в шоке.");
        }
    }
}

// ОБРАБОТКА КОМАНД
bot.start((ctx) => {
    console.log(`[Event] Команда /start от пользователя ${ctx.from.username || ctx.from.id}`);
    ctx.reply('Здорово. Я Dota-аналитик. Кидай SteamID или ник — я скажу, насколько ты плох.');
});

bot.command('ping', (ctx) => {
    console.log('[Event] Команда /ping');
    ctx.reply('Pong! Бот жив и слушает.');
});

bot.on('text', async (ctx) => {
    const text = ctx.message.text;
    console.log(`[Event] Сообщение от ${ctx.from.id}: ${text}`);
    if (!text.startsWith('/')) {
        await analyzePlayer(ctx, text);
    }
});

// ЗАПУСК С ЛОГИРОВАНИЕМ
console.log('[System] Запуск бота...');
bot.launch()
    .then(() => console.log('--- БОТ УСПЕШНО ЗАПУЩЕН И СЛУШАЕТ СООБЩЕНИЯ ---'))
    .catch((err) => {
        console.error('!!! КРИТИЧЕСКАЯ ОШИБКА ЗАПУСКА !!!');
        console.error(err);
    });

// Безопасное завершение
process.once('SIGINT', () => {
    console.log('[System] Останавливаю бота (SIGINT)...');
    bot.stop('SIGINT');
});
process.once('SIGTERM', () => {
    console.log('[System] Останавливаю бота (SIGTERM)...');
    bot.stop('SIGTERM');
});
