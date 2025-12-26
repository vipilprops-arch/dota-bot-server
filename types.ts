
export interface MatchData {
  hero: string;
  result: 'Win' | 'Loss';
  kda: string;
  duration: string;
  date: string;
  link: string;
  matchId?: string;
  items?: string[];
  coachTip?: string;
  analysisError?: string;
  role?: string;
  teammateSentiment?: 'trash' | 'ok';
}

export interface AnalysisResponse {
  summary: string;
  result: 'Win' | 'Loss';
  details: MatchData;
  steps: string[];
}
