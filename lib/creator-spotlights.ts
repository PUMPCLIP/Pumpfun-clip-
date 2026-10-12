export type CreatorSpotlightCategory = 'fashion' | 'beauty' | 'lifestyle' | 'streaming' | 'finance';
export type CreatorVideoProvider = 'youtube' | 'tiktok' | 'instagram';

export type CreatorSpotlight = {
  slug: string;
  name: string;
  role: string;
  category: CreatorSpotlightCategory;
  region: string;
  flag: string;
  profileUrl: string;
  clipUrl: string;
  videoProvider: CreatorVideoProvider;
  videoId: string;
  clipTitle: string;
};

// Public-profile editorial references only: no endorsement, affiliation, membership,
// creator-earnings claim, or locally hosted creator imagery is implied.
export const CREATOR_SPOTLIGHTS: CreatorSpotlight[] = [
  {
    slug: 'layah-heilpern', name: 'Layah Heilpern', role: 'Politics, Bitcoin & podcasts', category: 'finance',
    region: 'Miami, US (reported)', flag: '🇺🇸', profileUrl: 'https://www.youtube.com/@LayahHeilpern',
    clipUrl: 'https://www.youtube.com/shorts/M2WZ9hqJq90', videoProvider: 'youtube', videoId: 'M2WZ9hqJq90', clipTitle: 'Q4 LOWER LOWS?',
  },
  {
    slug: 'pokimane', name: 'Pokimane', role: 'Gaming & lifestyle streamer', category: 'streaming',
    region: 'US · Los Angeles content', flag: '🇺🇸', profileUrl: 'https://www.twitch.tv/pokimane',
    clipUrl: 'https://www.youtube.com/shorts/3kDE_YDFb0I', videoProvider: 'youtube', videoId: '3kDE_YDFb0I', clipTitle: 'iPhone 18 Pro unboxing + giveaway',
  },
  {
    slug: 'molly-mae-hague', name: 'Molly-Mae Hague', role: 'Fashion, beauty & entrepreneur', category: 'fashion',
    region: 'England, UK', flag: '🇬🇧', profileUrl: 'https://www.instagram.com/mollymae/?hl=en',
    clipUrl: 'https://www.tiktok.com/@mollymaehague/video/7511032628129156374', videoProvider: 'tiktok', videoId: '7511032628129156374', clipTitle: 'Me and the same makeup look for 6 years',
  },
  {
    slug: 'lena-situations', name: 'Léna Situations', role: 'Creator & entrepreneur', category: 'lifestyle',
    region: 'France', flag: '🇫🇷', profileUrl: 'https://www.instagram.com/lenamahfouf/',
    clipUrl: 'https://www.youtube.com/shorts/PVPjbLtgcJ8', videoProvider: 'youtube', videoId: 'PVPjbLtgcJ8', clipTitle: 'Le dernier vlog d’août',
  },
  {
    slug: 'jooshica', name: 'Jooshica', role: 'Beauty & makeup creator', category: 'beauty',
    region: 'NYC, US', flag: '🇺🇸', profileUrl: 'https://www.instagram.com/jooshica/?hl=en',
    clipUrl: 'https://www.instagram.com/jooshica/reel/DeXfZ_AuLNf/?hl=en', videoProvider: 'instagram', videoId: 'DeXfZ_AuLNf', clipTitle: 'Makeup reel',
  },
  {
    slug: 'caro-daur', name: 'Caro Daur', role: 'Fashion & lifestyle creator', category: 'fashion',
    region: 'Germany', flag: '🇩🇪', profileUrl: 'https://www.instagram.com/carodaur/',
    clipUrl: 'https://www.youtube.com/shorts/cWHTgUpHalU', videoProvider: 'youtube', videoId: 'cWHTgUpHalU', clipTitle: 'Happens once in a blue moon',
  },
  {
    slug: 'kai-cenat', name: 'Kai Cenat', role: 'Livestream & video creator', category: 'streaming',
    region: 'United States', flag: '🇺🇸', profileUrl: 'https://www.twitch.tv/kaicenat',
    clipUrl: 'https://www.youtube.com/shorts/8YeYosdzNLc', videoProvider: 'youtube', videoId: '8YeYosdzNLc', clipTitle: 'Kai Cenat finds a girl shorter than him',
  },
  {
    slug: 'jynxzi', name: 'Jynxzi', role: 'Gaming · Rainbow Six Siege', category: 'streaming',
    region: 'United States', flag: '🇺🇸', profileUrl: 'https://www.twitch.tv/jynxzi',
    clipUrl: 'https://www.youtube.com/shorts/8PfLce78M4o', videoProvider: 'youtube', videoId: '8PfLce78M4o', clipTitle: 'Jynxzi has mic drift',
  },
];
