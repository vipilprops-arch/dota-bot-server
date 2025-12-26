
const { Telegraf } = require('telegraf');
const { GoogleGenAI } = require('@google/genai');
const fetch = require('node-fetch');
const http = require('http');

// 1. СЕРВЕР ДЛЯ RENDER (Обязательно для Free Tier)
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Bot is active');
}).listen(PORT, '0.0.0.0', () => {
    console.log(`[System] Health check listening on port ${PORT}`);
});

// 2. ИНИЦИАЛИЗАЦИЯ
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
const bot = new Telegraf(process.env.TELEGRAM_TOKEN);

const trackedPlayers = new Map(); // Храним тех, за кем следим

function to32(id) {
    if (!id) return null;
    const clean = id.replace(/\D/g, '');
    if (clean.length < 10) return clean;
    try {
        return (BigInt(clean) - BigInt("76561197960265728")).toString();
    } catch (e) { return clean; }
}

async function checkMatches(chatId, steamId) {
    const id32 = to32(steamId);
    try {
        const res = await fetch(`https://api.opendota.com/api/players/${id32}/recentMatches`);
        const matches = await res.json();
        
        if (Array.isArray(matches) && matches.length > 0) {
            const lastMatch = matches[0];
            const lastSavedMatchId = trackedPlayers.get(steamId)?.lastMatchId;

            // Если появился новый матч
            if (lastMatch.match_id.toString() !== lastSavedMatchId) {
                console.log(`[Event] New match found for ${steamId}`);
                
                const win = (lastMatch.radiant_win && lastMatch.player_slot < 128) || (!lastMatch.radiant_win && lastMatch.player_slot >= 128);
                
                // Просим ИИ сделать разбор
                const prompt = `
                Игрок: ${steamId}. Последний матч: ${win ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ'}. 
                KDA: ${lastMatch.kills}/${lastMatch.deaths}/${lastMatch.assists}.
                Герой ID: ${lastMatch.hero_id}.
                
                Задание: Найди этот матч на Dotabuff (https://www.dotabuff.com/matches/${lastMatch.match_id}) через поиск.
                Напиши ОЧЕНЬ ТОКСИЧНЫЙ и злой комментарий на русском. 
                Если он выиграл — скажи, что его протащили. Если проиграл — унизь за кривые руки.
                Используй сленг: рак, руинер, лоу-птс, мусор.
                `;

                const response = await ai.models.generateContent({
                    model: 'gemini-3-flash-preview',
                    contents: prompt,
                    config: { tools: [{ googleSearch: {} }] }
                });

                await bot.telegram.sendMessage(chatId, `🔔 СВЕЖИЙ РУИН ОБНАРУЖЕН!\n\n${response.text}`);
                
                // Обновляем ID последнего матча
                trackedPlayers.set(steamId, { ...trackedPlayers.get(steamId), lastMatchId: lastMatch.match_id.toString() });
            }
        }
    } catch (e) {
        console.error("Tracking error:", e);
    }
}

bot.start((ctx) => ctx.reply('Здорово. Пришли Steam ID, и я начну слежку за твоими руинами.'));

bot.on('text', async (ctx) => {
    const text = ctx.message.text;
    if (text.startsWith('/')) return;

    const id32 = to32(text);
    if (!id32) return ctx.reply('Это не похоже на Steam ID.');

    // Добавляем в список отслеживания
    trackedPlayers.set(text, { chatId: ctx.chat.id, lastMatchId: null });
    ctx.reply(`🛰 Начинаю слежку за аккаунтом ${text}. Как только игра закончится — я пришлю разбор.`);
    
    // Сразу проверяем один раз
    await checkMatches(ctx.chat.id, text);
});

// Запускаем цикл проверки раз в 2 минуты
setInterval(() => {
    for (const [steamId, data] of trackedPlayers.entries()) {
        checkMatches(data.chatId, steamId);
    }
}, 120000);

bot.launch().then(() => console.log('--- Бот запущен ---'));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
