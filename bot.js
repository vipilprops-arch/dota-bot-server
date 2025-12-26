
const { Telegraf } = require('telegraf');
const { GoogleGenAI } = require('@google/genai');
const fetch = require('node-fetch');
const http = require('http');

/**
 * 1. FIX FOR RENDER: Создаем сервер, который слушает порт.
 * Это предотвратит ошибку "No open ports detected" и остановку бота.
 */
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Dota Bot is Alive');
}).listen(PORT, () => {
    console.log(`Render health check server running on port ${PORT}`);
});

/**
 * 2. ИНИЦИАЛИЗАЦИЯ ИИ
 * Используем gemini-3-flash-preview, так как у нее больше лимитов на бесплатном тарифе.
 */
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
const bot = new Telegraf(process.env.TELEGRAM_TOKEN);

// Функция для получения ID32 (нужен для OpenDota API)
function to32(id) {
    if (!id) return null;
    const clean = id.replace(/\D/g, '');
    if (clean.length < 10) return clean;
    try {
        return (BigInt(clean) - BigInt("76561197960265728")).toString();
    } catch (e) { return clean; }
}

async function analyzePlayer(ctx, input) {
    await ctx.sendChatAction('typing');
    const id32 = to32(input);
    
    try {
        // Попытка получить данные через быстрое API
        let apiSummary = "Данные в API скрыты.";
        try {
            const res = await fetch(`https://api.opendota.com/api/players/${id32}/recentMatches`);
            const matches = await res.json();
            if (Array.isArray(matches) && matches.length > 0) {
                const m = matches[0];
                const win = (m.radiant_win && m.player_slot < 128) || (!m.radiant_win && m.player_slot >= 128);
                apiSummary = `Последний матч: Герой ID ${m.hero_id}, Результат: ${win ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ'}, KDA: ${m.kills}/${m.deaths}/${m.assists}.`;
            }
        } catch (e) { console.log("API Fetch error"); }

        const prompt = `
        Player Search: ${input}. 
        API Info: ${apiSummary}.
        
        Задание:
        1. Используй Google Search, чтобы найти этот профиль на dotabuff.com/players/${id32}.
        2. Если в API пусто, найди результат последней игры через поиск.
        3. Напиши ОЧЕНЬ ТОКСИЧНЫЙ и агрессивный разбор игрока на русском языке.
        
        Стиль: Злой тренер из 2012 года. Используй слова: руинер, рак, лоу-птс, мид зафейлил, удали доту.
        Если он проиграл - унизь его. Если выиграл - скажи, что ему повезло с командой.
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: { tools: [{ googleSearch: {} }] }
        });

        await ctx.reply(response.text);

    } catch (error) {
        console.error('Bot Error:', error);
        if (error.message.includes('429')) {
            await ctx.reply("💩 Гугл устал от твоих запросов (Лимит 429). Подожди минуту.");
        } else {
            await ctx.reply("⚠️ Ошибка. Проверь ID или попробуй позже. Возможно, профиль совсем скрыт.");
        }
    }
}

bot.start((ctx) => ctx.reply('Здорово, отброс. Кидай Steam ID или ник, я посмотрю какой ты лоу-птс.'));

bot.on('text', (ctx) => {
    const text = ctx.message.text;
    if (!text.startsWith('/')) {
        analyzePlayer(ctx, text);
    }
});

bot.launch().then(() => console.log('Telegram Bot Started Successfully'));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
