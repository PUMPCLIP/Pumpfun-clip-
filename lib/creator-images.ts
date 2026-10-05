const CREATOR_PORTRAITS = [
  '/creators/creator-studio-01.jpeg',
  '/creators/creator-studio-02.jpeg',
  '/creators/creator-studio-03.jpeg',
  '/creators/creator-studio-04.jpeg',
  '/creators/creator-studio-05.jpeg',
  '/creators/creator-studio-06.jpeg',
] as const;

export function creatorPortrait(seed: string | undefined, index = 0) {
  const value = String(seed || 'creator');
  const hash = Array.from(value).reduce((total, character) => total + character.charCodeAt(0), 0);
  return CREATOR_PORTRAITS[(hash + index) % CREATOR_PORTRAITS.length];
}

export const creatorPortraits = CREATOR_PORTRAITS;
