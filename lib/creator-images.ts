const CREATOR_PORTRAITS = [
  '/creators/creator-studio-01.webp',
  '/creators/creator-studio-02.webp',
  '/creators/creator-studio-03.webp',
  '/creators/creator-studio-04.webp',
  '/creators/creator-studio-05.webp',
  '/creators/creator-studio-06.webp',
] as const;

export function creatorPortrait(seed: string | undefined, index = 0) {
  const value = String(seed || 'creator');
  const hash = Array.from(value).reduce((total, character) => total + character.charCodeAt(0), 0);
  return CREATOR_PORTRAITS[(hash + index) % CREATOR_PORTRAITS.length];
}

export const creatorPortraits = CREATOR_PORTRAITS;
