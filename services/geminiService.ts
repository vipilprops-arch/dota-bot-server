
import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResponse, MatchData } from "../types";

export interface ProfileData {
  personaName: string;
  rankTier: number;
  winrate: string;
  recentHeroes: string[];
  status: string;
  laneRecommendation: string;
  playerSummary: string;
}

export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  private convertToAccountID(id: string): string {
    try {
      if (id.length > 15) {
        const steam64 = BigInt(id);
        const offset = BigInt("76561197960265728");
        return (steam64 - offset).toString();
      }
      return id;
    } catch (e) {
      return id;
    }
  }

  private async resolveIdentity(input: string, steps: string[]): Promise<string> {
    if (/^\d+$/.test(input) && input.length > 5) return input;
    
    steps.push(`🔍 Поиск SteamID через Google...`);
    const prompt = `Find the 17-digit SteamID64 for: "${input}". Return ONLY numbers.`;

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: { tools: [{ googleSearch: {} }] }
      });
      const resolved = response.text.trim().match(/\d{17}/);
      if (resolved) {
        steps.push(`✅ ID найден: ${resolved[0]}`);
        return resolved[0];
      }
    } catch (e) {
      steps.push("⚠️ Поиск не дал результатов.");
    }
    return input;
  }

  async fetchAndAnalyzeProfile(input: string, steps: string[]): Promise<ProfileData> {
    const rawId = await this.resolveIdentity(input, steps);
    const steam32 = this.convertToAccountID(rawId);
    
    steps.push(`📡 Проверка OpenDota API...`);

    try {
      const playerRes = await fetch(`https://api.opendota.com/api/players/${steam32}`);
      const player = await playerRes.json();

      if (player.profile) {
        const wlRes = await fetch(`https://api.opendota.com/api/players/${steam32}/wl`);
        const wl = await wlRes.json();
        const winrate = wl.win + wl.lose > 0 ? ((wl.win / (wl.win + wl.lose)) * 100).toFixed(1) + "%" : "??%";

        const response = await this.ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: `Analyze player: ${player.profile.personaname}, winrate ${winrate}. Provide toxic dota summary.`,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: { lane: { type: Type.STRING }, summary: { type: Type.STRING } },
              required: ["lane", "summary"]
            }
          }
        });

        const aiResult = JSON.parse(response.text || "{}");
        return {
          personaName: player.profile.personaname,
          rankTier: player.rank_tier || 0,
          winrate,
          recentHeroes: [],
          status: "API Online",
          laneRecommendation: aiResult.lane,
          playerSummary: aiResult.summary
        };
      } else {
        throw new Error("API Hidden");
      }
    } catch (e) {
      return this.deepWebAnalyze(steam32, rawId, steps);
    }
  }

  private async deepWebAnalyze(steam32: string, steam64: string, steps: string[]): Promise<ProfileData> {
    steps.push(`🌐 Глубокий поиск Dotabuff/Stratz...`);
    const prompt = `Search for Dota 2 player ${steam32} on Dotabuff. Extract nickname, winrate, and give a toxic summary in JSON.`;

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: { tools: [{ googleSearch: {} }], responseMimeType: "application/json" }
      });

      const res = JSON.parse(response.text || "{}");
      return {
        personaName: res.name || "Hidden Player",
        rankTier: 0,
        winrate: res.winrate || "??",
        recentHeroes: [],
        status: "Web Scraped",
        laneRecommendation: res.lane || "Лес",
        playerSummary: res.summary || "Скрытый мусор."
      };
    } catch (err) {
      throw err;
    }
  }

  async analyzeMatch(input: string, matchId?: string, patch: string = "7.40b", sentiment?: string, steps: string[] = []): Promise<AnalysisResponse> {
    const rawId = await this.resolveIdentity(input, steps);
    const steam32 = this.convertToAccountID(rawId);

    try {
      const res = await fetch(`https://api.opendota.com/api/players/${steam32}/recentMatches`);
      const matches = await res.json();

      if (matches && matches.length > 0) {
        const match = matches[0];
        const win = (match.radiant_win && match.player_slot < 128) || (!match.radiant_win && match.player_slot >= 128);
        
        const aiRes = await this.ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: `Analyze match: Hero ID ${match.hero_id}, Result: ${win ? 'Win' : 'Loss'}. Toxic advice.`,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: { hero: { type: Type.STRING }, tip: { type: Type.STRING }, summary: { type: Type.STRING } },
              required: ["hero", "tip", "summary"]
            }
          }
        });

        const result = JSON.parse(aiRes.text || "{}");
        return {
          summary: result.summary,
          result: win ? 'Win' : 'Loss',
          details: {
            hero: result.hero,
            result: win ? 'Win' : 'Loss',
            kda: `${match.kills}/${match.deaths}/${match.assists}`,
            duration: `${Math.floor(match.duration / 60)}m`,
            date: "Последняя",
            link: `https://www.dotabuff.com/matches/${match.match_id}`,
            coachTip: result.tip
          },
          steps: [...steps, "✅ Готово."]
        };
      } else {
        throw new Error("No API matches");
      }
    } catch (e) {
      return this.matchWebAnalyze(steam32, steps);
    }
  }

  private async matchWebAnalyze(accountId: string, steps: string[]): Promise<AnalysisResponse> {
    const prompt = `Search latest match for Dota 2 player ${accountId} on Dotabuff. Return JSON: {hero, win:bool, kda, tip, summary, duration}`;
    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: { tools: [{ googleSearch: {} }], responseMimeType: "application/json" }
      });
      const res = JSON.parse(response.text || "{}");
      return {
        summary: res.summary,
        result: res.win ? 'Win' : 'Loss',
        details: {
          hero: res.hero || "Unknown",
          result: res.win ? 'Win' : 'Loss',
          kda: res.kda || "??",
          duration: res.duration || "??",
          date: "Web Search",
          link: `https://www.dotabuff.com/players/${accountId}/matches`,
          coachTip: res.tip
        },
        steps: [...steps, "✅ Найдено через Google."]
      };
    } catch (err) {
      throw err;
    }
  }
}

export const geminiService = new GeminiService();
