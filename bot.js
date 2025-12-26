const { Telegraf } = require('telegraf');
const { GoogleGenAI } = require('@google/genai');
const fetch = require('node-fetch');

// Берем ключи из настроек сервера (Render)
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
const bot = new Telegraf(process.env.TELEGRAM_TOKEN);

async function analyzePlayer(ctx, input) {
    ctx.sendChatAction('typing');
    
    // Промпт для ИИ: найти инфу об игроке и его последнем матче
    const prompt = `
    Find Dota 2 player info for: ${input}. 
    Use Google Search to find their Dotabuff or Stratz profile.
    Identify the LAST match result (Win/Loss), Hero, and KDA.
    Return the result in Russian. Be a toxic Dota 2 coach.
    `;

    try {
        const result = await ai.models.generateContent({
            model: 'gemini-3-pro-image-preview',
            contents: prompt,
            config: { tools: [{ googleSearch: {} }] }
        });

        ctx.reply(result.text, { parse_mode: 'Markdown' });
    } catch (e) {
        console.error(e);
        ctx.reply("❌ Ошибка. Либо профиль скрыт, либо ИИ не смог найти инфу. Попробуй ввести точный SteamID.");
    }
}

bot.start((ctx) => ctx.reply('Пришли мне ник игрока или SteamID, и я разберу его последнюю игру!'));
bot.on('text', (ctx) => analyzePlayer(ctx, ctx.message.text));

bot.launch();
console.log('Бот запущен...');