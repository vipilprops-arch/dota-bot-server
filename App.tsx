
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { geminiService, ProfileData } from './services/geminiService';
import { MatchData, AnalysisResponse } from './types';

interface Message {
  id: string;
  type: 'user' | 'bot' | 'system';
  text?: string;
  profile?: ProfileData;
  match?: MatchData;
  isLoading?: boolean;
}

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      type: 'bot',
      text: '👋 Привет! Я — твой персональный Dota 2 Тренер (и по совместительству токсичный критик).\n\nОтправь мне Steam ID, ссылку на профиль или просто ник, и я выверну твою подноготную.\n\nКоманды:\n/check [id] — Полный пробив\n/track [id] — Включить слежку\n/stop — Остановить всё'
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isBotTyping, setIsBotTyping] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [trackingId, setTrackingId] = useState('');
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const lastMatchIdRef = useRef<string | null>(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages, isBotTyping]);

  const addMessage = (msg: Omit<Message, 'id'>) => {
    setMessages(prev => [...prev, { ...msg, id: Date.now().toString() }]);
  };

  const processAnalysis = async (id: string, sentiment?: 'trash' | 'ok') => {
    setIsBotTyping(true);
    const steps: string[] = [];
    
    // Системное сообщение о начале поиска
    const systemId = Date.now().toString();
    setMessages(prev => [...prev, { id: systemId, type: 'system', text: '🔍 Запуск глубокого поиска данных...' }]);

    try {
      // 1. Профиль
      const profile = await geminiService.fetchAndAnalyzeProfile(id, steps);
      addMessage({ type: 'bot', profile });

      // 2. Матч
      const result = await geminiService.analyzeMatch(id, undefined, '7.40b', sentiment, steps);
      addMessage({ type: 'bot', match: result.details });
      
      if (result.details.matchId) {
        lastMatchIdRef.current = result.details.matchId;
      }
    } catch (err: any) {
      addMessage({ type: 'bot', text: `❌ Ошибка: ${err.message || "Не удалось пробить этот аккаунт. Видимо, он слишком глубоко на дне."}` });
    } finally {
      setIsBotTyping(false);
      // Убираем системное сообщение после завершения
      setMessages(prev => prev.filter(m => m.id !== systemId));
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputValue.trim() || isBotTyping) return;

    const text = inputValue.trim();
    setInputValue('');
    addMessage({ type: 'user', text });

    if (text.startsWith('/start')) {
      addMessage({ type: 'bot', text: 'Я готов. Скидывай жертву для анализа.' });
    } else if (text.startsWith('/stop')) {
      setIsTracking(false);
      addMessage({ type: 'bot', text: '🛑 Трекинг остановлен. Твои тиммейты могут вздохнуть спокойно.' });
    } else if (text.startsWith('/track')) {
      const id = text.split(' ')[1];
      if (!id) {
        addMessage({ type: 'bot', text: 'Укажи ID: /track 765611...' });
      } else {
        setTrackingId(id);
        setIsTracking(true);
        addMessage({ type: 'bot', text: `🛰 Начинаю слежку за ${id}. Как только он доиграет, я пришлю разнос.` });
      }
    } else {
      // Обычный ввод воспринимаем как ID/Ник для чека
      const id = text.replace('/check ', '');
      await processAnalysis(id);
    }
  };

  // Polling для трекинга
  useEffect(() => {
    let interval: any;
    if (isTracking && trackingId) {
      const poll = async () => {
        try {
          const accId = trackingId.match(/\d+/) ? trackingId : "";
          if (!accId) return;
          const res = await fetch(`https://api.opendota.com/api/players/${accId}/recentMatches`);
          const matches = await res.json();
          if (matches && matches.length > 0) {
            const latestId = matches[0].match_id.toString();
            if (latestId !== lastMatchIdRef.current) {
              lastMatchIdRef.current = latestId;
              addMessage({ type: 'system', text: '🔔 Новая игра обнаружена! Анализирую...' });
              await processAnalysis(trackingId);
            }
          }
        } catch (e) {}
      };
      poll();
      interval = setInterval(poll, 60000 * 5); // Каждые 5 минут
    }
    return () => clearInterval(interval);
  }, [isTracking, trackingId]);

  return (
    <div className="flex flex-col h-screen bg-[#0e1621] text-[#f5f5f5] font-sans overflow-hidden">
      {/* TG Header */}
      <header className="bg-[#242f3d] h-14 flex items-center px-4 shadow-md z-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-indigo-500 flex items-center justify-center text-white font-bold text-lg shadow-lg">
            D
          </div>
          <div>
            <h1 className="text-sm font-bold">Dota Analyst Bot</h1>
            <p className="text-[10px] text-green-400">
              {isBotTyping ? 'печатает...' : isTracking ? 'следит за игроком' : 'в сети'}
            </p>
          </div>
        </div>
      </header>

      {/* Messages Area */}
      <main className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-gray-700 bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat">
        <div className="max-w-2xl mx-auto space-y-4">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'} animate-fadeIn`}>
              {msg.type === 'system' ? (
                <div className="w-full flex justify-center">
                  <span className="bg-[#1c2a3d]/80 text-[10px] py-1 px-3 rounded-full text-gray-400 border border-gray-700">
                    {msg.text}
                  </span>
                </div>
              ) : (
                <div className={`max-w-[85%] rounded-2xl p-3 shadow-lg relative ${
                  msg.type === 'user' 
                    ? 'bg-[#2b5278] rounded-tr-none' 
                    : 'bg-[#182533] rounded-tl-none border border-gray-800'
                }`}>
                  {msg.text && <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.text}</p>}
                  
                  {msg.profile && (
                    <div className="space-y-3">
                      <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider">Steam Profile Verified</p>
                      <div className="space-y-2">
                        <p className="font-black text-xl">{msg.profile.personaName}</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="bg-black/20 p-2 rounded">
                            <p className="text-[9px] text-gray-400 uppercase">Winrate</p>
                            <p className="font-bold text-green-400">{msg.profile.winrate}</p>
                          </div>
                          <div className="bg-black/20 p-2 rounded">
                            <p className="text-[9px] text-gray-400 uppercase">Rank</p>
                            <p className="font-bold text-yellow-500">{msg.profile.rankTier || "Unranked"}</p>
                          </div>
                        </div>
                        <div className="bg-indigo-500/10 p-2 rounded border border-indigo-500/20">
                          <p className="text-[9px] text-indigo-300 font-bold uppercase">Твоя линия:</p>
                          <p className="text-xs font-bold text-indigo-100">{msg.profile.laneRecommendation}</p>
                        </div>
                        <div className="p-2 bg-black/30 rounded border-l-2 border-red-500/50">
                          <p className="text-[9px] text-red-400 font-bold uppercase italic">Вердикт:</p>
                          <p className="text-[11px] text-gray-300 italic">"{msg.profile.playerSummary}"</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {msg.match && (
                    <div className="space-y-3">
                      <div className="flex justify-between border-b border-white/5 pb-1">
                        <span className="text-gray-400 uppercase text-[9px]">Последняя игра</span>
                        <span className={msg.match.result === 'Win' ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                          {msg.match.result === 'Win' ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ'}
                        </span>
                      </div>
                      <p className="text-sm">Герой: <b className="text-indigo-400">{msg.match.hero}</b></p>
                      <p className="text-xs text-gray-400">KDA: <code className="text-yellow-500">{msg.match.kda}</code> | {msg.match.duration}</p>
                      
                      {msg.match.coachTip ? (
                        <div className="mt-3 p-3 bg-indigo-500/10 border-l-2 border-indigo-500 rounded text-[12px] leading-relaxed text-indigo-100 italic">
                          {msg.match.coachTip}
                        </div>
                      ) : (
                        <div className="flex gap-2 mt-2">
                          <button 
                            onClick={() => processAnalysis(trackingId || inputValue, 'trash')}
                            className="flex-1 bg-red-600/20 text-red-400 py-1.5 rounded text-[10px] font-bold border border-red-500/30"
                          >
                            ТИММЕЙТЫ — МУСОР
                          </button>
                          <button 
                            onClick={() => processAnalysis(trackingId || inputValue, 'ok')}
                            className="flex-1 bg-green-600/20 text-green-400 py-1.5 rounded text-[10px] font-bold border border-green-500/30"
                          >
                            БЫЛО НОРМАЛЬНО
                          </button>
                        </div>
                      )}
                      <a href={msg.match.link} target="_blank" className="block text-center text-[10px] text-indigo-400 hover:underline mt-2">
                        Открыть на Dotabuff →
                      </a>
                    </div>
                  )}

                  <span className="text-[9px] text-gray-500 absolute bottom-1 right-2">
                    {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              )}
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
      </main>

      {/* TG Input */}
      <footer className="bg-[#242f3d] p-3 shrink-0">
        <form onSubmit={handleSend} className="max-w-2xl mx-auto flex gap-2">
          <input 
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Введите ник или Steam ID..."
            className="flex-1 bg-[#17212b] border-none rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all placeholder:text-gray-600"
          />
          <button 
            type="submit"
            disabled={!inputValue.trim() || isBotTyping}
            className="bg-[#2b5278] hover:bg-indigo-600 p-3 rounded-full text-white transition-all disabled:opacity-30 shadow-lg shadow-black/20"
          >
            <svg className="w-6 h-6 rotate-90" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
            </svg>
          </button>
        </form>
      </footer>
    </div>
  );
};

export default App;
