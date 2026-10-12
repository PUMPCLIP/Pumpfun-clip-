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
  thumbnailUrl?: string;
};

// Editorial spotlights link to public profiles and source videos. No affiliation,
// endorsement, membership, or earnings claim is implied.
export const CREATOR_SPOTLIGHTS: CreatorSpotlight[] = [
  {
    slug: 'threadguy', name: 'Threadguy', role: 'Crypto streamer & host', category: 'finance',
    region: 'United States', flag: '🇺🇸', profileUrl: 'https://www.youtube.com/@notthreadguy',
    clipUrl: 'https://www.youtube.com/watch?v=l9v9wX7vhP8', videoProvider: 'youtube', videoId: 'l9v9wX7vhP8',
    clipTitle: "Threadguy on Crypto's Social Trading War", thumbnailUrl: 'https://i.ytimg.com/vi/l9v9wX7vhP8/hqdefault.jpg',
  },
  {
    slug: 'ansem', name: 'Ansem', role: 'Solana trader & commentator', category: 'finance',
    region: 'Global', flag: '🌐', profileUrl: 'https://x.com/blknoiz06',
    clipUrl: 'https://www.youtube.com/watch?v=Ahs7FL2-ldE', videoProvider: 'youtube', videoId: 'Ahs7FL2-ldE',
    clipTitle: "Chatting with Ansem, AKA 'The Solana Guy'", thumbnailUrl: 'https://i.ytimg.com/vi/Ahs7FL2-ldE/hqdefault.jpg',
  },
  {
    slug: 'ddg', name: 'DDG', role: 'Artist & live creator', category: 'lifestyle',
    region: 'United States', flag: '🇺🇸', profileUrl: 'https://www.youtube.com/@DDGMusicChannel',
    clipUrl: 'https://www.youtube.com/watch?v=piaNaqAxKA8', videoProvider: 'youtube', videoId: 'piaNaqAxKA8',
    clipTitle: 'Round & Round (Official Music Video)', thumbnailUrl: 'https://i.ytimg.com/vi/piaNaqAxKA8/maxresdefault.jpg',
  },
  {
    slug: 'layah-heilpern', name: 'Layah Heilpern', role: 'Bitcoin host & commentator', category: 'finance',
    region: 'UK · Global', flag: '🇬🇧', profileUrl: 'https://www.youtube.com/@LayahHeilpern',
    clipUrl: 'https://www.youtube.com/watch?v=KjupKsIltgY', videoProvider: 'youtube', videoId: 'KjupKsIltgY',
    clipTitle: 'Bitcoin vs. Gold: Peter Schiff vs. Layah Heilpern', thumbnailUrl: 'https://i.ytimg.com/vi/KjupKsIltgY/hqdefault.jpg',
  },
  {
    slug: 'pokimane', name: 'Pokimane', role: 'Gaming & lifestyle creator', category: 'streaming',
    region: 'Canada · United States', flag: '🇨🇦', profileUrl: 'https://www.youtube.com/@pokimane',
    clipUrl: 'https://www.youtube.com/watch?v=KPn-EYvQzRc', videoProvider: 'youtube', videoId: 'KPn-EYvQzRc',
    clipTitle: 'House hunting vlog, part two', thumbnailUrl: 'https://i.ytimg.com/vi/KPn-EYvQzRc/maxresdefault.jpg',
  },
  {
    slug: 'amouranth', name: 'Amouranth', role: 'IRL & livestream creator', category: 'streaming',
    region: 'United States', flag: '🇺🇸', profileUrl: 'https://www.youtube.com/@alsoamouranth9438',
    clipUrl: 'https://www.youtube.com/watch?v=Pdf2612Ibfk', videoProvider: 'youtube', videoId: 'Pdf2612Ibfk',
    clipTitle: "Amouranth's secret workout routine", thumbnailUrl: 'https://i.ytimg.com/vi/Pdf2612Ibfk/hqdefault.jpg',
  },
  {
    slug: 'kai-cenat', name: 'Kai Cenat', role: 'Livestream & video creator', category: 'streaming',
    region: 'United States', flag: '🇺🇸', profileUrl: 'https://www.youtube.com/@KaiCenat',
    clipUrl: 'https://www.youtube.com/watch?v=_jjcVAlKy1s', videoProvider: 'youtube', videoId: '_jjcVAlKy1s',
    clipTitle: 'Kai Cenat & Mike Epps talk on stream', thumbnailUrl: 'https://i.ytimg.com/vi/_jjcVAlKy1s/maxresdefault.jpg',
  },
  {
    slug: 'ishowspeed', name: 'IShowSpeed', role: 'Livestream & music creator', category: 'streaming',
    region: 'United States', flag: '🇺🇸', profileUrl: 'https://www.youtube.com/@IShowSpeed',
    clipUrl: 'https://www.youtube.com/watch?v=MsIvMhtPFwA', videoProvider: 'youtube', videoId: 'MsIvMhtPFwA',
    clipTitle: 'Higher (Official Music Video)', thumbnailUrl: 'https://i.ytimg.com/vi/MsIvMhtPFwA/maxresdefault.jpg',
  },
  {
    slug: 'jasontheween', name: 'Jasontheween', role: 'Streamer & IRL creator', category: 'streaming',
    region: 'United States', flag: '🇺🇸', profileUrl: 'https://www.youtube.com/@JasonTheWeenie',
    clipUrl: 'https://www.youtube.com/watch?v=RszX6U4zCOg', videoProvider: 'youtube', videoId: 'RszX6U4zCOg',
    clipTitle: 'I bought a $250,000 Porsche 911 Turbo S', thumbnailUrl: 'https://i.ytimg.com/vi/RszX6U4zCOg/hqdefault.jpg',
  },
  {
    slug: 'jynxzi', name: 'Jynxzi', role: 'Gaming & livestream creator', category: 'streaming',
    region: 'United States', flag: '🇺🇸', profileUrl: 'https://www.youtube.com/@Jynxzi',
    clipUrl: 'https://www.youtube.com/watch?v=cjXeGy95LHk', videoProvider: 'youtube', videoId: 'cjXeGy95LHk',
    clipTitle: 'Jynxzi Podcast: Sketch', thumbnailUrl: 'https://i.ytimg.com/vi/cjXeGy95LHk/maxresdefault.jpg',
  },
  {
    slug: 'plaqueboymax', name: 'PlaqueBoyMax', role: 'Music & livestream creator', category: 'streaming',
    region: 'United States', flag: '🇺🇸', profileUrl: 'https://www.youtube.com/@PlaqueBoyMax',
    clipUrl: 'https://www.youtube.com/watch?v=yrGeVIWpmQk', videoProvider: 'youtube', videoId: 'yrGeVIWpmQk',
    clipTitle: 'PlaqueBoyMax meets Ye', thumbnailUrl: 'https://i.ytimg.com/vi/yrGeVIWpmQk/hqdefault.jpg',
  },
  {
    slug: 'molly-mae-hague', name: 'Molly-Mae Hague', role: 'Fashion & beauty entrepreneur', category: 'fashion',
    region: 'England, UK', flag: '🇬🇧', profileUrl: 'https://www.youtube.com/@mollymae9879',
    clipUrl: 'https://www.youtube.com/watch?v=sD1jNrCUDec', videoProvider: 'youtube', videoId: 'sD1jNrCUDec',
    clipTitle: 'Hello October: a cosy at-home vlog', thumbnailUrl: 'https://i.ytimg.com/vi/sD1jNrCUDec/sddefault.jpg',
  },
  {
    slug: 'lena-situations', name: 'Léna Situations', role: 'Fashion & lifestyle creator', category: 'lifestyle',
    region: 'France · Global', flag: '🇫🇷', profileUrl: 'https://www.instagram.com/lenamahfouf/',
    clipUrl: 'https://www.youtube.com/shorts/PVPjbLtgcJ8', videoProvider: 'youtube', videoId: 'PVPjbLtgcJ8',
    clipTitle: "Le dernier vlog d'août", thumbnailUrl: 'https://i.ytimg.com/vi/PVPjbLtgcJ8/maxresdefault.jpg',
  },
  {
    slug: 'jooshica', name: 'Jooshica', role: 'Beauty & makeup creator', category: 'beauty',
    region: 'New York, US', flag: '🇺🇸', profileUrl: 'https://www.youtube.com/@jooshica6178',
    clipUrl: 'https://www.youtube.com/watch?v=WwKmXFBmWJU', videoProvider: 'youtube', videoId: 'WwKmXFBmWJU',
    clipTitle: 'Must-have makeup products for 2025', thumbnailUrl: 'https://i.ytimg.com/vi/WwKmXFBmWJU/hq720.jpg',
  },
  {
    slug: 'caro-daur', name: 'Caro Daur', role: 'Fashion & lifestyle creator', category: 'fashion',
    region: 'Germany', flag: '🇩🇪', profileUrl: 'https://www.instagram.com/carodaur/',
    clipUrl: 'https://www.youtube.com/shorts/cWHTgUpHalU', videoProvider: 'youtube', videoId: 'cWHTgUpHalU',
    clipTitle: 'Happens once in a blue moon', thumbnailUrl: 'https://i.ytimg.com/vi/cWHTgUpHalU/maxresdefault.jpg',
  },
];
